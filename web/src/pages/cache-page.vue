<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AdminPageShell from '@/components/admin/admin-page-shell.vue'
import CacheBatchBar from '@/components/cache/cache-batch-bar.vue'
import CacheFileTable from '@/components/cache/cache-file-table.vue'
import CacheStatsGrid from '@/components/cache/cache-stats-grid.vue'
import CacheToolbar from '@/components/cache/cache-toolbar.vue'
import {
  CACHE_AUTO_REFRESH_MS,
  CACHE_DELETE_BATCH_SIZE,
  CACHE_LIST_PAGE_SIZE,
  cacheTypeLabel,
  formatSizeMb,
  toFileUrl,
} from '@/components/cache/cache-utils'
import UiConfirmDialog from '@/components/ui/ui-confirm-dialog.vue'
import UiToastHost from '@/components/ui/ui-toast-host.vue'
import { useConfirm } from '@/composables/use-confirm'
import { useToast } from '@/composables/use-toast'
import {
  AdminApiRequestError,
  clearAdminCache,
  deleteAdminCacheItem,
  fetchAdminCacheList,
  fetchAdminCacheLocalStats,
} from '@/lib/admin-api'
import { logout } from '@/lib/admin-auth'
import type { AdminCacheListItem, AdminCacheLocalStats, AdminCacheType } from '@/types/admin-api'
import '@/styles/pages/cache-page.css'

interface ListLoadOptions {
  force?: boolean
  silent?: boolean
}

const { success, error, info } = useToast()
const {
  isOpen: confirmOpen,
  title: confirmTitle,
  message: confirmMessage,
  confirmText: confirmSubmitText,
  cancelText: confirmCancelText,
  danger: confirmDanger,
  requestConfirm,
  confirm: acceptConfirm,
  cancel: cancelConfirm,
} = useConfirm()

const activeType = ref<AdminCacheType>('image')
const imageRows = ref<AdminCacheListItem[]>([])
const videoRows = ref<AdminCacheListItem[]>([])

const listLoaded = ref({
  image: false,
  video: false,
})

const listLoading = ref({
  image: false,
  video: false,
})

interface SelectedNamesState {
  image: string[]
  video: string[]
}

const selectedNames = ref<SelectedNamesState>({
  image: [],
  video: [],
})

const clearingType = ref<AdminCacheType | null>(null)
const isDeleting = ref(false)

const localStats = ref<AdminCacheLocalStats>({
  local_image: { count: 0, size_bytes: 0, size_mb: 0 },
  local_video: { count: 0, size_bytes: 0, size_mb: 0 },
})

let autoRefreshTimer: number | null = null

const currentRows = computed(() =>
  activeType.value === 'image' ? imageRows.value : videoRows.value,
)
const currentSelectedNames = computed(() => selectedByType(activeType.value))
const currentSelectedCount = computed(() => currentSelectedNames.value.length)
const currentTypeLabel = computed(() => cacheTypeLabel(activeType.value))
const currentListLoading = computed(() => loadingByType(activeType.value))

const allSelected = computed(() => {
  const total = currentRows.value.length
  if (total === 0) return false
  return currentSelectedCount.value === total
})

const hasPartialSelection = computed(() => {
  const total = currentRows.value.length
  if (total <= 0) return false
  return currentSelectedCount.value > 0 && currentSelectedCount.value < total
})

const imageSizeText = computed(() => formatSizeMb(localStats.value.local_image.size_mb))
const videoSizeText = computed(() => formatSizeMb(localStats.value.local_video.size_mb))

function rowsByType(type: AdminCacheType): AdminCacheListItem[] {
  return type === 'image' ? imageRows.value : videoRows.value
}

function setRowsByType(type: AdminCacheType, rows: AdminCacheListItem[]): void {
  if (type === 'image') {
    imageRows.value = rows
    return
  }
  videoRows.value = rows
}

function selectedByType(type: AdminCacheType): string[] {
  return type === 'image' ? selectedNames.value.image : selectedNames.value.video
}

function setSelectedByType(type: AdminCacheType, names: string[]): void {
  const dedupe = Array.from(new Set(names))
  if (type === 'image') {
    selectedNames.value = {
      image: dedupe,
      video: selectedNames.value.video,
    }
    return
  }
  selectedNames.value = {
    image: selectedNames.value.image,
    video: dedupe,
  }
}

function setListLoaded(type: AdminCacheType, loaded: boolean): void {
  if (type === 'image') {
    listLoaded.value = {
      image: loaded,
      video: listLoaded.value.video,
    }
    return
  }
  listLoaded.value = {
    image: listLoaded.value.image,
    video: loaded,
  }
}

function loadingByType(type: AdminCacheType): boolean {
  return type === 'image' ? listLoading.value.image : listLoading.value.video
}

function setListLoading(type: AdminCacheType, loading: boolean): void {
  if (type === 'image') {
    listLoading.value = {
      image: loading,
      video: listLoading.value.video,
    }
    return
  }
  listLoading.value = {
    image: listLoading.value.image,
    video: loading,
  }
}

function pruneSelection(type: AdminCacheType): void {
  const valid = new Set(rowsByType(type).map((item) => item.name))
  const next = selectedByType(type).filter((name) => valid.has(name))
  setSelectedByType(type, next)
}

function formatError(errorValue: unknown, fallback: string): string {
  if (errorValue instanceof AdminApiRequestError) {
    return errorValue.message
  }
  if (errorValue instanceof Error && errorValue.message.trim()) {
    return `${fallback}: ${errorValue.message}`
  }
  return fallback
}

async function handleApiFailure(
  errorValue: unknown,
  fallback: string,
  silent = false,
): Promise<void> {
  if (errorValue instanceof AdminApiRequestError && errorValue.status === 401) {
    await logout('/admin/cache')
    return
  }
  if (!silent) {
    error(formatError(errorValue, fallback))
  }
}

async function loadStats(silent = false): Promise<void> {
  try {
    localStats.value = await fetchAdminCacheLocalStats()
  } catch (errorValue) {
    await handleApiFailure(errorValue, '加载缓存统计失败', silent)
  }
}

async function loadList(type: AdminCacheType, options: ListLoadOptions = {}): Promise<void> {
  const force = options.force ?? false
  const silent = options.silent ?? false

  if (!force && listLoaded.value[type]) return

  setListLoading(type, true)
  try {
    const payload = await fetchAdminCacheList(type, 1, CACHE_LIST_PAGE_SIZE)
    setRowsByType(type, payload.items)
    setListLoaded(type, true)
    pruneSelection(type)
  } catch (errorValue) {
    await handleApiFailure(errorValue, '加载缓存列表失败', silent)
  } finally {
    setListLoading(type, false)
  }
}

async function switchType(type: AdminCacheType): Promise<void> {
  activeType.value = type
  await loadList(type, { silent: true })
}

function toggleSelectAllCurrent(checked: boolean): void {
  const type = activeType.value
  if (!checked) {
    setSelectedByType(type, [])
    return
  }
  const names = rowsByType(type).map((item) => item.name)
  setSelectedByType(type, names)
}

function toggleCurrentSelection(payload: { name: string; selected: boolean }): void {
  const type = activeType.value
  const current = selectedByType(type)
  if (payload.selected) {
    if (current.includes(payload.name)) return
    setSelectedByType(type, [...current, payload.name])
    return
  }
  setSelectedByType(
    type,
    current.filter((name) => name !== payload.name),
  )
}

function openFile(type: AdminCacheType, row: AdminCacheListItem): void {
  window.open(toFileUrl(type, row.name), '_blank')
}

async function requestClearType(type: AdminCacheType): Promise<void> {
  if (clearingType.value || isDeleting.value) return

  const label = cacheTypeLabel(type)
  const ok = await requestConfirm(`确定要清空本地${label}缓存吗？`, {
    confirmText: '清空',
    danger: true,
  })
  if (!ok) return

  clearingType.value = type
  try {
    const deleted = await clearAdminCache(type)
    setRowsByType(type, [])
    setSelectedByType(type, [])
    setListLoaded(type, false)

    await loadList(type, { force: true, silent: true })
    await loadStats(true)
    success(`清理成功，删除 ${String(deleted)} 项`)
  } catch (errorValue) {
    await handleApiFailure(errorValue, '清理缓存失败')
  } finally {
    clearingType.value = null
  }
}

interface DeleteBatchResult {
  deletedNames: string[]
  failed: number
  unauthorized: boolean
}

async function deleteNames(
  type: AdminCacheType,
  names: readonly string[],
): Promise<DeleteBatchResult> {
  const deletedNames: string[] = []
  let failed = 0
  let unauthorized = false

  for (let index = 0; index < names.length; index += CACHE_DELETE_BATCH_SIZE) {
    const chunk = names.slice(index, index + CACHE_DELETE_BATCH_SIZE)
    const chunkResults = await Promise.all(
      chunk.map(async (name) => {
        try {
          const deleted = await deleteAdminCacheItem(type, name)
          return {
            name,
            deleted,
            unauthorized: false,
          }
        } catch (errorValue) {
          const authError = errorValue instanceof AdminApiRequestError && errorValue.status === 401
          return {
            name,
            deleted: false,
            unauthorized: authError,
          }
        }
      }),
    )

    for (const result of chunkResults) {
      if (result.unauthorized) {
        unauthorized = true
        break
      }
      if (result.deleted) {
        deletedNames.push(result.name)
      } else {
        failed += 1
      }
    }

    if (unauthorized) break
  }

  return {
    deletedNames,
    failed,
    unauthorized,
  }
}

function applyDeleteResult(type: AdminCacheType, deletedNames: readonly string[]): void {
  if (deletedNames.length === 0) return
  const removed = new Set(deletedNames)
  const nextRows = rowsByType(type).filter((item) => !removed.has(item.name))
  setRowsByType(type, nextRows)

  const remainSelected = selectedByType(type).filter((name) => !removed.has(name))
  setSelectedByType(type, remainSelected)
  setListLoaded(type, true)
}

async function deleteSingle(type: AdminCacheType, row: AdminCacheListItem): Promise<void> {
  if (isDeleting.value || clearingType.value) return

  const ok = await requestConfirm('确定要删除该文件吗？', {
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return

  isDeleting.value = true
  try {
    const result = await deleteNames(type, [row.name])
    if (result.unauthorized) {
      await logout('/admin/cache')
      return
    }
    if (result.deletedNames.length <= 0) {
      error('删除失败')
      return
    }

    applyDeleteResult(type, result.deletedNames)
    await loadStats(true)
    success('删除成功')
  } finally {
    isDeleting.value = false
  }
}

async function deleteCurrentSelected(): Promise<void> {
  if (isDeleting.value || clearingType.value) return

  const type = activeType.value
  const selected = selectedByType(type)
  if (selected.length === 0) {
    info('未选择文件')
    return
  }

  const ok = await requestConfirm(`确定要删除选中的 ${String(selected.length)} 个文件吗？`, {
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return

  isDeleting.value = true
  try {
    const result = await deleteNames(type, selected)
    if (result.unauthorized) {
      await logout('/admin/cache')
      return
    }

    applyDeleteResult(type, result.deletedNames)
    await loadStats(true)

    if (result.failed === 0) {
      success(`已删除 ${String(result.deletedNames.length)} 个文件`)
    } else {
      info(`删除完成：成功 ${String(result.deletedNames.length)}，失败 ${String(result.failed)}`)
    }
  } finally {
    isDeleting.value = false
  }
}

async function reloadCurrent(): Promise<void> {
  if (isDeleting.value || clearingType.value) return
  await loadList(activeType.value, { force: true })
  await loadStats(true)
}

function startAutoRefresh(): void {
  stopAutoRefresh()
  autoRefreshTimer = window.setInterval(() => {
    void loadStats(true)
  }, CACHE_AUTO_REFRESH_MS)
}

function stopAutoRefresh(): void {
  if (autoRefreshTimer === null) return
  window.clearInterval(autoRefreshTimer)
  autoRefreshTimer = null
}

async function initPage(): Promise<void> {
  await loadStats()
  await switchType('image')
  startAutoRefresh()
}

onMounted(() => {
  void initPage()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <UiToastHost />

  <AdminPageShell max-width="960px">
    <div class="space-y-6">
      <CacheToolbar :active-type="activeType" :result-count="currentRows.length" />

      <div class="my-6 h-px bg-[var(--border)]"></div>

      <CacheStatsGrid
        :image-count="localStats.local_image.count"
        :image-size-text="imageSizeText"
        :video-count="localStats.local_video.count"
        :video-size-text="videoSizeText"
        :active-type="activeType"
        :clearing-type="clearingType"
        @select-type="switchType"
        @clear-type="requestClearType"
      />

      <CacheFileTable
        :type="activeType"
        :rows="currentRows"
        :loading="currentListLoading"
        :selected-names="currentSelectedNames"
        :all-selected="allSelected"
        :has-partial-selection="hasPartialSelection"
        empty-text="暂无文件"
        @toggle-select-all="toggleSelectAllCurrent"
        @toggle-select="toggleCurrentSelection"
        @view="openFile(activeType, $event)"
        @delete="deleteSingle(activeType, $event)"
      />
    </div>
  </AdminPageShell>

  <CacheBatchBar
    :selected-count="currentSelectedCount"
    :loading="currentListLoading"
    :deleting="isDeleting || clearingType !== null"
    :section-label="currentTypeLabel"
    @load="reloadCurrent"
    @delete="deleteCurrentSelected"
  />

  <UiConfirmDialog
    :open="confirmOpen"
    :title="confirmTitle"
    :message="confirmMessage"
    :confirm-text="confirmSubmitText"
    :cancel-text="confirmCancelText"
    :danger="confirmDanger"
    @confirm="acceptConfirm"
    @cancel="cancelConfirm"
  />
</template>
