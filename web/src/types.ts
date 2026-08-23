export type View = 'dashboard' | 'convert' | 'reports' | 'connections' | 'api-keys' | 'admin'

export interface User {
  id: string
  name: string
  email: string
  isAdmin: boolean
}

export interface Usage {
  used: number
  monthly_quota: number
}

export interface Metrics {
  commission: number
  order_count: number
  conversions: number
}

export interface Connection {
  id: string
  name: string
  status: string
  is_default: boolean
  affiliate_name?: string | null
  affiliate_id?: string | null
  last_checked_at?: string | null
  last_error_code?: string | null
  workspace_name?: string
  owner_email?: string
}

export interface LinkRecord {
  id?: string
  original_link: string
  short_link?: string | null
  sub_id_1?: string | null
  connection_name?: string | null
  created_at: string
}

export interface ApiKeyRecord {
  id: string
  name: string
  key_prefix: string
  last_used_at?: string | null
}

export interface DailyMetric {
  day: string
  commission: number
}

export interface Bootstrap {
  user: User
  usage: Usage
  metrics: Metrics
  connections: Connection[]
  recentLinks: LinkRecord[]
  apiKeys: ApiKeyRecord[]
  daily: DailyMetric[]
}

export interface ReportRow {
  checkoutId: string
  purchaseTime: number
  source: string
  orderCount: number
  orderValue: number
  commission: number
  status: number
}

export interface ConvertResult {
  originalLink: string
  shortLink: string
  failCode: number
}

export interface Paginated<T> {
  items: T[]
  page: number
  totalPages: number
}

export interface AdminUser {
  id: string
  name: string
  email: string
  is_admin: boolean
  status: string
  workspace_count: number
  active_sessions: number
  last_seen_at?: string | null
}

export interface AdminWorkspace {
  id: string
  name: string
  slug: string
  owner_name: string
  owner_email: string
  plan: string
  status: string
  monthly_quota: number
  usage_month: number
  member_count: number
  connection_count: number
  active_api_keys: number
}

export interface AdminAudit {
  id?: string
  created_at: string
  actor_email: string
  action: string
  target_type: string
  target_id?: string | null
  metadata?: Record<string, unknown>
}

export interface AdminOverview {
  metrics: Record<string, number>
  planDistribution: Array<{ plan: string; count: number }>
  signupDaily: Array<{ day: string; count: number }>
}
