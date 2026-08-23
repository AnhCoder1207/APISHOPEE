const encoder = new TextEncoder()
const decoder = new TextDecoder()
const PASSWORD_ITERATIONS = 310_000

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

async function importPasswordKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
}

export function randomToken(byteLength = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return toBase64Url(new Uint8Array(digest))
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await importPasswordKey(password)
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  )

  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(derived))}`
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, iterationsValue, saltValue, expectedValue] = encodedHash.split('$')
  if (algorithm !== 'pbkdf2_sha256' || !iterationsValue || !saltValue || !expectedValue) return false

  const iterations = Number(iterationsValue)
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false

  const key = await importPasswordKey(password)
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBuffer(fromBase64Url(saltValue)), iterations },
      key,
      256,
    ),
  )
  const expected = fromBase64Url(expectedValue)

  if (derived.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < derived.length; index += 1) difference |= derived[index] ^ expected[index]
  return difference === 0
}

async function getEncryptionKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('COOKIE_ENCRYPTION_KEY phải có ít nhất 32 ký tự')
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(value: string, secret: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const key = await getEncryptionKey(secret)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, encoder.encode(value))
  return `v1.${toBase64Url(nonce)}.${toBase64Url(new Uint8Array(encrypted))}`
}

export async function decryptSecret(value: string, secret: string): Promise<string> {
  const [version, nonceValue, encryptedValue] = value.split('.')
  if (version !== 'v1' || !nonceValue || !encryptedValue) throw new Error('Dữ liệu mã hóa không hợp lệ')

  const key = await getEncryptionKey(secret)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(fromBase64Url(nonceValue)) },
    key,
    toArrayBuffer(fromBase64Url(encryptedValue)),
  )
  return decoder.decode(decrypted)
}
