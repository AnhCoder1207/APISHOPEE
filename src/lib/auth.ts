import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import { getDatabase } from './db'
import { AppError } from './errors'
import { randomToken, sha256 } from './crypto'
import type { AppBindings, AuthContext } from './types'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type SessionRow = {
  session_id: string
  user_id: string
  user_name: string
  email: string
  workspace_id: string
  workspace_name: string
  role: AuthContext['role']
  is_admin: boolean
}

type ApiKeyRow = Omit<SessionRow, 'session_id'> & {
  api_key_id: string
}

function sessionCookieName(c: Context<AppBindings>): string {
  return c.env.SESSION_COOKIE_NAME || 'camlink_session'
}

function clientIp(c: Context<AppBindings>): string {
  return c.env.CLIENT_IP || c.req.header('CF-Connecting-IP') || 'unknown'
}

export async function createSession(c: Context<AppBindings>, userId: string, workspaceId: string): Promise<void> {
  const token = randomToken()
  const tokenHash = await sha256(token)
  const ipHash = await sha256(clientIp(c))
  const userAgent = (c.req.header('User-Agent') || '').slice(0, 500)
  const sql = getDatabase(c.env)

  await sql`
    insert into camlink.sessions (user_id, workspace_id, token_hash, ip_hash, user_agent, expires_at)
    values (${userId}::uuid, ${workspaceId}::uuid, ${tokenHash}, ${ipHash}, ${userAgent}, now() + interval '30 days')
  `

  setCookie(c, sessionCookieName(c), token, {
    httpOnly: true,
    secure: c.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function revokeSession(c: Context<AppBindings>): Promise<void> {
  const token = getCookie(c, sessionCookieName(c))
  if (token) {
    const sql = getDatabase(c.env)
    await sql`update camlink.sessions set revoked_at = now() where token_hash = ${await sha256(token)}`
  }
  deleteCookie(c, sessionCookieName(c), { path: '/' })
}

async function resolveSession(c: Context<AppBindings>): Promise<AuthContext | null> {
  const token = getCookie(c, sessionCookieName(c))
  if (!token) return null

  const sql = getDatabase(c.env)
  const rows = await sql<SessionRow[]>`
    select
      s.id::text as session_id,
      u.id::text as user_id,
      u.name as user_name,
      u.email,
      w.id::text as workspace_id,
      w.name as workspace_name,
      wm.role,
      u.is_admin
    from camlink.sessions s
    join camlink.users u on u.id = s.user_id and u.status = 'active'
    join camlink.workspaces w on w.id = s.workspace_id and w.status = 'active'
    join camlink.workspace_members wm on wm.workspace_id = w.id and wm.user_id = u.id
    where s.token_hash = ${await sha256(token)}
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1
  `

  const row = rows[0]
  if (!row) return null

  c.executionCtx.waitUntil(
    sql`update camlink.sessions set last_seen_at = now() where id = ${row.session_id}::uuid`.then(() => undefined),
  )

  return {
    authType: 'session',
    userId: row.user_id,
    userName: row.user_name,
    email: row.email,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    role: row.role,
    isAdmin: row.is_admin,
  }
}

async function resolveApiKey(c: Context<AppBindings>): Promise<AuthContext | null> {
  const authorization = c.req.header('Authorization') || ''
  if (!authorization.startsWith('Bearer clk_')) return null

  const token = authorization.slice('Bearer '.length).trim()
  const sql = getDatabase(c.env)
  const rows = await sql<ApiKeyRow[]>`
    select
      k.id::text as api_key_id,
      u.id::text as user_id,
      u.name as user_name,
      u.email,
      w.id::text as workspace_id,
      w.name as workspace_name,
      wm.role,
      u.is_admin
    from camlink.api_keys k
    join camlink.users u on u.id = k.created_by and u.status = 'active'
    join camlink.workspaces w on w.id = k.workspace_id and w.status = 'active'
    join camlink.workspace_members wm on wm.workspace_id = w.id and wm.user_id = u.id
    where k.key_hash = ${await sha256(token)}
      and k.revoked_at is null
      and (k.expires_at is null or k.expires_at > now())
    limit 1
  `

  const row = rows[0]
  if (!row) return null

  c.executionCtx.waitUntil(
    sql`update camlink.api_keys set last_used_at = now() where id = ${row.api_key_id}::uuid`.then(() => undefined),
  )

  return {
    authType: 'api_key',
    userId: row.user_id,
    userName: row.user_name,
    email: row.email,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    role: row.role,
    isAdmin: row.is_admin,
    apiKeyId: row.api_key_id,
  }
}

export const requireSession = createMiddleware<AppBindings>(async (c, next) => {
  const auth = await resolveSession(c)
  if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục')
  c.set('auth', auth)
  await next()
})

export const requireApiKey = createMiddleware<AppBindings>(async (c, next) => {
  const auth = await resolveApiKey(c)
  if (!auth) throw new AppError(401, 'INVALID_API_KEY', 'API key không hợp lệ hoặc đã bị thu hồi')
  c.set('auth', auth)
  await next()
})

export const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const auth = c.get('auth')
  if (auth.authType !== 'session' || !auth.isAdmin) {
    throw new AppError(403, 'ADMIN_REQUIRED', 'Bạn không có quyền truy cập trang quản trị')
  }
  await next()
})

export const requireTrustedOrigin = createMiddleware<AppBindings>(async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()

  const origin = c.req.header('Origin')
  if (origin) {
    const requestOrigin = new URL(c.req.url).origin
    const configuredOrigin = c.env.APP_URL ? new URL(c.env.APP_URL).origin : requestOrigin
    if (origin !== requestOrigin && origin !== configuredOrigin) {
      throw new AppError(403, 'INVALID_ORIGIN', 'Nguồn gửi yêu cầu không được phép')
    }
  }

  await next()
})
