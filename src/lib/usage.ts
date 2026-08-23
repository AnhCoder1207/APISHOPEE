import type { Context } from 'hono'
import { getDatabase } from './db'
import { AppError } from './errors'
import type { AppBindings } from './types'

type QuotaRow = {
  monthly_quota: number
  used: number
}

export async function assertMonthlyQuota(c: Context<AppBindings>, units = 1): Promise<void> {
  const auth = c.get('auth')
  const sql = getDatabase(c.env)
  const rows = await sql<QuotaRow[]>`
    select
      w.monthly_quota,
      count(ue.id)::int as used
    from camlink.workspaces w
    left join camlink.usage_events ue
      on ue.workspace_id = w.id
      and ue.billable = true
      and ue.created_at >= date_trunc('month', now())
    where w.id = ${auth.workspaceId}::uuid
    group by w.id
  `
  const quota = rows[0]
  if (!quota || quota.used + units > quota.monthly_quota) {
    throw new AppError(429, 'MONTHLY_QUOTA_EXCEEDED', 'Workspace đã hết hạn mức sử dụng tháng này')
  }
}

export async function recordUsage(
  c: Context<AppBindings>,
  eventType: string,
  statusCode: number,
  options: { billable?: boolean; metadata?: Record<string, string | number | boolean | null> } = {},
): Promise<void> {
  const auth = c.get('auth')
  const sql = getDatabase(c.env)
  await sql`
    insert into camlink.usage_events (
      workspace_id, user_id, api_key_id, event_type, status_code, billable, metadata
    ) values (
      ${auth.workspaceId}::uuid,
      ${auth.userId}::uuid,
      ${auth.apiKeyId || null}::uuid,
      ${eventType},
      ${statusCode},
      ${options.billable ?? true},
      ${sql.json(options.metadata || {})}
    )
  `
}
