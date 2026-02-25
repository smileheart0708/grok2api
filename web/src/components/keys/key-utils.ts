import type { AdminApiKeyLimitsInput, AdminApiKeyRow } from '@/types/admin-api'

export type KeyFilterStatus = 'all' | 'active' | 'inactive' | 'exhausted'

export interface KeyFilterState {
  search: string
  status: KeyFilterStatus
}

export interface KeyStats {
  total: number
  active: number
  inactive: number
  exhausted: number
}

export interface KeyLimitDraft {
  chat: string
  image: string
  video: string
}

export interface KeyEditorSubmitPayload {
  name: string
  key: string
  is_active: boolean
  limits: AdminApiKeyLimitsInput
}

export const DEFAULT_KEY_FILTERS: KeyFilterState = {
  search: '',
  status: 'all',
}

export const DEFAULT_KEY_LIMIT_DRAFT: KeyLimitDraft = {
  chat: '',
  image: '',
  video: '',
}

export function formatLimit(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '不限'
  return String(Math.floor(value))
}

export function formatCreatedAt(createdAtSec: number): string {
  if (!Number.isFinite(createdAtSec) || createdAtSec <= 0) return '-'
  return new Date(Math.floor(createdAtSec) * 1000).toLocaleString()
}

export function formatLastUsedAt(lastUsedAtMs: number | null): string {
  if (typeof lastUsedAtMs !== 'number' || !Number.isFinite(lastUsedAtMs) || lastUsedAtMs <= 0) return '-'
  return new Date(Math.floor(lastUsedAtMs)).toLocaleString()
}

export function formatUsagePair(row: AdminApiKeyRow): string {
  const usage = row.usage_today
  return `${String(usage.chat_used)} / ${String(usage.image_used)} / ${String(usage.video_used)}`
}

export function formatLimitPair(row: AdminApiKeyRow): string {
  return `${formatLimit(row.chat_limit)} / ${formatLimit(row.image_limit)} / ${formatLimit(row.video_limit)}`
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

export function isApiKeyExhausted(row: AdminApiKeyRow): boolean {
  const values = [
    row.remaining_today.chat,
    row.remaining_today.image,
    row.remaining_today.video,
  ].filter((item): item is number => item !== null)

  if (values.length === 0) return false
  return values.some((value) => value <= 0)
}

export function isApiKeyActive(row: AdminApiKeyRow): boolean {
  return row.is_active && !isApiKeyExhausted(row)
}

export function buildKeyStats(rows: readonly AdminApiKeyRow[]): KeyStats {
  let active = 0
  let inactive = 0
  let exhausted = 0

  for (const row of rows) {
    if (row.is_active) {
      active += 1
    } else {
      inactive += 1
    }
    if (isApiKeyExhausted(row)) {
      exhausted += 1
    }
  }

  return {
    total: rows.length,
    active,
    inactive,
    exhausted,
  }
}

export function filterApiKeys(rows: readonly AdminApiKeyRow[], filterState: KeyFilterState): AdminApiKeyRow[] {
  const keyword = normalizeSearch(filterState.search)
  const status = filterState.status

  return rows.filter((row) => {
    if (keyword) {
      const haystack = `${row.name} ${row.key} ${row.display_key}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }

    if (status === 'active') return row.is_active
    if (status === 'inactive') return !row.is_active
    if (status === 'exhausted') return isApiKeyExhausted(row)
    return true
  })
}

export function toLimitDraft(row: AdminApiKeyRow | null): KeyLimitDraft {
  if (!row) return { ...DEFAULT_KEY_LIMIT_DRAFT }
  return {
    chat: row.chat_limit >= 0 ? String(Math.floor(row.chat_limit)) : '',
    image: row.image_limit >= 0 ? String(Math.floor(row.image_limit)) : '',
    video: row.video_limit >= 0 ? String(Math.floor(row.video_limit)) : '',
  }
}

function parseLimitValue(value: string): number {
  const normalized = value.trim()
  if (!normalized) return -1
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return -1
  return Math.floor(parsed)
}

export function toLimitsInput(draft: KeyLimitDraft): AdminApiKeyLimitsInput {
  return {
    chat_per_day: parseLimitValue(draft.chat),
    image_per_day: parseLimitValue(draft.image),
    video_per_day: parseLimitValue(draft.video),
  }
}

function randomSegment(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const charsLen = chars.length
  const bytes = new Uint8Array(length)
  window.crypto.getRandomValues(bytes)

  let output = ''
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index]
    if (byte === undefined) continue
    const nextChar = chars[byte % charsLen]
    if (!nextChar) continue
    output += nextChar
  }
  return output
}

export function generateRandomApiKey(): string {
  return `sk-${randomSegment(24)}`
}
