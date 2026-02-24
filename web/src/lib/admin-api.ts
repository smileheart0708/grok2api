import { isRecord, readArray, readBoolean, readNumber, readRecord, readString } from '@/lib/guards'
import type {
  AdminApiError,
  AdminChatModel,
  AdminTokenPoolMap,
  AdminTokenRecord,
  AdminTokenTestPayload,
  AdminTokenTestResult,
} from '@/types/admin-api'

const ADMIN_REQUESTED_WITH = 'grok2api-admin'

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

export async function fetchAdminTokens(): Promise<AdminTokenPoolMap> {
  const payload = await requestAdmin('/api/v1/admin/tokens')
  return normalizeTokenPoolMap(payload)
}

export async function saveAdminTokens(tokens: AdminTokenPoolMap): Promise<void> {
  await requestAdmin(
    '/api/v1/admin/tokens',
    {
      method: 'POST',
      body: JSON.stringify(tokens),
    },
    true,
  )
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
