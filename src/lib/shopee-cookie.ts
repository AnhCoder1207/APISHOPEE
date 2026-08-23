import { AppError } from './errors.js'

const TARGET_HOST = 'affiliate.shopee.vn'
const MAX_COOKIE_FILE_BYTES = 512_000
const MAX_COOKIE_COUNT = 200
const MAX_COOKIE_HEADER_LENGTH = 32_000
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const REQUIRED_AUTH_COOKIES = ['SPC_ST', 'SPC_U']

type ExportedCookie = {
  domain?: unknown
  expirationDate?: unknown
  hostOnly?: unknown
  name?: unknown
  path?: unknown
  value?: unknown
}

type CookieCandidate = {
  domain: string
  hostOnly: boolean
  name: string
  path: string
  value: string
}

export type ParsedShopeeCookieFile = {
  cookieCount: number
  cookieHeader: string
}

function invalidCookieFile(message: string, details?: unknown): never {
  throw new AppError(422, 'INVALID_SHOPEE_COOKIE_FILE', message, details)
}

function normalizeDomain(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/^\.+/, '') : ''
}

function matchesAffiliateHost(domain: string, hostOnly: boolean): boolean {
  if (!domain || (domain !== 'shopee.vn' && !domain.endsWith('.shopee.vn'))) return false
  return hostOnly ? domain === TARGET_HOST : TARGET_HOST === domain || TARGET_HOST.endsWith(`.${domain}`)
}

function isExpired(value: unknown, nowSeconds: number): boolean {
  if (value === undefined || value === null || value === '') return false
  const expirationDate = Number(value)
  return Number.isFinite(expirationDate) && expirationDate <= nowSeconds
}

function parseRoot(cookieJson: string): ExportedCookie[] {
  if (new TextEncoder().encode(cookieJson).byteLength > MAX_COOKIE_FILE_BYTES) {
    invalidCookieFile('File cookie vượt quá dung lượng tối đa 500 KB')
  }

  let root: unknown
  try {
    root = JSON.parse(cookieJson)
  } catch {
    invalidCookieFile('File không phải JSON hợp lệ')
  }

  const cookieList = Array.isArray(root)
    ? root
    : root && typeof root === 'object' && Array.isArray((root as { cookies?: unknown }).cookies)
      ? (root as { cookies: unknown[] }).cookies
      : null

  if (!cookieList) invalidCookieFile('Không tìm thấy danh sách cookies trong file J2TEAM Cookies')
  if (cookieList.length === 0) invalidCookieFile('File cookie không có dữ liệu')
  if (cookieList.length > MAX_COOKIE_COUNT) invalidCookieFile(`File có quá nhiều cookie, tối đa ${MAX_COOKIE_COUNT}`)

  return cookieList.filter((item): item is ExportedCookie => Boolean(item) && typeof item === 'object')
}

function toCandidate(cookie: ExportedCookie, nowSeconds: number): CookieCandidate | null {
  const domain = normalizeDomain(cookie.domain)
  const hostOnly = cookie.hostOnly === true
  if (!matchesAffiliateHost(domain, hostOnly) || isExpired(cookie.expirationDate, nowSeconds)) return null

  const name = typeof cookie.name === 'string' ? cookie.name.trim() : ''
  const value = typeof cookie.value === 'string' ? cookie.value : ''
  const path = typeof cookie.path === 'string' && cookie.path.startsWith('/') ? cookie.path : '/'
  if (!name || !value || !COOKIE_NAME_PATTERN.test(name)) return null
  if (/[;\u0000-\u001f\u007f]/.test(value)) return null

  return { domain, hostOnly, name, path, value }
}

function candidatePriority(candidate: CookieCandidate): number {
  return candidate.path.length * 10_000 + candidate.domain.length * 10 + Number(candidate.hostOnly)
}

export function parseShopeeCookieFile(cookieJson: string, now = Date.now()): ParsedShopeeCookieFile {
  const nowSeconds = Math.floor(now / 1000)
  const candidates = parseRoot(cookieJson)
    .map((cookie) => toCandidate(cookie, nowSeconds))
    .filter((cookie): cookie is CookieCandidate => cookie !== null)

  const selected = new Map<string, CookieCandidate>()
  for (const candidate of candidates) {
    const existing = selected.get(candidate.name)
    if (!existing || candidatePriority(candidate) > candidatePriority(existing)) selected.set(candidate.name, candidate)
  }

  const missing = REQUIRED_AUTH_COOKIES.filter((name) => !selected.has(name))
  if (missing.length) {
    invalidCookieFile(
      'File không chứa phiên đăng nhập Shopee Affiliate hợp lệ. Hãy đăng nhập lại rồi xuất cookie tại affiliate.shopee.vn.',
      { missingCookies: missing },
    )
  }

  const cookieHeader = [...selected.values()].map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  if (cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) invalidCookieFile('Cookie Shopee vượt quá kích thước cho phép')

  return { cookieCount: selected.size, cookieHeader }
}
