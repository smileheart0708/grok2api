import type { AdminTokenPool, AdminTokenRecord, TokenFilterState } from '@/types/admin-api'

export interface TokenRow extends AdminTokenRecord {
  pool: AdminTokenPool
  key: string
}

export type TokenEditorMode = 'create' | 'edit'

export interface TokenEditorSubmitPayload {
  token: string
  pool: AdminTokenPool
  note: string
}

export interface TokenImportSubmitPayload {
  pool: AdminTokenPool
  tokens: string[]
}

export interface TokenStats {
  total: number
  active: number
  exhausted: number
  invalid: number
  chatQuota: number
  totalCalls: number
}

export const DEFAULT_TOKEN_FILTERS: TokenFilterState = {
  typeSso: false,
  typeSuperSso: false,
  statusActive: false,
  statusInvalid: false,
  statusExhausted: false,
}

export const DEFAULT_TOKEN_STATS: TokenStats = {
  total: 0,
  active: 0,
  exhausted: 0,
  invalid: 0,
  chatQuota: 0,
  totalCalls: 0,
}
