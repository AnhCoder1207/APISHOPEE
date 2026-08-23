import type { ReportRow } from './types'

export class ApiError extends Error {
  code?: string
  status?: number
  details?: unknown
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  const payload = await response.json().catch(() => ({ success: false, error: { message: 'Máy chủ trả về dữ liệu không hợp lệ' } }))
  if (!response.ok) {
    const error = new ApiError(payload?.error?.message || 'Yêu cầu không thành công')
    error.code = payload?.error?.code
    error.status = response.status
    error.details = payload?.error?.details
    throw error
  }
  return payload.data as T
}

export function formatNumber(value: unknown): string {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0))
}

export function formatMoney(value: unknown): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export function formatInternalMoney(value: unknown): string {
  return formatMoney(Number(value || 0) / 100_000)
}

export function formatDateTime(value?: string | null): string {
  if (!value) return 'Chưa kiểm tra'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function localDate(daysAgo = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - daysAgo * 86_400_000))
}

export function initials(name: string): string {
  return String(name || 'U').trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase()
}

export function safeExternalUrl(value: unknown): string {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
}

export async function readCookieExport(file: File): Promise<unknown> {
  if (file.size > 512_000) throw new Error('File cookie vượt quá dung lượng tối đa 500 KB')
  if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
    throw new Error('Vui lòng chọn file JSON được xuất từ J2TEAM Cookies')
  }
  try {
    return JSON.parse(await file.text())
  } catch {
    throw new Error('File không phải JSON hợp lệ hoặc đã bị hỏng')
  }
}

export function flattenReportEntry(entry: any): ReportRow {
  const orders = Array.isArray(entry.orders) ? entry.orders : []
  let orderValue = 0
  for (const order of orders) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const quantity = Math.max(1, Number(item.qty || 0))
      orderValue += Number(item.actual_amount || 0) || Number(item.item_price || 0) * quantity
    }
  }
  return {
    checkoutId: String(entry.checkout_id || ''),
    purchaseTime: Number(entry.purchase_time || 0),
    source: String(entry.direct_source || entry.utm_content || 'Không xác định'),
    orderCount: orders.length,
    orderValue,
    commission: Number(entry.estimated_total_commission || 0),
    status: Number(entry.conversion_status || entry.checkout_status_app || 0),
  }
}

export function statusLabel(status: number): [string, string] {
  if (status === 2) return ['Hoàn thành', '']
  if (status === 3) return ['Đã hủy', 'cancelled']
  if (status === 4) return ['Chưa thanh toán', 'pending']
  return ['Chờ xử lý', 'pending']
}

export function adminStatus(status: string): [string, string] {
  if (status === 'active' || status === 'connected') return ['Hoạt động', '']
  if (status === 'suspended') return ['Tạm khóa', 'cancelled']
  if (status === 'expired') return ['Hết hạn', 'pending']
  if (status === 'error') return ['Có lỗi', 'cancelled']
  return [status || 'Không rõ', 'pending']
}

export function exportReportCsv(rows: ReportRow[]): void {
  if (!rows.length) return
  const header = ['Checkout', 'Ngày mua', 'Nguồn', 'Số đơn', 'Giá trị VND', 'Hoa hồng VND', 'Trạng thái']
  const values = rows.map((row) => [
    row.checkoutId,
    row.purchaseTime ? new Date(row.purchaseTime * 1000).toISOString() : '',
    row.source,
    row.orderCount,
    Math.round(row.orderValue / 100_000),
    Math.round(row.commission / 100_000),
    statusLabel(row.status)[0],
  ])
  const csv = [header, ...values].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `camlink-report-${localDate()}.csv`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function isShopeeConnectionError(error: unknown): boolean {
  return error instanceof ApiError && ['SHOPEE_SESSION_EXPIRED', 'SHOPEE_CONNECTION_FAILED', 'SHOPEE_UPSTREAM_ERROR'].includes(error.code || '')
}
