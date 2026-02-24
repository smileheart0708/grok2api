import { isRecord, readNumber, readString } from '@/lib/guards'

export interface AdminCreds {
  username: string
  password: string
}

const ADMIN_REQUESTED_WITH = 'grok2api-admin'
export const DEFAULT_REDIRECT_PATH = '/admin/token'

function buildAdminHeaders(contentType = false): HeadersInit {
  const headers: Record<string, string> = { 'X-Requested-With': ADMIN_REQUESTED_WITH }
  if (contentType) headers['Content-Type'] = 'application/json'
  return headers
}

function isAdminRedirectPath(value: string): boolean {
  try {
    const parsed = new URL(value, 'https://grok2api.local')
    return parsed.pathname === '/admin' || parsed.pathname.startsWith('/admin/')
  } catch {
    return false
  }
}

export function sanitizeRedirectPath(raw: string | null | undefined): string {
  const value = (raw ?? '').trim()
  if (!value) return DEFAULT_REDIRECT_PATH
  if (!value.startsWith('/')) return DEFAULT_REDIRECT_PATH
  if (value.startsWith('//')) return DEFAULT_REDIRECT_PATH
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login#')) return DEFAULT_REDIRECT_PATH
  if (value === '/chat' || value.startsWith('/chat?') || value.startsWith('/chat#')) return DEFAULT_REDIRECT_PATH
  if (value.startsWith('/api/')) return DEFAULT_REDIRECT_PATH
  if (!isAdminRedirectPath(value)) return DEFAULT_REDIRECT_PATH
  return value
}

export function buildLoginRedirect(redirectTo?: string): string {
  const target = sanitizeRedirectPath(redirectTo)
  if (!redirectTo || target === DEFAULT_REDIRECT_PATH) return '/login'
  const query = new URLSearchParams({ redirect: target })
  return `/login?${query.toString()}`
}

export async function fetchAdminSession(): Promise<boolean> {
  try {
    const response = await fetch('/api/v1/admin/session', {
      method: 'GET',
      credentials: 'include',
      headers: buildAdminHeaders(),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function loginAdmin(creds: AdminCreds): Promise<{ ok: boolean; message: string; expiresAt: number | null }> {
  try {
    const response = await fetch('/api/v1/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: buildAdminHeaders(true),
      body: JSON.stringify({
        username: creds.username.trim(),
        password: creds.password,
      }),
    })

    let message = response.ok ? '' : '用户名或密码错误'
    let expiresAt: number | null = null
    const payload: unknown = await response.json().catch(() => null)
    if (isRecord(payload)) {
      const payloadMessage = readString(payload, 'error') || readString(payload, 'message')
      if (payloadMessage) message = payloadMessage
      const expiresValue = readNumber(payload, 'expires_at', Number.NaN)
      if (Number.isFinite(expiresValue)) expiresAt = expiresValue
    }

    return {
      ok: response.ok,
      message: response.ok ? '' : (message || '登录失败'),
      expiresAt,
    }
  } catch {
    return {
      ok: false,
      message: '网络连接失败',
      expiresAt: null,
    }
  }
}

export async function logout(redirectTo?: string): Promise<void> {
  try {
    await fetch('/api/v1/admin/logout', {
      method: 'POST',
      credentials: 'include',
      headers: buildAdminHeaders(),
    })
  } catch {
    // ignore network error during logout
  }

  if (typeof window !== 'undefined') {
    window.location.assign(buildLoginRedirect(redirectTo))
  }
}

export async function fetchAdminStorageType(): Promise<string | null> {
  const authed = await fetchAdminSession()
  if (!authed) return null

  try {
    const response = await fetch('/api/v1/admin/storage', {
      method: 'GET',
      credentials: 'include',
      headers: buildAdminHeaders(),
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
