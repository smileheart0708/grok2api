import type { AdminTokenDisplayStatus, AdminTokenPool } from '@/types/admin-api'
import type { TokenRow } from '@/components/token/token-types'

export function normalizeSsoToken(rawToken: string): string {
  const normalized = rawToken.trim()
  if (!normalized) return ''
  return normalized.startsWith('sso=') ? normalized.slice(4).trim() : normalized
}

export function toDisplayToken(rawToken: string): string {
  const normalized = normalizeSsoToken(rawToken)
  if (!normalized) return ''
  return `sso=${normalized}`
}

export function createTokenKey(rawToken: string): string {
  return normalizeSsoToken(rawToken)
}

export function poolToTokenType(pool: AdminTokenPool): 'sso' | 'ssoSuper' {
  return pool === 'ssoSuper' ? 'ssoSuper' : 'sso'
}

export function normalizeTokenStatus(status: string): AdminTokenDisplayStatus {
  const value = status.trim().toLowerCase()
  if (
    value === 'active' ||
    value === 'cooling' ||
    value === 'exhausted' ||
    value === 'invalid' ||
    value === 'unknown'
  ) {
    return value
  }
  if (value === 'expired') return 'invalid'
  return 'unknown'
}

export function isTokenInvalid(row: TokenRow): boolean {
  const status = normalizeTokenStatus(row.status)
  return status === 'invalid'
}

export function isTokenExhausted(row: TokenRow): boolean {
  const status = normalizeTokenStatus(row.status)
  return status === 'exhausted' || status === 'cooling'
}

export function isTokenActive(row: TokenRow): boolean {
  return normalizeTokenStatus(row.status) === 'active'
}

export function getTokenStatusLabel(row: TokenRow): string {
  const status = normalizeTokenStatus(row.status)
  if (status === 'active') return '活跃'
  if (status === 'cooling') return '冷却中'
  if (status === 'exhausted') return '额度用尽'
  if (status === 'unknown') return '未知'
  return '失效'
}

export function getTokenStatusClass(row: TokenRow): string {
  const status = normalizeTokenStatus(row.status)
  if (status === 'active') return 'badge-green'
  if (status === 'cooling' || status === 'exhausted' || status === 'unknown') return 'badge-orange'
  return 'badge-red'
}

export function shortenToken(displayToken: string): string {
  if (displayToken.length <= 24) return displayToken
  return `${displayToken.slice(0, 8)}...${displayToken.slice(displayToken.length - 16)}`
}
