import { z } from 'zod'
import { createRouter } from '../../lib/create-app.js'
import { requireSession, requireTrustedOrigin } from '../../lib/auth.js'
import { decryptSecret, encryptSecret, randomToken, sha256 } from '../../lib/crypto.js'
import { getDatabase } from '../../lib/db.js'
import { AppError } from '../../lib/errors.js'
import { parseShopeeCookieFile } from '../../lib/shopee-cookie.js'
import { performConversionReport, performLinkConversion } from '../../services/affiliate-operations.js'
import { getShopeeConversionReport, isShopeeAuthError } from '../../services/shopee.js'

const connectionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  cookieJson: z.string().min(2).max(512_000),
  isDefault: z.boolean().optional(),
})

const connectionUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  cookieJson: z.string().min(2).max(512_000).optional(),
  isDefault: z.boolean().optional(),
})

const subIdSchema = z.string().max(100).regex(/^[A-Za-z0-9]*$/, 'Sub ID chỉ được chứa chữ và số').optional()

const convertSchema = z.object({
  connectionId: z.string().uuid().optional(),
  originalLinks: z.array(z.string().url()).min(1).max(5),
  subId1: subIdSchema,
  subId2: subIdSchema,
  subId3: subIdSchema,
  subId4: subIdSchema,
  subId5: subIdSchema,
})

const reportSchema = z.object({
  connectionId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.coerce.number().refine((value) => [20, 40, 100].includes(value)).transform((value) => value as 20 | 40 | 100),
  page: z.coerce.number().int().min(1),
  orderId: z.string().max(100).optional(),
  status: z.coerce.number().refine((value) => [1, 2, 3, 4].includes(value)).transform((value) => value as 1 | 2 | 3 | 4).optional(),
})

const apiKeySchema = z.object({ name: z.string().trim().min(2).max(80) })

type ConnectionListRow = {
  id: string
  name: string
  status: string
  is_default: boolean
  affiliate_id: string | null
  affiliate_name: string | null
  last_checked_at: string | null
  last_error_code: string | null
  created_at: string
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Dữ liệu gửi lên chưa hợp lệ', parsed.error.issues)
  return parsed.data
}

async function listConnections(sql: ReturnType<typeof getDatabase>, workspaceId: string): Promise<ConnectionListRow[]> {
  return sql<ConnectionListRow[]>`
    select
      id::text,
      name,
      status,
      is_default,
      affiliate_id,
      affiliate_name,
      last_checked_at::text,
      last_error_code,
      created_at::text
    from camlink.shopee_connections
    where workspace_id = ${workspaceId}::uuid and deleted_at is null
    order by is_default desc, created_at asc
  `
}

async function validateShopeeCookie(cookie: string, baseApi?: string): Promise<Record<string, unknown>> {
  const yesterday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const result = await getShopeeConversionReport(
    cookie,
    { startDate: yesterday, endDate: yesterday, limit: 20, page: 1 },
    baseApi,
  )

  if (isShopeeAuthError(result.status, result.data)) {
    throw new AppError(422, 'SHOPEE_SESSION_EXPIRED', 'Cookie Shopee không hợp lệ hoặc đã hết hạn')
  }
  if (result.status < 200 || result.status >= 300) {
    throw new AppError(502, 'SHOPEE_CONNECTION_FAILED', 'Không thể kiểm tra kết nối với Shopee lúc này')
  }
  return result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>) : {}
}

function extractAffiliate(payload: Record<string, unknown>): { affiliateId: string | null; affiliateName: string | null } {
  const data = payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : {}
  const list = Array.isArray(data.list) ? data.list : []
  const first = list[0] && typeof list[0] === 'object' ? (list[0] as Record<string, unknown>) : {}
  return {
    affiliateId: first.affiliate_id === undefined ? null : String(first.affiliate_id),
    affiliateName: first.affiliate_name === undefined ? null : String(first.affiliate_name),
  }
}

const router = createRouter()
router.use('*', requireSession)
router.use('*', requireTrustedOrigin)

router.get('/bootstrap', async (c) => {
  const auth = c.get('auth')
  const sql = getDatabase(c.env)
  const [connections, usageRows, metricRows, daily, recentLinks, apiKeys] = await Promise.all([
    listConnections(sql, auth.workspaceId),
    sql<{ monthly_quota: number; used: number }[]>`
      select w.monthly_quota, count(ue.id)::int as used
      from camlink.workspaces w
      left join camlink.usage_events ue
        on ue.workspace_id = w.id
        and ue.billable = true
        and ue.created_at >= date_trunc('month', now())
      where w.id = ${auth.workspaceId}::uuid
      group by w.id
    `,
    sql<{ conversions: number; order_count: number; commission: string; order_value: string }[]>`
      select
        count(*)::int as conversions,
        coalesce(sum(order_count), 0)::int as order_count,
        coalesce(sum(estimated_commission_internal), 0)::text as commission,
        coalesce(sum(order_value_internal), 0)::text as order_value
      from camlink.conversion_records
      where workspace_id = ${auth.workspaceId}::uuid
        and purchase_time >= now() - interval '30 days'
    `,
    sql<{ day: string; commission: string }[]>`
      select
        to_char(days.day, 'YYYY-MM-DD') as day,
        coalesce(sum(cr.estimated_commission_internal), 0)::text as commission
      from generate_series(
        (now() at time zone 'Asia/Ho_Chi_Minh')::date - 6,
        (now() at time zone 'Asia/Ho_Chi_Minh')::date,
        interval '1 day'
      ) as days(day)
      left join camlink.conversion_records cr
        on (cr.purchase_time at time zone 'Asia/Ho_Chi_Minh')::date = days.day::date
        and cr.workspace_id = ${auth.workspaceId}::uuid
      group by days.day
      order by days.day
    `,
    sql<{ id: string; original_link: string; short_link: string | null; fail_code: number; created_at: string }[]>`
      select lr.id::text, lr.original_link, lr.short_link, lr.fail_code, lr.created_at::text
      from camlink.link_results lr
      where lr.workspace_id = ${auth.workspaceId}::uuid
      order by lr.created_at desc
      limit 6
    `,
    sql<{ id: string; name: string; key_prefix: string; last_used_at: string | null; created_at: string }[]>`
      select id::text, name, key_prefix, last_used_at::text, created_at::text
      from camlink.api_keys
      where workspace_id = ${auth.workspaceId}::uuid and revoked_at is null
      order by created_at desc
    `,
  ])

  const usage = usageRows[0] || { monthly_quota: 0, used: 0 }
  const metrics = metricRows[0] || { conversions: 0, order_count: 0, commission: '0', order_value: '0' }
  return c.json({
    success: true,
    data: {
      user: { id: auth.userId, name: auth.userName, email: auth.email, isAdmin: auth.isAdmin },
      workspace: { id: auth.workspaceId, name: auth.workspaceName, role: auth.role },
      connections,
      usage,
      metrics,
      daily,
      recentLinks,
      apiKeys,
    },
  })
})

router.get('/connections', async (c) => {
  const auth = c.get('auth')
  return c.json({ success: true, data: await listConnections(getDatabase(c.env), auth.workspaceId) })
})

router.post('/connections', async (c) => {
  const auth = c.get('auth')
  const input = await parseBody(c.req.raw, connectionSchema)
  if (!c.env.COOKIE_ENCRYPTION_KEY) throw new AppError(503, 'ENCRYPTION_NOT_CONFIGURED', 'Máy chủ chưa cấu hình khóa mã hóa')

  const { cookieHeader } = parseShopeeCookieFile(input.cookieJson)
  const validationPayload = await validateShopeeCookie(cookieHeader, c.env.SHOPEE_BASE_API)
  const affiliate = extractAffiliate(validationPayload)
  const encryptedCookie = await encryptSecret(cookieHeader, c.env.COOKIE_ENCRYPTION_KEY)
  const sql = getDatabase(c.env)
  const rows = await sql.begin(async (transaction) => {
    if (input.isDefault) {
      await transaction`
        update camlink.shopee_connections set is_default = false
        where workspace_id = ${auth.workspaceId}::uuid and deleted_at is null
      `
    }
    return transaction<ConnectionListRow[]>`
      insert into camlink.shopee_connections (
        workspace_id, created_by, name, encrypted_cookie, status, is_default,
        affiliate_id, affiliate_name, last_checked_at
      ) values (
        ${auth.workspaceId}::uuid,
        ${auth.userId}::uuid,
        ${input.name},
        ${encryptedCookie},
        'connected',
        ${Boolean(input.isDefault)} or not exists (
          select 1 from camlink.shopee_connections
          where workspace_id = ${auth.workspaceId}::uuid and deleted_at is null
        ),
        ${affiliate.affiliateId},
        ${affiliate.affiliateName},
        now()
      )
      returning id::text, name, status, is_default, affiliate_id, affiliate_name,
        last_checked_at::text, last_error_code, created_at::text
    `
  })

  return c.json({ success: true, data: rows[0] }, 201)
})

router.patch('/connections/:id', async (c) => {
  const auth = c.get('auth')
  const connectionId = z.string().uuid().parse(c.req.param('id'))
  const input = await parseBody(c.req.raw, connectionUpdateSchema)
  const sql = getDatabase(c.env)
  const existing = await sql<{ id: string }[]>`
    select id::text from camlink.shopee_connections
    where id = ${connectionId}::uuid and workspace_id = ${auth.workspaceId}::uuid and deleted_at is null
  `
  if (!existing[0]) throw new AppError(404, 'SHOPEE_CONNECTION_NOT_FOUND', 'Không tìm thấy tài khoản Shopee')

  let encryptedCookie: string | undefined
  let affiliateId: string | null | undefined
  let affiliateName: string | null | undefined
  if (input.cookieJson) {
    if (!c.env.COOKIE_ENCRYPTION_KEY) throw new AppError(503, 'ENCRYPTION_NOT_CONFIGURED', 'Máy chủ chưa cấu hình khóa mã hóa')
    const { cookieHeader } = parseShopeeCookieFile(input.cookieJson)
    const payload = await validateShopeeCookie(cookieHeader, c.env.SHOPEE_BASE_API)
    const affiliate = extractAffiliate(payload)
    affiliateId = affiliate.affiliateId
    affiliateName = affiliate.affiliateName
    encryptedCookie = await encryptSecret(cookieHeader, c.env.COOKIE_ENCRYPTION_KEY)
  }

  await sql.begin(async (transaction) => {
    if (input.isDefault) {
      await transaction`
        update camlink.shopee_connections set is_default = false
        where workspace_id = ${auth.workspaceId}::uuid and deleted_at is null
      `
    }
    await transaction`
      update camlink.shopee_connections set
        name = coalesce(${input.name || null}, name),
        encrypted_cookie = coalesce(${encryptedCookie || null}, encrypted_cookie),
        affiliate_id = coalesce(${affiliateId ?? null}, affiliate_id),
        affiliate_name = coalesce(${affiliateName ?? null}, affiliate_name),
        status = case when ${Boolean(input.cookieJson)} then 'connected' else status end,
        is_default = case when ${Boolean(input.isDefault)} then true else is_default end,
        last_checked_at = case when ${Boolean(input.cookieJson)} then now() else last_checked_at end,
        last_error_code = case when ${Boolean(input.cookieJson)} then null else last_error_code end,
        updated_at = now()
      where id = ${connectionId}::uuid and workspace_id = ${auth.workspaceId}::uuid
    `
  })

  return c.json({ success: true, data: (await listConnections(sql, auth.workspaceId)).find((item) => item.id === connectionId) })
})

router.post('/connections/:id/check', async (c) => {
  const auth = c.get('auth')
  const connectionId = z.string().uuid().parse(c.req.param('id'))
  const sql = getDatabase(c.env)
  const rows = await sql<{ encrypted_cookie: string }[]>`
    select encrypted_cookie from camlink.shopee_connections
    where id = ${connectionId}::uuid and workspace_id = ${auth.workspaceId}::uuid and deleted_at is null
  `
  if (!rows[0]) throw new AppError(404, 'SHOPEE_CONNECTION_NOT_FOUND', 'Không tìm thấy tài khoản Shopee')
  if (!c.env.COOKIE_ENCRYPTION_KEY) throw new AppError(503, 'ENCRYPTION_NOT_CONFIGURED', 'Máy chủ chưa cấu hình khóa mã hóa')

  const cookie = await decryptSecret(rows[0].encrypted_cookie, c.env.COOKIE_ENCRYPTION_KEY)
  try {
    await validateShopeeCookie(cookie, c.env.SHOPEE_BASE_API)
    await sql`
      update camlink.shopee_connections
      set status = 'connected', last_checked_at = now(), last_error_code = null, updated_at = now()
      where id = ${connectionId}::uuid
    `
    return c.json({ success: true, data: { status: 'connected' } })
  } catch (error) {
    const status = error instanceof AppError && error.code === 'SHOPEE_SESSION_EXPIRED' ? 'expired' : 'error'
    const errorCode = error instanceof AppError ? error.code : 'SHOPEE_CONNECTION_FAILED'
    await sql`
      update camlink.shopee_connections
      set status = ${status}, last_checked_at = now(), last_error_code = ${errorCode}, updated_at = now()
      where id = ${connectionId}::uuid
    `
    throw error
  }
})

router.delete('/connections/:id', async (c) => {
  const auth = c.get('auth')
  const connectionId = z.string().uuid().parse(c.req.param('id'))
  const sql = getDatabase(c.env)
  const result = await sql`
    update camlink.shopee_connections
    set deleted_at = now(), is_default = false, updated_at = now()
    where id = ${connectionId}::uuid and workspace_id = ${auth.workspaceId}::uuid and deleted_at is null
    returning id
  `
  if (result.length === 0) throw new AppError(404, 'SHOPEE_CONNECTION_NOT_FOUND', 'Không tìm thấy tài khoản Shopee')
  await sql`
    update camlink.shopee_connections set is_default = true
    where id = (
      select id from camlink.shopee_connections
      where workspace_id = ${auth.workspaceId}::uuid and deleted_at is null
      order by created_at asc limit 1
    )
  `
  return c.json({ success: true })
})

router.post('/links/convert', async (c) => {
  const input = await parseBody(c.req.raw, convertSchema)
  return c.json({ success: true, data: await performLinkConversion(c, input) })
})

router.get('/links/history', async (c) => {
  const auth = c.get('auth')
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 30)))
  const sql = getDatabase(c.env)
  const rows = await sql`
    select
      lr.id::text,
      lr.original_link,
      lr.short_link,
      lr.long_link,
      lr.fail_code,
      lr.created_at::text,
      lb.sub_id_1,
      sc.name as connection_name
    from camlink.link_results lr
    join camlink.link_batches lb on lb.id = lr.batch_id
    join camlink.shopee_connections sc on sc.id = lb.shopee_connection_id
    where lr.workspace_id = ${auth.workspaceId}::uuid
    order by lr.created_at desc
    limit ${limit}
  `
  return c.json({ success: true, data: rows })
})

router.get('/reports/conversions', async (c) => {
  const parsed = reportSchema.safeParse(c.req.query())
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Bộ lọc báo cáo chưa hợp lệ', parsed.error.issues)
  return c.json({ success: true, data: await performConversionReport(c, parsed.data) })
})

router.get('/api-keys', async (c) => {
  const auth = c.get('auth')
  const sql = getDatabase(c.env)
  const rows = await sql`
    select id::text, name, key_prefix, last_used_at::text, expires_at::text, created_at::text
    from camlink.api_keys
    where workspace_id = ${auth.workspaceId}::uuid and revoked_at is null
    order by created_at desc
  `
  return c.json({ success: true, data: rows })
})

router.post('/api-keys', async (c) => {
  const auth = c.get('auth')
  const input = await parseBody(c.req.raw, apiKeySchema)
  const token = `clk_live_${randomToken(24)}`
  const sql = getDatabase(c.env)
  const rows = await sql<{ id: string; name: string; key_prefix: string; created_at: string }[]>`
    insert into camlink.api_keys (workspace_id, created_by, name, key_prefix, key_hash)
    values (${auth.workspaceId}::uuid, ${auth.userId}::uuid, ${input.name}, ${token.slice(0, 18)}, ${await sha256(token)})
    returning id::text, name, key_prefix, created_at::text
  `
  return c.json({ success: true, data: { ...rows[0], key: token } }, 201)
})

router.delete('/api-keys/:id', async (c) => {
  const auth = c.get('auth')
  const keyId = z.string().uuid().parse(c.req.param('id'))
  const sql = getDatabase(c.env)
  const result = await sql`
    update camlink.api_keys set revoked_at = now()
    where id = ${keyId}::uuid and workspace_id = ${auth.workspaceId}::uuid and revoked_at is null
    returning id
  `
  if (result.length === 0) throw new AppError(404, 'API_KEY_NOT_FOUND', 'Không tìm thấy API key')
  return c.json({ success: true })
})

export default router
