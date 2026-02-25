export type AdminTokenPool = 'ssoBasic' | 'ssoSuper'
export type AdminTokenType = 'sso' | 'ssoSuper'
export type AdminTokenDisplayStatus = 'active' | 'cooling' | 'exhausted' | 'invalid' | 'unknown'
export type AdminTokenQuotaSource =
  | 'queue'
  | 'auto_refresh'
  | 'manual_refresh'
  | 'admin_test'
  | 'probe'
  | 'unknown'

export interface AdminTokenQuotaBucket {
  rate_limit_model: string
  remaining_queries: number | null
  total_queries: number | null
  remaining_tokens: number | null
  total_tokens: number | null
  low_effort_cost: number | null
  high_effort_cost: number | null
  window_size_seconds: number | null
  refreshed_at: number | null
  stale: boolean
  source: AdminTokenQuotaSource
  error: string | null
}

export interface AdminTokenQuotaSummary {
  known_count: number
  stale_count: number
  refreshed_at: number | null
}

export interface AdminTokenRecord {
  token: string
  status: AdminTokenDisplayStatus
  token_type: AdminTokenType
  note: string
  fail_count: number
  use_count: number
  quota_summary: AdminTokenQuotaSummary
  quota_buckets: AdminTokenQuotaBucket[]
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
  rateLimitModel: string
  effortTier: 'low' | 'high'
}

export interface AdminTokenRateLimitTestResult {
  success: boolean
  model: string
  rate_limit_model: string
  effort_tier: 'low' | 'high'
  remaining_queries: number | null
  total_queries: number | null
  remaining_tokens: number | null
  total_tokens: number | null
  low_effort_cost: number | null
  high_effort_cost: number | null
  window_size_seconds: number | null
  raw_response: Record<string, unknown> | null
  error: string | null
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
  quotaRefreshRateLimitModel: string | null
  quotaRefreshRemainingTokens: number | null
  quotaRefreshError: string | null
}

export interface AdminApiKeyUsageToday {
  chat_used: number
  heavy_used: number
  image_used: number
  video_used: number
}

export interface AdminApiKeyRemainingToday {
  chat: number | null
  heavy: number | null
  image: number | null
  video: number | null
}

export interface AdminApiKeyRow {
  key: string
  name: string
  created_at: number
  last_used_at: number | null
  is_active: boolean
  display_key: string
  chat_limit: number
  heavy_limit: number
  image_limit: number
  video_limit: number
  usage_today: AdminApiKeyUsageToday
  remaining_today: AdminApiKeyRemainingToday
}

export interface AdminApiKeyLimitsInput {
  chat_per_day?: number
  heavy_per_day?: number
  image_per_day?: number
  video_per_day?: number
}

export interface AdminApiKeyCreateInput {
  name: string
  key: string
  is_active: boolean
  limits: AdminApiKeyLimitsInput
}

export interface AdminApiKeyUpdateInput {
  key: string
  name?: string
  is_active?: boolean
  limits?: AdminApiKeyLimitsInput
}

export type AdminCacheType = 'image' | 'video'

export interface AdminCacheStatsSection {
  count: number
  size_bytes: number
  size_mb: number
}

export interface AdminCacheLocalStats {
  local_image: AdminCacheStatsSection
  local_video: AdminCacheStatsSection
}

export interface AdminCacheListItem {
  name: string
  size_bytes: number
  mtime_ms: number
  preview_url: string
}

export interface AdminCacheListPayload {
  total: number
  page: number
  page_size: number
  items: AdminCacheListItem[]
}

export type AdminConfigImageFormat = 'url' | 'base64' | 'b64_json'
export type AdminConfigVideoFormat = 'url'

export interface AdminConfigApp {
  api_key: string
  admin_username: string
  app_key: string
  app_url: string
  image_format: AdminConfigImageFormat
  video_format: AdminConfigVideoFormat
}

export interface AdminConfigGrok {
  temporary: boolean
  stream: boolean
  thinking: boolean
  dynamic_statsig: boolean
  filter_tags: string[]
  video_poster_preview: boolean
  timeout: number
  base_proxy_url: string
  asset_proxy_url: string
  cf_clearance: string
  max_retry: number
  retry_status_codes: number[]
  image_generation_method: string
}

export interface AdminConfigToken {
  auto_refresh: boolean
  refresh_interval_hours: number
  fail_threshold: number
  save_delay_ms: number
  reload_interval_sec: number
}

export interface AdminConfigCache {
  enable_auto_clean: boolean
  limit_mb: number
  keep_base64_cache: boolean
}

export interface AdminConfigPerformance {
  assets_max_concurrent: number
  media_max_concurrent: number
  usage_max_concurrent: number
  assets_delete_batch_size: number
  admin_assets_batch_size: number
}

export interface AdminConfigKnownSections {
  app: AdminConfigApp
  grok: AdminConfigGrok
  token: AdminConfigToken
  cache: AdminConfigCache
  performance: AdminConfigPerformance
}

export type AdminConfigExtraSections = Record<string, Record<string, unknown>>

export interface AdminConfigPayload extends AdminConfigKnownSections {
  extras: AdminConfigExtraSections
}
