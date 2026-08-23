import assert from 'node:assert/strict'
import test from 'node:test'
import { AppError } from './errors'
import { parseShopeeCookieFile } from './shopee-cookie'

const future = 2_000_000_000

function exportedCookie(name: string, value: string, overrides: Record<string, unknown> = {}) {
  return {
    domain: '.shopee.vn',
    expirationDate: future,
    hostOnly: false,
    name,
    path: '/',
    value,
    ...overrides,
  }
}

test('converts a J2TEAM Cookies export into a Cookie request header', () => {
  const result = parseShopeeCookieFile(JSON.stringify({
    url: 'https://affiliate.shopee.vn/',
    cookies: [
      exportedCookie('SPC_ST', 'session-token'),
      exportedCookie('SPC_U', '123456'),
      exportedCookie('language', 'vi'),
      exportedCookie('IGNORED', 'other-site', { domain: '.example.com' }),
    ],
  }), 1_800_000_000_000)

  assert.equal(result.cookieCount, 3)
  assert.equal(result.cookieHeader, 'SPC_ST=session-token; SPC_U=123456; language=vi')
})

test('accepts the array-only J2TEAM export format', () => {
  const result = parseShopeeCookieFile(JSON.stringify([
    exportedCookie('SPC_ST', 'session-token'),
    exportedCookie('SPC_U', '123456'),
  ]), 1_800_000_000_000)

  assert.equal(result.cookieCount, 2)
})

test('prefers the cookie scoped directly to affiliate.shopee.vn', () => {
  const result = parseShopeeCookieFile(JSON.stringify({ cookies: [
    exportedCookie('SPC_ST', 'parent-token'),
    exportedCookie('SPC_ST', 'affiliate-token', { domain: 'affiliate.shopee.vn', hostOnly: true }),
    exportedCookie('SPC_U', '123456'),
  ] }), 1_800_000_000_000)

  assert.match(result.cookieHeader, /SPC_ST=affiliate-token/)
  assert.doesNotMatch(result.cookieHeader, /parent-token/)
})

test('rejects expired or incomplete Shopee sessions', () => {
  assert.throws(
    () => parseShopeeCookieFile(JSON.stringify({ cookies: [
      exportedCookie('SPC_ST', 'expired', { expirationDate: 1_700_000_000 }),
      exportedCookie('SPC_U', '123456'),
    ] }), 1_800_000_000_000),
    (error) => error instanceof AppError && error.code === 'INVALID_SHOPEE_COOKIE_FILE',
  )
})

test('rejects header injection characters in cookie values', () => {
  assert.throws(
    () => parseShopeeCookieFile(JSON.stringify({ cookies: [
      exportedCookie('SPC_ST', 'bad\r\nheader'),
      exportedCookie('SPC_U', '123456'),
    ] }), 1_800_000_000_000),
    (error) => error instanceof AppError && error.code === 'INVALID_SHOPEE_COOKIE_FILE',
  )
})
