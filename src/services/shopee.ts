import { AppError } from '../lib/errors'

export interface ConvertLinksInput {
  originalLinks: string[]
  subId1?: string
  subId2?: string
  subId3?: string
  subId4?: string
  subId5?: string
}

export interface ConversionReportInput {
  startDate: string
  endDate: string
  limit: 20 | 40 | 100
  page: number
  orderId?: string
  status?: 1 | 2 | 3 | 4
}

export interface ShopeeResult<T = unknown> {
  status: number
  data: T
}

const SHOPEE_HOSTS = new Set(['shopee.vn', 'shope.ee'])
const SHOPEE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
const SHOPEE_CLIENT_HINT = '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"'

function normalizeBaseUrl(value?: string): string {
  return (value || 'https://affiliate.shopee.vn/api/v3').replace(/\/+$/, '')
}

function isAllowedShopeeHost(hostname: string): boolean {
  return SHOPEE_HOSTS.has(hostname) || hostname.endsWith('.shopee.vn') || hostname.endsWith('.shope.ee')
}

export function validateShopeeLinks(links: string[]): void {
  for (const link of links) {
    let url: URL
    try {
      url = new URL(link)
    } catch {
      throw new AppError(422, 'INVALID_SHOPEE_LINK', `Link không hợp lệ: ${link}`)
    }

    if (url.protocol !== 'https:' || !isAllowedShopeeHost(url.hostname.toLowerCase())) {
      throw new AppError(422, 'INVALID_SHOPEE_LINK', 'Chỉ chấp nhận đường dẫn HTTPS thuộc Shopee')
    }
  }
}

async function parseShopeeResponse(response: Response): Promise<unknown> {
  const rawText = await response.text()
  try {
    return JSON.parse(rawText)
  } catch {
    throw new AppError(502, 'SHOPEE_INVALID_RESPONSE', 'Shopee trả về dữ liệu không hợp lệ hoặc đang chặn yêu cầu')
  }
}

export function isShopeeAuthError(status: number, payload: unknown): boolean {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  if (value?.is_login === true) return false
  if (status === 401 || status === 403) return true
  return value?.error === 90309999 || value?.is_login === false
}

export async function convertShopeeLinks(
  cookie: string,
  input: ConvertLinksInput,
  baseApi?: string,
): Promise<ShopeeResult> {
  validateShopeeLinks(input.originalLinks)
  const baseUrl = normalizeBaseUrl(baseApi)
  const endpoint = baseUrl.includes('/gql') ? baseUrl : `${baseUrl}/gql?q=batchCustomLink`
  const query = `
    query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller) {
      batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller) {
        shortLink
        longLink
        failCode
      }
    }
  `
  const linkParams = input.originalLinks.slice(0, 5).map((link) => ({
    originalLink: link,
    advancedLinkParams: {
      subId1: input.subId1 || '',
      subId2: input.subId2 || '',
      subId3: input.subId3 || '',
      subId4: input.subId4 || '',
      subId5: input.subId5 || '',
    },
  }))

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
      cookie,
      'user-agent': SHOPEE_USER_AGENT,
      'sec-ch-ua': SHOPEE_CLIENT_HINT,
      'sec-fetch-dest': 'empty',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify({
      operationName: 'batchGetCustomLink',
      query,
      variables: { linkParams, sourceCaller: 'CUSTOM_LINK_CALLER' },
    }),
  })

  return { status: response.status, data: await parseShopeeResponse(response) }
}

export async function getShopeeConversionReport(
  cookie: string,
  input: ConversionReportInput,
  baseApi?: string,
): Promise<ShopeeResult> {
  const purchaseTimeStart = Math.floor(new Date(`${input.startDate}T00:00:00+07:00`).getTime() / 1000)
  const purchaseTimeEnd = Math.floor(new Date(`${input.endDate}T23:59:59+07:00`).getTime() / 1000)
  if (!Number.isFinite(purchaseTimeStart) || !Number.isFinite(purchaseTimeEnd) || purchaseTimeStart > purchaseTimeEnd) {
    throw new AppError(422, 'INVALID_DATE_RANGE', 'Khoảng ngày báo cáo không hợp lệ')
  }

  const baseUrl = normalizeBaseUrl(baseApi)
  const endpoint = new URL(baseUrl.endsWith('/report/list') ? baseUrl : `${baseUrl}/report/list`)
  endpoint.search = new URLSearchParams({
    page_num: String(input.page),
    page_size: String(input.limit),
    purchase_time_s: String(purchaseTimeStart),
    purchase_time_e: String(purchaseTimeEnd),
    version: '1',
  }).toString()
  if (input.orderId?.trim()) endpoint.searchParams.set('order_sn', input.orderId.trim())
  if (input.status !== undefined) endpoint.searchParams.set('order_status', String(input.status))

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
      cookie,
      'user-agent': SHOPEE_USER_AGENT,
      'sec-fetch-dest': 'empty',
      'sec-fetch-site': 'same-origin',
    },
  })

  return { status: response.status, data: await parseShopeeResponse(response) }
}
