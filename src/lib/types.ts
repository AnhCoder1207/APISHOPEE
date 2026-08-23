import type { OpenAPIHono, RouteConfig, RouteHandler } from '@hono/zod-openapi'

export interface AuthContext {
  authType: 'session' | 'api_key'
  userId: string
  userName: string
  email: string
  workspaceId: string
  workspaceName: string
  role: 'owner' | 'admin' | 'member'
  isAdmin: boolean
  apiKeyId?: string
}

export interface AppBindings {
  Bindings: {
    NODE_ENV?: string
    SERVER_URL?: string
    APP_URL?: string
    SHOPEE_BASE_API?: string
    DATABASE_URL?: string
    COOKIE_ENCRYPTION_KEY?: string
    SESSION_COOKIE_NAME?: string
    CLIENT_IP?: string
    TRUST_PROXY?: string
    HOST?: string
    PORT?: string
    HYPERDRIVE?: {
      connectionString: string
    }
  }
  Variables: {
    auth: AuthContext
  }
}

export type AppOpenAPI = OpenAPIHono<AppBindings>

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppBindings>
