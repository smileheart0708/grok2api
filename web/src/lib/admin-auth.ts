import { isRecord, readString } from '@/lib/guards'

export interface AdminCreds {
  username: string
  password: string
}

const APP_KEY_STORAGE = 'grok2api_app_key'
const APP_KEY_ENC_PREFIX = 'enc:v1:'
const APP_KEY_XOR_PREFIX = 'enc:xor:'
const APP_KEY_SECRET = 'grok2api-admin-key'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

let cachedAdminBearer: string | null = null
let pendingBearerRequest: Promise<string | null> | null = null

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function xorCipher(bytes: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  if (keyBytes.length === 0) return bytes

  const output = new Uint8Array(bytes.length)

  for (let index = 0; index < bytes.length; index += 1) {
    const sourceByte = bytes[index] ?? 0
    const keyByte = keyBytes[index % keyBytes.length] ?? 0
    output[index] = sourceByte ^ keyByte
  }

  return output
}

function xorDecrypt(stored: string): string {
  if (!stored.startsWith(APP_KEY_XOR_PREFIX)) return stored

  const payload = stored.slice(APP_KEY_XOR_PREFIX.length)
  const data = fromBase64(payload)
  const key = textEncoder.encode(APP_KEY_SECRET)
  const plain = xorCipher(data, key)
  return textDecoder.decode(plain)
}

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(APP_KEY_SECRET),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
}

async function decryptStoredAppKey(stored: string): Promise<string> {
  if (!stored) return ''
  if (stored.startsWith(APP_KEY_XOR_PREFIX)) return xorDecrypt(stored)
  if (!stored.startsWith(APP_KEY_ENC_PREFIX)) return stored

  const parts = stored.split(':')
  if (parts.length !== 5) return ''

  const [, , saltRaw = '', ivRaw = '', cipherRaw = ''] = parts

  const salt = fromBase64(saltRaw)
  const iv = fromBase64(ivRaw)
  const cipher = fromBase64(cipherRaw)

  const key = await deriveKey(salt)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(cipher),
  )
  return textDecoder.decode(plain)
}

function parseStoredCreds(plain: string): AdminCreds {
  const raw = plain.trim()
  if (!raw) return { username: '', password: '' }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed)) {
      const username = readString(parsed, 'username').trim()
      const password = readString(parsed, 'password').trim()

      if (username && password) {
        return { username, password }
      }
    }
  } catch {
    // 兼容旧格式：直接存储密码，用户名默认 admin
  }

  return { username: 'admin', password: raw }
}

function getStoredEncryptedValue(): string {
  if (typeof window === 'undefined') return ''

  try {
    return window.localStorage.getItem(APP_KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

function buildAdminLoginUrlWithRedirect(redirectTo?: string): string {
  const basePath = '/static/login/login.html'
  if (!redirectTo) return basePath

  const query = new URLSearchParams({ redirect: redirectTo })
  return `${basePath}?${query.toString()}`
}

async function requestAdminBearer(creds: AdminCreds): Promise<string | null> {
  const response = await fetch('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: creds.username, password: creds.password }),
  })

  if (!response.ok) return null

  const data: unknown = await response.json()
  if (!isRecord(data)) return null

  const rawApiKey = readString(data, 'api_key')
  if (!rawApiKey) return null

  return `Bearer ${rawApiKey}`
}

export async function getStoredAdminCreds(): Promise<AdminCreds> {
  const stored = getStoredEncryptedValue()
  if (!stored) return { username: '', password: '' }

  try {
    const plain = await decryptStoredAppKey(stored)
    return parseStoredCreds(plain)
  } catch {
    clearStoredAdminCreds()
    return { username: '', password: '' }
  }
}

export function clearStoredAdminCreds(): void {
  cachedAdminBearer = null
  pendingBearerRequest = null

  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(APP_KEY_STORAGE)
  } catch {
    // 忽略存储异常
  }
}

export async function fetchAdminBearer(): Promise<string | null> {
  if (cachedAdminBearer) return cachedAdminBearer
  if (pendingBearerRequest) return pendingBearerRequest

  pendingBearerRequest = (async () => {
    const creds = await getStoredAdminCreds()
    if (!creds.password) return null

    try {
      const bearer = await requestAdminBearer(creds)
      if (!bearer) {
        clearStoredAdminCreds()
        return null
      }

      cachedAdminBearer = bearer
      return bearer
    } catch {
      clearStoredAdminCreds()
      return null
    }
  })()

  const result = await pendingBearerRequest
  pendingBearerRequest = null
  return result
}

export async function fetchAdminStorageType(): Promise<string | null> {
  const bearer = await fetchAdminBearer()
  if (!bearer) return null

  try {
    const response = await fetch('/api/v1/admin/storage', {
      headers: { Authorization: bearer },
    })

    if (!response.ok) return null

    const data: unknown = await response.json()
    if (!isRecord(data)) return null

    const type = readString(data, 'type').trim()
    return type || null
  } catch {
    return null
  }
}

export function logoutToLegacyLogin(redirectTo?: string): void {
  clearStoredAdminCreds()

  if (typeof window === 'undefined') return

  window.location.replace(buildAdminLoginUrlWithRedirect(redirectTo))
}

export function formatStorageLabel(storageType: string | null): string {
  if (!storageType) return '-'

  const normalized = storageType.trim().toLowerCase()

  switch (normalized) {
    case 'local':
      return 'LOCAL'
    case 'mysql':
      return 'MYSQL'
    case 'pgsql':
    case 'postgres':
    case 'postgresql':
      return 'PGSQL'
    case 'd1':
      return 'D1'
    case 'redis':
      return 'REDIS'
    default:
      return '-'
  }
}

export function buildLegacyLoginPath(redirectTo?: string): string {
  return buildAdminLoginUrlWithRedirect(redirectTo)
}
