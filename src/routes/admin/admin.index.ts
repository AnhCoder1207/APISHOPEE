import { z } from 'zod'
import type { Context } from 'hono'
import { createRouter } from '../../lib/create-app'
import { requireAdmin, requireSession, requireTrustedOrigin } from '../../lib/auth'
import { getDatabase } from '../../lib/db'
import { sha256 } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import type { AppBindings } from '../../lib/types'

const userListSchema = z.object({
  query: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'active', 'suspended', 'deleted']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(25),
})

const workspaceListSchema = z.object({
  query: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'active', 'suspended']).default('all'),
  plan: z.enum(['all', 'starter', 'pro', 'business']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(25),
})

const connectionListSchema = z.object({
  query: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'connected', 'expired', 'error']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(25),
})

const auditListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(25),
})

const userUpdateSchema = z
  .object({
    status: z.enum(['active', 'suspended']).optional(),
    isAdmin: z.boolean().optional(),
  })
  .refine((value) => value.status !== undefined || value.isAdmin !== undefined, 'Không có thay đổi nào được gửi lên')

const workspaceUpdateSchema = z
  .object({
    status: z.enum(['active', 'suspended']).optional(),
    plan: z.enum(['starter', 'pro', 'business']).optional(),
    monthlyQuota: z.number().int().min(0).max(10_000_000).optional(),
  })
  .refine(
    (value) => value.status !== undefined || value.plan !== undefined || value.monthlyQuota !== undefined,
    'Không có thay đổi nào được gửi lên',
  )

type AdminUserRow = {
  id: string
  name: string
  email: string
  status: string
  is_admin: boolean
  created_at: string
  workspace_count: number
  active_sessions: number
  last_seen_at: string | null
  total_count: number
}

type AdminWorkspaceRow = {
  id: string
  name: string
  slug: string
  status: string
  plan: string
  monthly_quota: number
  owner_name: string
  owner_email: string
  member_count: number
  usage_month: number
  connection_count: number
  active_api_keys: number
  created_at: string
  total_count: number
}

function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  return request
    .json()
    .catch(() => null)
    .then((body) => {
      const parsed = schema.safeParse(body)
      if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Dữ liệu gửi lên chưa hợp lệ', parsed.error.issues)
      return parsed.data
    })
}

function pagination<T extends { total_count: number }>(rows: T[], page: number, limit: number) {
  const total = rows[0]?.total_count || 0
  return {
    items: rows.map(({ total_count: _totalCount, ...row }) => row),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

async function recordAdminAudit(
  c: Context<AppBindings>,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const auth = c.get('auth')
  const sql = getDatabase(c.env)
  const ip = c.env.CLIENT_IP || c.req.header('CF-Connecting-IP') || 'unknown'
  await sql`
    insert into camlink.admin_audit_logs (
      actor_user_id, actor_email, action, target_type, target_id, metadata, ip_hash
    ) values (
      ${auth.userId}::uuid,
      ${auth.email},
      ${action},
      ${targetType},
      ${targetId}::uuid,
      ${sql.json(metadata as Parameters<typeof sql.json>[0])},
      ${await sha256(ip)}
    )
  `
}

const router = createRouter()
router.use('*', requireSession)
router.use('*', requireAdmin)
router.use('*', requireTrustedOrigin)

router.get('/bootstrap', async (c) => {
  const sql = getDatabase(c.env)
  const [metricRows, planDistribution, signupDaily] = await Promise.all([
    sql<{
      total_users: number
      active_users: number
      suspended_users: number
      new_users_30d: number
      total_workspaces: number
      active_workspaces: number
      usage_month: number
      active_connections: number
      active_api_keys: number
    }[]>`
      select
        (select count(*)::int from camlink.users) as total_users,
        (select count(*)::int from camlink.users where status = 'active') as active_users,
        (select count(*)::int from camlink.users where status = 'suspended') as suspended_users,
        (select count(*)::int from camlink.users where created_at >= now() - interval '30 days') as new_users_30d,
        (select count(*)::int from camlink.workspaces) as total_workspaces,
        (select count(*)::int from camlink.workspaces where status = 'active') as active_workspaces,
        (select count(*)::int from camlink.usage_events where created_at >= date_trunc('month', now())) as usage_month,
        (select count(*)::int from camlink.shopee_connections where status = 'connected' and deleted_at is null) as active_connections,
        (select count(*)::int from camlink.api_keys where revoked_at is null and (expires_at is null or expires_at > now())) as active_api_keys
    `,
    sql<{ plan: string; count: number }[]>`
      select plan, count(*)::int as count
      from camlink.workspaces
      group by plan
      order by plan
    `,
    sql<{ day: string; count: number }[]>`
      select to_char(days.day, 'YYYY-MM-DD') as day, count(u.id)::int as count
      from generate_series(current_date - 13, current_date, interval '1 day') as days(day)
      left join camlink.users u on u.created_at::date = days.day::date
      group by days.day
      order by days.day
    `,
  ])

  return c.json({ success: true, data: { metrics: metricRows[0], planDistribution, signupDaily } })
})

router.get('/users', async (c) => {
  const parsed = userListSchema.safeParse(c.req.query())
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Bộ lọc người dùng chưa hợp lệ', parsed.error.issues)
  const { query, status, page, limit } = parsed.data
  const statusFilter = status === 'all' ? '' : status
  const pattern = `%${query}%`
  const offset = (page - 1) * limit
  const sql = getDatabase(c.env)
  const rows = await sql<AdminUserRow[]>`
    select
      u.id::text,
      u.name,
      u.email,
      u.status,
      u.is_admin,
      u.created_at::text,
      (select count(*)::int from camlink.workspace_members wm where wm.user_id = u.id) as workspace_count,
      (select count(*)::int from camlink.sessions s where s.user_id = u.id and s.revoked_at is null and s.expires_at > now()) as active_sessions,
      (select max(s.last_seen_at)::text from camlink.sessions s where s.user_id = u.id) as last_seen_at,
      count(*) over()::int as total_count
    from camlink.users u
    where (${query} = '' or u.name ilike ${pattern} or u.email ilike ${pattern})
      and (${statusFilter} = '' or u.status = ${statusFilter})
    order by u.created_at desc
    limit ${limit} offset ${offset}
  `
  return c.json({ success: true, data: pagination(rows, page, limit) })
})

router.patch('/users/:id', async (c) => {
  const userId = z.string().uuid().parse(c.req.param('id'))
  const input = await parseBody(c.req.raw, userUpdateSchema)
  const auth = c.get('auth')
  const sql = getDatabase(c.env)
  const rows = await sql<{ id: string; name: string; email: string; status: 'active' | 'suspended'; is_admin: boolean }[]>`
    select id::text, name, email, status, is_admin
    from camlink.users
    where id = ${userId}::uuid
  `
  const user = rows[0]
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng')

  const nextStatus = input.status ?? user.status
  const nextIsAdmin = input.isAdmin ?? user.is_admin
  if (user.id === auth.userId && (nextStatus !== 'active' || !nextIsAdmin)) {
    throw new AppError(409, 'CANNOT_LOCK_SELF', 'Bạn không thể tự khóa hoặc tự gỡ quyền admin')
  }

  if (user.is_admin && (nextStatus !== 'active' || !nextIsAdmin)) {
    const admins = await sql<{ count: number }[]>`
      select count(*)::int as count
      from camlink.users
      where is_admin = true and status = 'active' and id <> ${userId}::uuid
    `
    if ((admins[0]?.count || 0) === 0) {
      throw new AppError(409, 'LAST_ADMIN_REQUIRED', 'Hệ thống phải còn ít nhất một admin đang hoạt động')
    }
  }

  await sql.begin(async (transaction) => {
    await transaction`
      update camlink.users
      set status = ${nextStatus}, is_admin = ${nextIsAdmin}, updated_at = now()
      where id = ${userId}::uuid
    `
    if (nextStatus === 'suspended') {
      await transaction`
        update camlink.sessions set revoked_at = now()
        where user_id = ${userId}::uuid and revoked_at is null
      `
    }
  })
  await recordAdminAudit(c, 'user.update', 'user', userId, {
    previousStatus: user.status,
    nextStatus,
    previousIsAdmin: user.is_admin,
    nextIsAdmin,
  })
  return c.json({ success: true })
})

router.post('/users/:id/revoke-sessions', async (c) => {
  const userId = z.string().uuid().parse(c.req.param('id'))
  const auth = c.get('auth')
  if (userId === auth.userId) throw new AppError(409, 'CANNOT_REVOKE_SELF', 'Hãy dùng nút đăng xuất cho phiên hiện tại')
  const sql = getDatabase(c.env)
  const users = await sql<{ id: string }[]>`select id::text from camlink.users where id = ${userId}::uuid`
  if (!users[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng')
  const revoked = await sql`
    update camlink.sessions set revoked_at = now()
    where user_id = ${userId}::uuid and revoked_at is null
    returning id
  `
  await recordAdminAudit(c, 'user.sessions.revoke', 'user', userId, { revokedSessions: revoked.length })
  return c.json({ success: true, data: { revokedSessions: revoked.length } })
})

router.get('/workspaces', async (c) => {
  const parsed = workspaceListSchema.safeParse(c.req.query())
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Bộ lọc workspace chưa hợp lệ', parsed.error.issues)
  const { query, status, plan, page, limit } = parsed.data
  const statusFilter = status === 'all' ? '' : status
  const planFilter = plan === 'all' ? '' : plan
  const pattern = `%${query}%`
  const offset = (page - 1) * limit
  const sql = getDatabase(c.env)
  const rows = await sql<AdminWorkspaceRow[]>`
    select
      w.id::text,
      w.name,
      w.slug,
      w.status,
      w.plan,
      w.monthly_quota,
      owner.name as owner_name,
      owner.email as owner_email,
      w.created_at::text,
      (select count(*)::int from camlink.workspace_members wm where wm.workspace_id = w.id) as member_count,
      (select count(*)::int from camlink.usage_events ue where ue.workspace_id = w.id and ue.created_at >= date_trunc('month', now())) as usage_month,
      (select count(*)::int from camlink.shopee_connections sc where sc.workspace_id = w.id and sc.deleted_at is null) as connection_count,
      (select count(*)::int from camlink.api_keys k where k.workspace_id = w.id and k.revoked_at is null and (k.expires_at is null or k.expires_at > now())) as active_api_keys,
      count(*) over()::int as total_count
    from camlink.workspaces w
    join camlink.users owner on owner.id = w.owner_user_id
    where (${query} = '' or w.name ilike ${pattern} or w.slug ilike ${pattern} or owner.email ilike ${pattern})
      and (${statusFilter} = '' or w.status = ${statusFilter})
      and (${planFilter} = '' or w.plan = ${planFilter})
    order by w.created_at desc
    limit ${limit} offset ${offset}
  `
  return c.json({ success: true, data: pagination(rows, page, limit) })
})

router.patch('/workspaces/:id', async (c) => {
  const workspaceId = z.string().uuid().parse(c.req.param('id'))
  const input = await parseBody(c.req.raw, workspaceUpdateSchema)
  const sql = getDatabase(c.env)
  const rows = await sql<{
    id: string
    status: 'active' | 'suspended'
    plan: 'starter' | 'pro' | 'business'
    monthly_quota: number
  }[]>`
    select id::text, status, plan, monthly_quota
    from camlink.workspaces
    where id = ${workspaceId}::uuid
  `
  const workspace = rows[0]
  if (!workspace) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Không tìm thấy workspace')

  const nextStatus = input.status ?? workspace.status
  const nextPlan = input.plan ?? workspace.plan
  const nextQuota = input.monthlyQuota ?? workspace.monthly_quota
  await sql.begin(async (transaction) => {
    await transaction`
      update camlink.workspaces
      set status = ${nextStatus}, plan = ${nextPlan}, monthly_quota = ${nextQuota}, updated_at = now()
      where id = ${workspaceId}::uuid
    `
    if (nextStatus === 'suspended') {
      await transaction`
        update camlink.sessions set revoked_at = now()
        where workspace_id = ${workspaceId}::uuid and revoked_at is null
      `
    }
  })
  await recordAdminAudit(c, 'workspace.update', 'workspace', workspaceId, {
    previousStatus: workspace.status,
    nextStatus,
    previousPlan: workspace.plan,
    nextPlan,
    previousMonthlyQuota: workspace.monthly_quota,
    nextMonthlyQuota: nextQuota,
  })
  return c.json({ success: true })
})

router.post('/workspaces/:id/revoke-api-keys', async (c) => {
  const workspaceId = z.string().uuid().parse(c.req.param('id'))
  const sql = getDatabase(c.env)
  const workspaces = await sql<{ id: string }[]>`select id::text from camlink.workspaces where id = ${workspaceId}::uuid`
  if (!workspaces[0]) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Không tìm thấy workspace')
  const revoked = await sql`
    update camlink.api_keys set revoked_at = now()
    where workspace_id = ${workspaceId}::uuid and revoked_at is null
    returning id
  `
  await recordAdminAudit(c, 'workspace.api_keys.revoke', 'workspace', workspaceId, { revokedApiKeys: revoked.length })
  return c.json({ success: true, data: { revokedApiKeys: revoked.length } })
})

router.get('/connections', async (c) => {
  const parsed = connectionListSchema.safeParse(c.req.query())
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Bộ lọc kết nối chưa hợp lệ', parsed.error.issues)
  const { query, status, page, limit } = parsed.data
  const statusFilter = status === 'all' ? '' : status
  const pattern = `%${query}%`
  const offset = (page - 1) * limit
  const sql = getDatabase(c.env)
  const rows = await sql<{
    id: string
    name: string
    status: string
    is_default: boolean
    affiliate_id: string | null
    affiliate_name: string | null
    last_checked_at: string | null
    last_error_code: string | null
    created_at: string
    workspace_id: string
    workspace_name: string
    owner_email: string
    total_count: number
  }[]>`
    select
      sc.id::text,
      sc.name,
      sc.status,
      sc.is_default,
      sc.affiliate_id,
      sc.affiliate_name,
      sc.last_checked_at::text,
      sc.last_error_code,
      sc.created_at::text,
      w.id::text as workspace_id,
      w.name as workspace_name,
      owner.email as owner_email,
      count(*) over()::int as total_count
    from camlink.shopee_connections sc
    join camlink.workspaces w on w.id = sc.workspace_id
    join camlink.users owner on owner.id = w.owner_user_id
    where sc.deleted_at is null
      and (${query} = '' or sc.name ilike ${pattern} or w.name ilike ${pattern} or owner.email ilike ${pattern})
      and (${statusFilter} = '' or sc.status = ${statusFilter})
    order by sc.created_at desc
    limit ${limit} offset ${offset}
  `
  return c.json({ success: true, data: pagination(rows, page, limit) })
})

router.get('/audit', async (c) => {
  const parsed = auditListSchema.safeParse(c.req.query())
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Bộ lọc audit chưa hợp lệ', parsed.error.issues)
  const { page, limit } = parsed.data
  const offset = (page - 1) * limit
  const sql = getDatabase(c.env)
  const rows = await sql<{
    id: string
    actor_email: string
    action: string
    target_type: string
    target_id: string | null
    metadata: Record<string, unknown>
    created_at: string
    total_count: number
  }[]>`
    select id::text, actor_email, action, target_type, target_id::text, metadata, created_at::text,
      count(*) over()::int as total_count
    from camlink.admin_audit_logs
    order by created_at desc
    limit ${limit} offset ${offset}
  `
  return c.json({ success: true, data: pagination(rows, page, limit) })
})

export default router
