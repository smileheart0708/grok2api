import { isRecord, readArray, readBoolean, readNumber, readRecord, readString, toStringArray } from '@/lib/guards'
import type {
  AdminApiError,
  AdminApiKeyCreateInput,
  AdminCacheListItem,
  AdminCacheListPayload,
  AdminCacheLocalStats,
  AdminCacheType,
  AdminApiKeyRow,
  AdminApiKeyUpdateInput,
  AdminChatModel,
  AdminConfigApp,
  AdminConfigCache,
  AdminConfigExtraSections,
  AdminConfigGrok,
  AdminConfigKnownSections,
  AdminConfigPayload,
  AdminConfigPerformance,
  AdminConfigToken,
  AdminTokenPoolMap,
  AdminTokenRecord,
  AdminTokenTestPayload,
  AdminTokenTestResult,
} from '@/types/admin-api'

const ADMIN_REQUESTED_WITH = 'grok2api-admin'

const DEFAULT_CONFIG_KNOWN: AdminConfigKnownSections = {
  app: {
    api_key: '',
    admin_username: 'admin',
    app_key: '',
    app_url: '',
    image_format: 'url',
    video_format: 'url',
  },
  grok: {
    temporary: false,
    stream: true,
    thinking: false,
    dynamic_statsig: true,
    filter_tags: [],
    video_poster_preview: false,
    timeout: 600,
    base_proxy_url: '',
    asset_proxy_url: '',
    cf_clearance: '',
    max_retry: 3,
    retry_status_codes: [401, 429, 403],
    image_generation_method: 'legacy',
  },
  token: {
    auto_refresh: true,
    refresh_interval_hours: 8,
    fail_threshold: 5,
    save_delay_ms: 500,
    reload_interval_sec: 30,
  },
  cache: {
    enable_auto_clean: true,
    limit_mb: 1024,
    keep_base64_cache: false,
  },
  performance: {
    assets_max_concurrent: 25,
    media_max_concurrent: 50,
    usage_max_concurrent: 25,
    assets_delete_batch_size: 10,
    admin_assets_batch_size: 10,
  },
}

export class AdminApiRequestError extends Error implements AdminApiError {
  status: number
  code: string | null
  payload: unknown

  constructor({ message, status, code, payload }: AdminApiError) {
    super(message)
    this.name = 'AdminApiRequestError'
    this.status = status
    this.code = code
    this.payload = payload
  }
}

function buildAdminHeaders(customHeaders?: HeadersInit, contentType = false): Headers {
  const headers = new Headers(customHeaders)
  headers.set('X-Requested-With', ADMIN_REQUESTED_WITH)
  if (contentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return headers
}

function parseErrorPayload(payload: unknown, status: number, statusText: string): AdminApiError {
  let message = `HTTP ${String(status)} ${statusText || 'Request Failed'}`
  let code: string | null = null

  if (typeof payload === 'string' && payload.trim()) {
    message = payload.trim()
  } else if (isRecord(payload)) {
    const nestedError = readRecord(payload, 'error')
    const rawMessage =
      readString(payload, 'detail')
      || readString(payload, 'message')
      || readString(payload, 'error')
      || (nestedError ? readString(nestedError, 'message') : '')
    if (rawMessage.trim()) {
      message = rawMessage.trim()
    }

    const payloadCode = readString(payload, 'code')
    const nestedCode = nestedError ? readString(nestedError, 'code') : ''
    code = payloadCode || nestedCode || null
  }

  return {
    message,
    status,
    code,
    payload,
  }
}

function parseBusinessError(payload: Record<string, unknown>, fallback: string): AdminApiError | null {
  const successValue = payload['success']
  if (typeof successValue === 'boolean' && !successValue) {
    const nestedError = readRecord(payload, 'error')
    const message =
      readString(payload, 'message')
      || readString(payload, 'error')
      || (nestedError ? readString(nestedError, 'message') : '')
      || fallback
    const code = readString(payload, 'code') || (nestedError ? readString(nestedError, 'code') : '') || null
    return { message, status: 200, code, payload }
  }

  const statusValue = readString(payload, 'status').trim().toLowerCase()
  if (statusValue === 'error') {
    const message = readString(payload, 'error') || readString(payload, 'message') || fallback
    const code = readString(payload, 'code') || null
    return { message, status: 200, code, payload }
  }

  return null
}

function assertBusinessOk(payload: unknown, fallback: string): void {
  if (!isRecord(payload)) return
  const businessError = parseBusinessError(payload, fallback)
  if (businessError) {
    throw new AdminApiRequestError(businessError)
  }
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function requestAdmin(path: string, init: RequestInit = {}, jsonBody = false): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: buildAdminHeaders(init.headers, jsonBody),
  })
  const payload = await parseJsonSafely(response)

  if (!response.ok) {
    throw new AdminApiRequestError(parseErrorPayload(payload, response.status, response.statusText))
  }

  return payload
}

function normalizeTokenRecord(raw: unknown): AdminTokenRecord | null {
  if (!isRecord(raw)) return null

  const token = readString(raw, 'token').trim()
  if (!token) return null

  const quota = readNumber(raw, 'quota', -1)
  const quotaKnown = readBoolean(raw, 'quota_known', quota >= 0)
  const heavyQuota = readNumber(raw, 'heavy_quota', -1)
  const heavyQuotaKnown = readBoolean(raw, 'heavy_quota_known', heavyQuota >= 0)

  return {
    token,
    status: readString(raw, 'status', 'active'),
    quota,
    quota_known: quotaKnown,
    heavy_quota: heavyQuota,
    heavy_quota_known: heavyQuotaKnown,
    token_type: readString(raw, 'token_type', 'sso'),
    note: readString(raw, 'note'),
    fail_count: readNumber(raw, 'fail_count', 0),
    use_count: readNumber(raw, 'use_count', 0),
  }
}

function normalizeTokenPoolMap(payload: unknown): AdminTokenPoolMap {
  if (!isRecord(payload)) {
    return { ssoBasic: [], ssoSuper: [] }
  }

  const parsePool = (key: 'ssoBasic' | 'ssoSuper'): AdminTokenRecord[] => {
    const list = readArray(payload, key)
    const out: AdminTokenRecord[] = []
    for (const item of list) {
      const normalized = normalizeTokenRecord(item)
      if (normalized) out.push(normalized)
    }
    return out
  }

  return {
    ssoBasic: parsePool('ssoBasic'),
    ssoSuper: parsePool('ssoSuper'),
  }
}

function normalizeUsageNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

function normalizeLimitNumber(value: number): number {
  if (!Number.isFinite(value)) return -1
  return Math.floor(value)
}

function normalizeRemainingValue(section: Record<string, unknown> | null, key: string): number | null {
  if (!section) return null
  const value = section[key]
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.floor(value))
}

function normalizeApiKeyRow(raw: unknown): AdminApiKeyRow | null {
  if (!isRecord(raw)) return null

  const key = readString(raw, 'key').trim()
  if (!key) return null

  const usageSection = readRecord(raw, 'usage_today')
  const remainingSection = readRecord(raw, 'remaining_today')
  const createdAt = readNumber(raw, 'created_at', 0)
  const lastUsedAt = readNumber(raw, 'last_used_at', 0)

  return {
    key,
    name: readString(raw, 'name'),
    created_at: Number.isFinite(createdAt) ? Math.max(0, Math.floor(createdAt)) : 0,
    last_used_at: Number.isFinite(lastUsedAt) && lastUsedAt > 0 ? Math.floor(lastUsedAt) : null,
    is_active: readBoolean(raw, 'is_active', true),
    display_key: readString(raw, 'display_key') || key,
    chat_limit: normalizeLimitNumber(readNumber(raw, 'chat_limit', -1)),
    heavy_limit: normalizeLimitNumber(readNumber(raw, 'heavy_limit', -1)),
    image_limit: normalizeLimitNumber(readNumber(raw, 'image_limit', -1)),
    video_limit: normalizeLimitNumber(readNumber(raw, 'video_limit', -1)),
    usage_today: {
      chat_used: normalizeUsageNumber(readNumber(usageSection ?? {}, 'chat_used', 0)),
      heavy_used: normalizeUsageNumber(readNumber(usageSection ?? {}, 'heavy_used', 0)),
      image_used: normalizeUsageNumber(readNumber(usageSection ?? {}, 'image_used', 0)),
      video_used: normalizeUsageNumber(readNumber(usageSection ?? {}, 'video_used', 0)),
    },
    remaining_today: {
      chat: normalizeRemainingValue(remainingSection, 'chat'),
      heavy: normalizeRemainingValue(remainingSection, 'heavy'),
      image: normalizeRemainingValue(remainingSection, 'image'),
      video: normalizeRemainingValue(remainingSection, 'video'),
    },
  }
}

function normalizeApiKeyList(payload: unknown): AdminApiKeyRow[] {
  if (!isRecord(payload)) return []
  const data = readArray(payload, 'data')
  const rows: AdminApiKeyRow[] = []
  for (const item of data) {
    const row = normalizeApiKeyRow(item)
    if (row) rows.push(row)
  }
  return rows
}

function normalizeNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

function normalizeNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return value
}

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.floor(value)
}

function normalizeCacheStatsSection(section: Record<string, unknown> | null): AdminCacheLocalStats['local_image'] {
  const source = section ?? {}
  return {
    count: normalizeNonNegativeInteger(readNumber(source, 'count', 0)),
    size_bytes: normalizeNonNegativeInteger(readNumber(source, 'size_bytes', 0)),
    size_mb: normalizeNonNegativeNumber(readNumber(source, 'size_mb', 0)),
  }
}

function normalizeCacheLocalStats(payload: unknown): AdminCacheLocalStats {
  if (!isRecord(payload)) {
    return {
      local_image: normalizeCacheStatsSection(null),
      local_video: normalizeCacheStatsSection(null),
    }
  }

  return {
    local_image: normalizeCacheStatsSection(readRecord(payload, 'local_image')),
    local_video: normalizeCacheStatsSection(readRecord(payload, 'local_video')),
  }
}

function normalizeCacheListItem(raw: unknown): AdminCacheListItem | null {
  if (!isRecord(raw)) return null

  const name = readString(raw, 'name').trim()
  if (!name) return null

  return {
    name,
    size_bytes: normalizeNonNegativeInteger(readNumber(raw, 'size_bytes', 0)),
    mtime_ms: normalizeNonNegativeInteger(readNumber(raw, 'mtime_ms', 0)),
    preview_url: readString(raw, 'preview_url'),
  }
}

function normalizeCacheListPayload(payload: unknown): AdminCacheListPayload {
  if (!isRecord(payload)) {
    return {
      total: 0,
      page: 1,
      page_size: 1000,
      items: [],
    }
  }

  const list = readArray(payload, 'items')
  const items: AdminCacheListItem[] = []
  for (const item of list) {
    const normalized = normalizeCacheListItem(item)
    if (normalized) items.push(normalized)
  }

  return {
    total: normalizeNonNegativeInteger(readNumber(payload, 'total', items.length)),
    page: normalizePositiveInteger(readNumber(payload, 'page', 1), 1),
    page_size: normalizePositiveInteger(readNumber(payload, 'page_size', 1000), 1000),
    items,
  }
}

function cloneKnownConfig(config: AdminConfigKnownSections): AdminConfigKnownSections {
  return {
    app: { ...config.app },
    grok: {
      ...config.grok,
      filter_tags: [...config.grok.filter_tags],
      retry_status_codes: [...config.grok.retry_status_codes],
    },
    token: { ...config.token },
    cache: { ...config.cache },
    performance: { ...config.performance },
  }
}

function normalizeImageFormat(value: string): AdminConfigApp['image_format'] {
  if (value === 'base64' || value === 'b64_json') return value
  return 'url'
}

function normalizeVideoFormat(value: string): AdminConfigApp['video_format'] {
  if (value === 'url') return 'url'
  return 'url'
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function normalizeNumber(value: unknown, fallback: number, min = Number.NEGATIVE_INFINITY): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.floor(parsed))
}

function normalizeNumberArray(value: unknown, fallback: readonly number[]): number[] {
  if (!Array.isArray(value)) return [...fallback]
  const out: number[] = []
  for (const item of value) {
    const parsed = Number(item)
    if (!Number.isFinite(parsed)) continue
    out.push(Math.floor(parsed))
  }
  return out.length > 0 ? out : [...fallback]
}

function normalizeAppConfig(section: Record<string, unknown> | null): AdminConfigApp {
  const defaults = DEFAULT_CONFIG_KNOWN.app
  if (!section) return { ...defaults }

  return {
    api_key: readString(section, 'api_key', defaults.api_key),
    admin_username: readString(section, 'admin_username', defaults.admin_username),
    app_key: readString(section, 'app_key', defaults.app_key),
    app_url: readString(section, 'app_url', defaults.app_url),
    image_format: normalizeImageFormat(readString(section, 'image_format', defaults.image_format)),
    video_format: normalizeVideoFormat(readString(section, 'video_format', defaults.video_format)),
  }
}

function normalizeGrokConfig(section: Record<string, unknown> | null): AdminConfigGrok {
  const defaults = DEFAULT_CONFIG_KNOWN.grok
  if (!section) {
    return {
      ...defaults,
      filter_tags: [...defaults.filter_tags],
      retry_status_codes: [...defaults.retry_status_codes],
    }
  }

  const tagValues = toStringArray(section['filter_tags'])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  const retryCodes = normalizeNumberArray(section['retry_status_codes'], defaults.retry_status_codes)

  return {
    temporary: normalizeBoolean(section['temporary'], defaults.temporary),
    stream: normalizeBoolean(section['stream'], defaults.stream),
    thinking: normalizeBoolean(section['thinking'], defaults.thinking),
    dynamic_statsig: normalizeBoolean(section['dynamic_statsig'], defaults.dynamic_statsig),
    filter_tags: tagValues,
    video_poster_preview: normalizeBoolean(section['video_poster_preview'], defaults.video_poster_preview),
    timeout: normalizeNumber(section['timeout'], defaults.timeout, 1),
    base_proxy_url: readString(section, 'base_proxy_url', defaults.base_proxy_url),
    asset_proxy_url: readString(section, 'asset_proxy_url', defaults.asset_proxy_url),
    cf_clearance: readString(section, 'cf_clearance', defaults.cf_clearance),
    max_retry: normalizeNumber(section['max_retry'], defaults.max_retry, 0),
    retry_status_codes: retryCodes,
    image_generation_method: readString(section, 'image_generation_method', defaults.image_generation_method),
  }
}

function normalizeTokenConfig(section: Record<string, unknown> | null): AdminConfigToken {
  const defaults = DEFAULT_CONFIG_KNOWN.token
  if (!section) return { ...defaults }

  return {
    auto_refresh: normalizeBoolean(section['auto_refresh'], defaults.auto_refresh),
    refresh_interval_hours: normalizeNumber(section['refresh_interval_hours'], defaults.refresh_interval_hours, 1),
    fail_threshold: normalizeNumber(section['fail_threshold'], defaults.fail_threshold, 1),
    save_delay_ms: normalizeNumber(section['save_delay_ms'], defaults.save_delay_ms, 0),
    reload_interval_sec: normalizeNumber(section['reload_interval_sec'], defaults.reload_interval_sec, 0),
  }
}

function normalizeCacheConfig(section: Record<string, unknown> | null): AdminConfigCache {
  const defaults = DEFAULT_CONFIG_KNOWN.cache
  if (!section) return { ...defaults }

  return {
    enable_auto_clean: normalizeBoolean(section['enable_auto_clean'], defaults.enable_auto_clean),
    limit_mb: normalizeNumber(section['limit_mb'], defaults.limit_mb, 1),
    keep_base64_cache: normalizeBoolean(section['keep_base64_cache'], defaults.keep_base64_cache),
  }
}

function normalizePerformanceConfig(section: Record<string, unknown> | null): AdminConfigPerformance {
  const defaults = DEFAULT_CONFIG_KNOWN.performance
  if (!section) return { ...defaults }

  return {
    assets_max_concurrent: normalizeNumber(section['assets_max_concurrent'], defaults.assets_max_concurrent, 1),
    media_max_concurrent: normalizeNumber(section['media_max_concurrent'], defaults.media_max_concurrent, 1),
    usage_max_concurrent: normalizeNumber(section['usage_max_concurrent'], defaults.usage_max_concurrent, 1),
    assets_delete_batch_size: normalizeNumber(section['assets_delete_batch_size'], defaults.assets_delete_batch_size, 1),
    admin_assets_batch_size: normalizeNumber(section['admin_assets_batch_size'], defaults.admin_assets_batch_size, 1),
  }
}

function normalizeExtraSections(payload: Record<string, unknown>): AdminConfigExtraSections {
  const extras: AdminConfigExtraSections = {}
  for (const [section, value] of Object.entries(payload)) {
    if (section === 'app' || section === 'grok' || section === 'token' || section === 'cache' || section === 'performance') {
      continue
    }
    if (!isRecord(value)) continue
    extras[section] = { ...value }
  }
  return extras
}

function normalizeConfigPayload(payload: unknown): AdminConfigPayload {
  if (!isRecord(payload)) {
    return {
      ...cloneKnownConfig(DEFAULT_CONFIG_KNOWN),
      extras: {},
    }
  }

  return {
    app: normalizeAppConfig(readRecord(payload, 'app')),
    grok: normalizeGrokConfig(readRecord(payload, 'grok')),
    token: normalizeTokenConfig(readRecord(payload, 'token')),
    cache: normalizeCacheConfig(readRecord(payload, 'cache')),
    performance: normalizePerformanceConfig(readRecord(payload, 'performance')),
    extras: normalizeExtraSections(payload),
  }
}

function buildConfigSaveBody(payload: AdminConfigPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    app: { ...payload.app },
    grok: {
      ...payload.grok,
      filter_tags: [...payload.grok.filter_tags],
      retry_status_codes: [...payload.grok.retry_status_codes],
    },
    token: { ...payload.token },
    cache: { ...payload.cache },
    performance: { ...payload.performance },
  }

  for (const [section, value] of Object.entries(payload.extras)) {
    body[section] = { ...value }
  }
  return body
}

export async function fetchAdminTokens(): Promise<AdminTokenPoolMap> {
  const payload = await requestAdmin('/api/v1/admin/tokens')
  assertBusinessOk(payload, '加载 Token 失败')
  return normalizeTokenPoolMap(payload)
}

export async function saveAdminTokens(tokens: AdminTokenPoolMap): Promise<void> {
  const payload = await requestAdmin(
    '/api/v1/admin/tokens',
    {
      method: 'POST',
      body: JSON.stringify(tokens),
    },
    true,
  )
  assertBusinessOk(payload, '保存 Token 失败')
}

export async function refreshAdminTokens(tokens: readonly string[]): Promise<Record<string, boolean>> {
  const payload = await requestAdmin(
    '/api/v1/admin/tokens/refresh',
    {
      method: 'POST',
      body: JSON.stringify({ tokens }),
    },
    true,
  )

  assertBusinessOk(payload, '刷新 Token 失败')
  if (!isRecord(payload)) return {}

  const resultsRecord = readRecord(payload, 'results')
  if (!resultsRecord) return {}

  const out: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(resultsRecord)) {
    out[key] = typeof value === 'boolean' ? value : false
  }
  return out
}

export async function fetchAdminChatModels(): Promise<AdminChatModel[]> {
  const payload = await requestAdmin('/api/v1/admin/models/chat')
  assertBusinessOk(payload, '加载聊天模型失败')
  if (!isRecord(payload)) return []

  const data = readArray(payload, 'data')
  const out: AdminChatModel[] = []
  for (const item of data) {
    if (!isRecord(item)) continue
    const id = readString(item, 'id').trim()
    if (!id) continue
    const displayName = readString(item, 'display_name').trim() || id
    out.push({
      id,
      displayName,
      description: readString(item, 'description'),
    })
  }
  return out
}

export async function testAdminToken(payload: AdminTokenTestPayload): Promise<AdminTokenTestResult> {
  const response = await requestAdmin(
    '/api/v1/admin/tokens/test',
    {
      method: 'POST',
      body: JSON.stringify({
        token: payload.token,
        token_type: payload.tokenType,
        model: payload.model,
      }),
    },
    true,
  )

  assertBusinessOk(response, '测试 Token 失败')
  if (!isRecord(response)) {
    return {
      success: false,
      upstreamStatus: 0,
      result: null,
      reactivated: false,
      quotaRefreshSuccess: false,
      quotaRefreshRemaining: null,
      quotaRefreshError: '响应格式无效',
    }
  }

  const quotaRefresh = readRecord(response, 'quota_refresh')
  const quotaRefreshRemainingValue = quotaRefresh ? readNumber(quotaRefresh, 'remaining_queries', Number.NaN) : Number.NaN
  const quotaRefreshRemaining = Number.isFinite(quotaRefreshRemainingValue) ? quotaRefreshRemainingValue : null
  return {
    success: readBoolean(response, 'success', false),
    upstreamStatus: readNumber(response, 'upstream_status', 0),
    result: response['result'] ?? null,
    reactivated: readBoolean(response, 'reactivated', false),
    quotaRefreshSuccess: quotaRefresh ? readBoolean(quotaRefresh, 'success', false) : false,
    quotaRefreshRemaining,
    quotaRefreshError: quotaRefresh ? readString(quotaRefresh, 'error') || null : null,
  }
}

export async function fetchAdminApiKeys(): Promise<AdminApiKeyRow[]> {
  const payload = await requestAdmin('/api/v1/admin/keys')
  assertBusinessOk(payload, '加载 API Key 失败')
  return normalizeApiKeyList(payload)
}

export async function createAdminApiKey(input: AdminApiKeyCreateInput): Promise<AdminApiKeyRow | null> {
  const payload = await requestAdmin(
    '/api/v1/admin/keys',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    true,
  )
  assertBusinessOk(payload, '创建 API Key 失败')
  if (!isRecord(payload)) return null
  return normalizeApiKeyRow(payload['data']) ?? null
}

export async function updateAdminApiKey(input: AdminApiKeyUpdateInput): Promise<void> {
  const payload = await requestAdmin(
    '/api/v1/admin/keys/update',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    true,
  )
  assertBusinessOk(payload, '更新 API Key 失败')
}

export async function deleteAdminApiKey(key: string): Promise<void> {
  const payload = await requestAdmin(
    '/api/v1/admin/keys/delete',
    {
      method: 'POST',
      body: JSON.stringify({ key }),
    },
    true,
  )
  assertBusinessOk(payload, '删除 API Key 失败')
}

export async function fetchAdminCacheLocalStats(): Promise<AdminCacheLocalStats> {
  const payload = await requestAdmin('/api/v1/admin/cache/local')
  assertBusinessOk(payload, '加载缓存统计失败')
  return normalizeCacheLocalStats(payload)
}

export async function fetchAdminCacheList(
  type: AdminCacheType,
  page = 1,
  pageSize = 1000,
): Promise<AdminCacheListPayload> {
  const params = new URLSearchParams({
    type,
    page: String(normalizePositiveInteger(page, 1)),
    page_size: String(normalizePositiveInteger(pageSize, 1000)),
  })
  const payload = await requestAdmin(`/api/v1/admin/cache/list?${params.toString()}`)
  assertBusinessOk(payload, '加载缓存列表失败')
  return normalizeCacheListPayload(payload)
}

export async function clearAdminCache(type: AdminCacheType): Promise<number> {
  const payload = await requestAdmin(
    '/api/v1/admin/cache/clear',
    {
      method: 'POST',
      body: JSON.stringify({ type }),
    },
    true,
  )
  assertBusinessOk(payload, '清理缓存失败')
  if (!isRecord(payload)) return 0
  const result = readRecord(payload, 'result')
  if (!result) return 0
  return normalizeNonNegativeInteger(readNumber(result, 'deleted', 0))
}

export async function deleteAdminCacheItem(type: AdminCacheType, name: string): Promise<boolean> {
  const payload = await requestAdmin(
    '/api/v1/admin/cache/item/delete',
    {
      method: 'POST',
      body: JSON.stringify({
        type,
        name,
      }),
    },
    true,
  )
  assertBusinessOk(payload, '删除缓存文件失败')
  if (!isRecord(payload)) return true
  const result = readRecord(payload, 'result')
  if (!result) return true
  return readBoolean(result, 'deleted', true)
}

export async function fetchAdminConfig(): Promise<AdminConfigPayload> {
  const payload = await requestAdmin('/api/v1/admin/config')
  assertBusinessOk(payload, '加载配置失败')
  return normalizeConfigPayload(payload)
}

export async function saveAdminConfig(payload: AdminConfigPayload): Promise<string> {
  const response = await requestAdmin(
    '/api/v1/admin/config',
    {
      method: 'POST',
      body: JSON.stringify(buildConfigSaveBody(payload)),
    },
    true,
  )
  assertBusinessOk(response, '保存配置失败')
  if (!isRecord(response)) return '配置已保存'
  return readString(response, 'message') || '配置已保存'
}
