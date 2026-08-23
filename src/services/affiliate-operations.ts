import type { Context } from 'hono'
import { decryptSecret } from '../lib/crypto.js'
import { getDatabase } from '../lib/db.js'
import { AppError } from '../lib/errors.js'
import type { AppBindings } from '../lib/types.js'
import { assertMonthlyQuota, recordUsage } from '../lib/usage.js'
import {
  convertShopeeLinks,
  getShopeeConversionReport,
  isShopeeAuthError,
  type ConversionReportInput,
  type ConvertLinksInput,
} from './shopee.js'

type ConnectionRow = {
  id: string
  name: string
  encrypted_cookie: string
  status: string
}

type BatchCustomLinkItem = {
  shortLink?: string | null
  longLink?: string | null
  failCode?: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toFiniteNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

async function getConnection(c: Context<AppBindings>, connectionId?: string): Promise<ConnectionRow> {
  const auth = c.get('auth')
  const sql = getDatabase(c.env)
  const rows = connectionId
    ? await sql<ConnectionRow[]>`
        select id::text, name, encrypted_cookie, status
        from camlink.shopee_connections
        where id = ${connectionId}::uuid
          and workspace_id = ${auth.workspaceId}::uuid
          and deleted_at is null
        limit 1
      `
    : await sql<ConnectionRow[]>`
        select id::text, name, encrypted_cookie, status
        from camlink.shopee_connections
        where workspace_id = ${auth.workspaceId}::uuid
          and deleted_at is null
        order by is_default desc, created_at asc
        limit 1
      `

  if (!rows[0]) throw new AppError(404, 'SHOPEE_CONNECTION_NOT_FOUND', 'Chưa có tài khoản Shopee phù hợp')
  return rows[0]
}

async function getConnectionCookie(c: Context<AppBindings>, connection: ConnectionRow): Promise<string> {
  if (!c.env.COOKIE_ENCRYPTION_KEY) throw new AppError(503, 'ENCRYPTION_NOT_CONFIGURED', 'Máy chủ chưa cấu hình khóa mã hóa')
  try {
    return await decryptSecret(connection.encrypted_cookie, c.env.COOKIE_ENCRYPTION_KEY)
  } catch {
    throw new AppError(503, 'COOKIE_DECRYPTION_FAILED', 'Không thể đọc phiên Shopee đã lưu')
  }
}

async function updateConnectionHealth(
  c: Context<AppBindings>,
  connectionId: string,
  status: 'connected' | 'expired' | 'error',
  errorCode?: string,
): Promise<void> {
  const sql = getDatabase(c.env)
  await sql`
    update camlink.shopee_connections
    set status = ${status}, last_checked_at = now(), last_error_code = ${errorCode || null}, updated_at = now()
    where id = ${connectionId}::uuid
  `
}

async function handleShopeeFailure(
  c: Context<AppBindings>,
  connectionId: string,
  operation: string,
  status: number,
  payload: unknown,
): Promise<never> {
  if (isShopeeAuthError(status, payload)) {
    await updateConnectionHealth(c, connectionId, 'expired', 'SHOPEE_SESSION_EXPIRED')
    await recordUsage(c, operation, status, { billable: false, metadata: { connectionId, reason: 'expired' } })
    throw new AppError(422, 'SHOPEE_SESSION_EXPIRED', 'Cookie Shopee đã hết hạn hoặc không hợp lệ')
  }

  await updateConnectionHealth(c, connectionId, 'error', `HTTP_${status}`)
  await recordUsage(c, operation, status, { billable: false, metadata: { connectionId } })
  throw new AppError(502, 'SHOPEE_UPSTREAM_ERROR', 'Shopee đang từ chối hoặc không thể xử lý yêu cầu')
}

export async function performLinkConversion(
  c: Context<AppBindings>,
  input: ConvertLinksInput & { connectionId?: string },
): Promise<unknown> {
  await assertMonthlyQuota(c)
  const auth = c.get('auth')
  const connection = await getConnection(c, input.connectionId)
  const cookie = await getConnectionCookie(c, connection)
  const result = await convertShopeeLinks(cookie, input, c.env.SHOPEE_BASE_API)

  if (result.status < 200 || result.status >= 300 || isShopeeAuthError(result.status, result.data)) {
    return handleShopeeFailure(c, connection.id, 'convert_link', result.status, result.data)
  }

  const root = asRecord(result.data)
  const data = asRecord(root.data)
  const convertedItems = asArray(data.batchCustomLink) as BatchCustomLinkItem[]
  const sql = getDatabase(c.env)

  await sql.begin(async (transaction) => {
    const batches = await transaction<{ id: string }[]>`
      insert into camlink.link_batches (
        workspace_id, user_id, shopee_connection_id, sub_id_1, sub_id_2, sub_id_3, sub_id_4, sub_id_5, item_count
      ) values (
        ${auth.workspaceId}::uuid,
        ${auth.userId}::uuid,
        ${connection.id}::uuid,
        ${input.subId1 || ''},
        ${input.subId2 || ''},
        ${input.subId3 || ''},
        ${input.subId4 || ''},
        ${input.subId5 || ''},
        ${input.originalLinks.length}
      ) returning id::text
    `
    const batchId = batches[0].id

    for (let index = 0; index < input.originalLinks.length; index += 1) {
      const item = convertedItems[index] || {}
      await transaction`
        insert into camlink.link_results (batch_id, workspace_id, original_link, short_link, long_link, fail_code)
        values (
          ${batchId}::uuid,
          ${auth.workspaceId}::uuid,
          ${input.originalLinks[index]},
          ${item.shortLink || null},
          ${item.longLink || null},
          ${Number(item.failCode ?? -1)}
        )
      `
    }
  })

  await updateConnectionHealth(c, connection.id, 'connected')
  await recordUsage(c, 'convert_link', result.status, {
    metadata: { connectionId: connection.id, linkCount: input.originalLinks.length },
  })

  return { ...root, meta: { connectionId: connection.id, connectionName: connection.name } }
}

async function persistConversionRecords(
  c: Context<AppBindings>,
  connectionId: string,
  payload: unknown,
): Promise<number> {
  const auth = c.get('auth')
  const root = asRecord(payload)
  const list = asArray(asRecord(root.data).list)
  if (list.length === 0) return 0

  const sql = getDatabase(c.env)
  await sql.begin(async (transaction) => {
    for (const rawEntry of list) {
      const entry = asRecord(rawEntry)
      const checkoutId = String(entry.checkout_id || '')
      if (!checkoutId) continue

      const orders = asArray(entry.orders)
      let orderValueInternal = 0
      for (const rawOrder of orders) {
        const order = asRecord(rawOrder)
        for (const rawItem of asArray(order.items)) {
          const item = asRecord(rawItem)
          const quantity = Math.max(1, toFiniteNumber(item.qty))
          const actualAmount = toFiniteNumber(item.actual_amount)
          orderValueInternal += actualAmount > 0 ? actualAmount : toFiniteNumber(item.item_price) * quantity
        }
      }

      await transaction`
        insert into camlink.conversion_records (
          workspace_id,
          shopee_connection_id,
          checkout_id,
          purchase_time,
          conversion_status,
          source,
          order_count,
          order_value_internal,
          estimated_commission_internal,
          payload,
          last_synced_at
        ) values (
          ${auth.workspaceId}::uuid,
          ${connectionId}::uuid,
          ${checkoutId},
          to_timestamp(${toFiniteNumber(entry.purchase_time)}),
          ${toFiniteNumber(entry.conversion_status)},
          ${String(entry.direct_source || entry.utm_content || '')},
          ${orders.length},
          ${String(orderValueInternal)},
          ${String(toFiniteNumber(entry.estimated_total_commission))},
          ${transaction.json(entry as Parameters<typeof transaction.json>[0])},
          now()
        )
        on conflict (shopee_connection_id, checkout_id) do update set
          purchase_time = excluded.purchase_time,
          conversion_status = excluded.conversion_status,
          source = excluded.source,
          order_count = excluded.order_count,
          order_value_internal = excluded.order_value_internal,
          estimated_commission_internal = excluded.estimated_commission_internal,
          payload = excluded.payload,
          last_synced_at = now()
      `
    }
  })

  return list.length
}

function filterConversionEntries(entries: unknown[], input: ConversionReportInput): unknown[] {
  const orderQuery = input.orderId?.trim().toLowerCase()
  return entries.filter((rawEntry) => {
    const entry = asRecord(rawEntry)
    const status = toFiniteNumber(entry.conversion_status || entry.checkout_status_app)
    if (input.status !== undefined && status !== input.status) return false
    if (!orderQuery) return true

    const orderIdentifiers = [String(entry.checkout_id || '')]
    for (const rawOrder of asArray(entry.orders)) {
      const order = asRecord(rawOrder)
      orderIdentifiers.push(String(order.order_sn || ''), String(order.order_id || ''))
    }
    return orderIdentifiers.some((value) => value.toLowerCase() === orderQuery)
  })
}

export async function performConversionReport(
  c: Context<AppBindings>,
  input: ConversionReportInput & { connectionId?: string },
): Promise<unknown> {
  await assertMonthlyQuota(c)
  const connection = await getConnection(c, input.connectionId)
  const cookie = await getConnectionCookie(c, connection)
  const result = await getShopeeConversionReport(cookie, input, c.env.SHOPEE_BASE_API)

  if (result.status < 200 || result.status >= 300 || isShopeeAuthError(result.status, result.data)) {
    return handleShopeeFailure(c, connection.id, 'conversion_report', result.status, result.data)
  }

  const syncedRecords = await persistConversionRecords(c, connection.id, result.data)
  const root = asRecord(result.data)
  const data = asRecord(root.data)
  const filteredList = filterConversionEntries(asArray(data.list), input)
  await updateConnectionHealth(c, connection.id, 'connected')
  await recordUsage(c, 'conversion_report', result.status, {
    metadata: { connectionId: connection.id, page: input.page, syncedRecords },
  })

  return {
    ...root,
    data: { ...data, list: filteredList },
    meta: { connectionId: connection.id, connectionName: connection.name, syncedRecords, returnedRecords: filteredList.length },
  }
}
