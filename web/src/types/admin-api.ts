export type AdminTokenPool = 'ssoBasic' | 'ssoSuper'
export type AdminTokenType = 'sso' | 'ssoSuper'

export interface AdminTokenRecord {
  token: string
  status: string
  quota: number
  quota_known: boolean
  heavy_quota: number
  heavy_quota_known: boolean
  token_type: string
  note: string
  fail_count: number
  use_count: number
}

export interface AdminTokenPoolMap {
  ssoBasic: AdminTokenRecord[]
  ssoSuper: AdminTokenRecord[]
}

export interface TokenFilterState {
  typeSso: boolean
  typeSuperSso: boolean
  statusActive: boolean
  statusInvalid: boolean
  statusExhausted: boolean
}

export type TokenBatchAction = 'refresh' | 'delete' | null

export interface TokenBatchActionState {
  running: boolean
  paused: boolean
  action: TokenBatchAction
  total: number
  processed: number
}

export interface AdminApiError {
  message: string
  status: number
  code: string | null
  payload: unknown
}

export interface AdminChatModel {
  id: string
  displayName: string
  description: string
}

export interface AdminTokenTestPayload {
  token: string
  tokenType: AdminTokenType
  model: string
}

export interface AdminTokenTestResult {
  success: boolean
  upstreamStatus: number
  result: unknown
  reactivated: boolean
  quotaRefreshSuccess: boolean
  quotaRefreshRemaining: number | null
  quotaRefreshError: string | null
}
