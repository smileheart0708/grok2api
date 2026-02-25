import type { AdminTokenPool } from '@/types/admin-api'
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

export function normalizeTokenStatus(status: string): string {
  const value = status.trim().toLowerCase()
  if (value === 'expired') return 'invalid'
  if (value === 'active' || value === 'cooling' || value === 'invalid' || value === 'disabled')
    return value
  return 'active'
}

export function isTokenInvalid(row: TokenRow): boolean {
  const status = normalizeTokenStatus(row.status)
  return status === 'invalid' || status === 'disabled'
}

export function isTokenExhausted(row: TokenRow): boolean {
  const status = normalizeTokenStatus(row.status)
  if (status === 'cooling') return true
  if (row.quota_known && row.quota <= 0) return true
  const tokenType = row.token_type === 'ssoSuper' ? 'ssoSuper' : 'sso'
  if (tokenType === 'ssoSuper' && row.heavy_quota_known && row.heavy_quota <= 0) return true
  return false
}

export function isTokenActive(row: TokenRow): boolean {
  return !isTokenInvalid(row) && !isTokenExhausted(row)
}

export function getTokenStatusLabel(row: TokenRow): string {
  if (isTokenActive(row)) return '活跃'
  if (isTokenExhausted(row)) return '额度用尽'
  return '失效'
}

export function getTokenStatusClass(row: TokenRow): string {
  if (isTokenActive(row)) return 'badge-green'
  if (isTokenExhausted(row)) return 'badge-orange'
  return 'badge-red'
}

export function shortenToken(displayToken: string): string {
  if (displayToken.length <= 24) return displayToken
  return `${displayToken.slice(0, 8)}...${displayToken.slice(displayToken.length - 16)}`
}
