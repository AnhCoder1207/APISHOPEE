import assert from 'node:assert/strict'
import test from 'node:test'
import { convertShopeeLinks, isShopeeAuthError } from './shopee'

test('does not classify a logged-in Shopee rejection as an expired cookie', () => {
  assert.equal(isShopeeAuthError(403, { error: 90309999, is_login: true }), false)
  assert.equal(isShopeeAuthError(403, { error: 90309999, is_login: false }), true)
})

test('sends the client hint required by Shopee link conversion', async () => {
  const originalFetch = globalThis.fetch
  let requestHeaders: Headers | undefined

  globalThis.fetch = async (_input, init) => {
    requestHeaders = new Headers(init?.headers)
    return Response.json({ data: { batchCustomLink: [] } })
  }

  try {
    await convertShopeeLinks('SPC_ST=test; SPC_U=123', {
      originalLinks: ['https://shopee.vn/product/119017165/5170782167'],
    })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(
    requestHeaders?.get('sec-ch-ua'),
    '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
  )
})
