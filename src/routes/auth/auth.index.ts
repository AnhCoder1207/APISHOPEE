import { z } from 'zod'
import type { Context } from 'hono'
import { createRouter } from '../../lib/create-app.js'
import { createSession, requireSession, requireTrustedOrigin, revokeSession } from '../../lib/auth.js'
import { getDatabase } from '../../lib/db.js'
import { hashPassword, sha256, verifyPassword } from '../../lib/crypto.js'
import { AppError } from '../../lib/errors.js'
import type { AppBindings } from '../../lib/types.js'

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
})

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
})

type UserRow = {
  id: string
  name: string
  email: string
  password_hash: string
  workspace_id: string
  workspace_name: string
  is_admin: boolean
}

function slugify(value: string): string {
  const base = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36)
  return `${base || 'workspace'}-${crypto.randomUUID().slice(0, 8)}`
}

async function assertLoginAllowed(sql: ReturnType<typeof getDatabase>, keyHash: string): Promise<void> {
  const rows = await sql<{ attempts: number; blocked: boolean }[]>`
    select
      attempts,
      blocked_until is not null and blocked_until > now() as blocked
    from camlink.auth_rate_limits
    where key_hash = ${keyHash}
      and window_started_at > now() - interval '30 minutes'
  `
  if (rows[0]?.blocked || (rows[0]?.attempts || 0) >= 10) {
    throw new AppError(429, 'TOO_MANY_LOGIN_ATTEMPTS', 'Đăng nhập tạm khóa. Vui lòng thử lại sau 15 phút')
  }
}

async function recordFailedLogin(sql: ReturnType<typeof getDatabase>, keyHash: string): Promise<void> {
  await sql`
    insert into camlink.auth_rate_limits (key_hash, attempts, window_started_at)
    values (${keyHash}, 1, now())
    on conflict (key_hash) do update set
      attempts = case
        when camlink.auth_rate_limits.window_started_at < now() - interval '30 minutes' then 1
        else camlink.auth_rate_limits.attempts + 1
      end,
      window_started_at = case
        when camlink.auth_rate_limits.window_started_at < now() - interval '30 minutes' then now()
        else camlink.auth_rate_limits.window_started_at
      end,
      blocked_until = case
        when camlink.auth_rate_limits.window_started_at < now() - interval '30 minutes' then null
        when camlink.auth_rate_limits.attempts >= 9 then now() + interval '15 minutes'
        else camlink.auth_rate_limits.blocked_until
      end
  `
}

async function consumeRegistrationSlot(sql: ReturnType<typeof getDatabase>, keyHash: string): Promise<void> {
  const rows = await sql<{ attempts: number; blocked: boolean }[]>`
    insert into camlink.auth_rate_limits (key_hash, attempts, window_started_at)
    values (${keyHash}, 1, now())
    on conflict (key_hash) do update set
      attempts = case
        when camlink.auth_rate_limits.window_started_at < now() - interval '1 hour' then 1
        else camlink.auth_rate_limits.attempts + 1
      end,
      window_started_at = case
        when camlink.auth_rate_limits.window_started_at < now() - interval '1 hour' then now()
        else camlink.auth_rate_limits.window_started_at
      end,
      blocked_until = case
        when camlink.auth_rate_limits.window_started_at < now() - interval '1 hour' then null
        when camlink.auth_rate_limits.attempts >= 5 then now() + interval '1 hour'
        else camlink.auth_rate_limits.blocked_until
      end,
      updated_at = now()
    returning attempts, blocked_until is not null and blocked_until > now() as blocked
  `
  if (rows[0]?.blocked || (rows[0]?.attempts || 0) > 5) {
    throw new AppError(429, 'TOO_MANY_REGISTRATIONS', 'Đã có quá nhiều tài khoản được tạo từ kết nối này. Vui lòng thử lại sau')
  }
}

const router = createRouter()

function clientIp(c: Context<AppBindings>): string {
  return c.env.CLIENT_IP || c.req.header('CF-Connecting-IP') || 'unknown'
}

router.use('/register', requireTrustedOrigin)
router.post('/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Thông tin đăng ký chưa hợp lệ', parsed.error.issues)

  const { name, password } = parsed.data
  const email = parsed.data.email.toLowerCase()
  const sql = getDatabase(c.env)
  const registrationKey = await sha256(`register:${clientIp(c)}`)
  await consumeRegistrationSlot(sql, registrationKey)
  const passwordHash = await hashPassword(password)

  try {
    const result = await sql.begin(async (transaction) => {
      const users = await transaction<{ id: string; name: string; email: string }[]>`
        insert into camlink.users (name, email, password_hash)
        values (${name}, ${email}, ${passwordHash})
        returning id::text, name, email
      `
      const user = users[0]
      const workspaces = await transaction<{ id: string; name: string }[]>`
        insert into camlink.workspaces (name, slug, owner_user_id)
        values (${`${name}'s workspace`}, ${slugify(name)}, ${user.id}::uuid)
        returning id::text, name
      `
      const workspace = workspaces[0]
      await transaction`
        insert into camlink.workspace_members (workspace_id, user_id, role)
        values (${workspace.id}::uuid, ${user.id}::uuid, 'owner')
      `
      return { user, workspace }
    })

    await createSession(c, result.user.id, result.workspace.id)
    return c.json({ success: true, data: result }, 201)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email này đã được đăng ký')
    }
    throw error
  }
})

router.use('/login', requireTrustedOrigin)
router.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Email hoặc mật khẩu chưa hợp lệ')

  const email = parsed.data.email.toLowerCase()
  const sql = getDatabase(c.env)
  const ip = clientIp(c)
  const rateLimitKey = await sha256(`${ip}:${email}`)
  await assertLoginAllowed(sql, rateLimitKey)

  const rows = await sql<UserRow[]>`
    select
      u.id::text,
      u.name,
      u.email,
      u.password_hash,
      u.is_admin,
      w.id::text as workspace_id,
      w.name as workspace_name
    from camlink.users u
    join camlink.workspace_members wm on wm.user_id = u.id
    join camlink.workspaces w on w.id = wm.workspace_id and w.status = 'active'
    where u.email = ${email} and u.status = 'active'
    order by case wm.role when 'owner' then 1 when 'admin' then 2 else 3 end
    limit 1
  `
  const user = rows[0]

  if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    await recordFailedLogin(sql, rateLimitKey)
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng')
  }

  await sql`delete from camlink.auth_rate_limits where key_hash = ${rateLimitKey}`
  await createSession(c, user.id, user.workspace_id)
  return c.json({
    success: true,
    data: {
      user: { id: user.id, name: user.name, email: user.email, isAdmin: user.is_admin },
      workspace: { id: user.workspace_id, name: user.workspace_name },
    },
  })
})

router.get('/me', requireSession, async (c) => {
  const auth = c.get('auth')
  return c.json({
    success: true,
    data: {
      user: { id: auth.userId, name: auth.userName, email: auth.email, isAdmin: auth.isAdmin },
      workspace: { id: auth.workspaceId, name: auth.workspaceName, role: auth.role },
    },
  })
})

router.use('/logout', requireTrustedOrigin)
router.post('/logout', requireSession, async (c) => {
  await revokeSession(c)
  return c.json({ success: true })
})

export default router
