import type { AdminCacheListItem, AdminCacheType } from '@/types/admin-api'

export const CACHE_AUTO_REFRESH_MS = 10_000
export const CACHE_DELETE_BATCH_SIZE = 10
export const CACHE_LIST_PAGE_SIZE = 1000

export function cacheTypeLabel(type: AdminCacheType): string {
  return type === 'video' ? '视频' : '图片'
}

export function cacheSectionTitle(type: AdminCacheType): string {
  return type === 'video' ? '本地视频' : '本地图片'
}

export function cacheUnit(type: AdminCacheType): string {
  return type === 'video' ? '个视频文件' : '个图片文件'
}

export function formatSizeMb(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB'
  return `${value.toFixed(2)} MB`
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-'
  const kb = 1024
  const mb = kb * 1024
  if (bytes >= mb) return `${(bytes / mb).toFixed(2)} MB`
  if (bytes >= kb) return `${(bytes / kb).toFixed(1)} KB`
  return `${String(Math.floor(bytes))} B`
}

export function formatFileTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

export function cacheItemKey(type: AdminCacheType, item: Pick<AdminCacheListItem, 'name'>): string {
  return `${type}:${item.name}`
}

export function toFileUrl(type: AdminCacheType, name: string): string {
  const encodedName = encodeURIComponent(name)
  return type === 'video' ? `/v1/files/video/${encodedName}` : `/v1/files/image/${encodedName}`
}
