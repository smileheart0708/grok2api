<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminPageShell from '@/components/admin/admin-page-shell.vue'
import TokenAddEditModal from '@/components/token/token-add-edit-modal.vue'
import TokenImportModal from '@/components/token/token-import-modal.vue'
import TokenRateLimitTestModal from '@/components/token/token-rate-limit-test-modal.vue'
import TokenStatsGrid from '@/components/token/token-stats-grid.vue'
import TokenTable from '@/components/token/token-table.vue'
import TokenTestModal from '@/components/token/token-test-modal.vue'
import TokenToolbar from '@/components/token/token-toolbar.vue'
import {
  DEFAULT_TOKEN_FILTERS,
  type TokenEditorMode,
  type TokenEditorSubmitPayload,
  type TokenImportSubmitPayload,
  type TokenRow,
  type TokenStats,
} from '@/components/token/token-types'
import {
  createTokenKey,
  isTokenActive,
  isTokenExhausted,
  isTokenInvalid,
  normalizeSsoToken,
  normalizeTokenStatus,
  poolToTokenType,
  toDisplayToken,
} from '@/components/token/token-utils'
import UiConfirmDialog from '@/components/ui/ui-confirm-dialog.vue'
import UiToastHost from '@/components/ui/ui-toast-host.vue'
import { useBatchSelection } from '@/composables/use-batch-selection'
import { useConfirm } from '@/composables/use-confirm'
import { useToast } from '@/composables/use-toast'
import {
  AdminApiRequestError,
  fetchAdminChatModels,
  fetchAdminTokens,
  refreshAdminTokens,
  saveAdminTokens,
  testAdminToken,
  testAdminTokenRateLimit,
} from '@/lib/admin-api'
import { logout } from '@/lib/admin-auth'
import type {
  AdminChatModel,
  AdminTokenPool,
  AdminTokenPoolMap,
  TokenBatchActionState,
  TokenFilterState,
} from '@/types/admin-api'
import '@/styles/pages/token-page.css'

const TEST_MODEL_STORAGE_KEY = 'grok2api-token-test-model'
const BATCH_SIZE = 50
const BATCH_DELAY_MS = 320

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

const isLoading = ref(true)
const rows = ref<TokenRow[]>([])

const filters = ref<TokenFilterState>({ ...DEFAULT_TOKEN_FILTERS })

const isEditorOpen = ref(false)
const editorMode = ref<TokenEditorMode>('create')
const editingRowKey = ref('')
const isEditorSaving = ref(false)

const isImportOpen = ref(false)
const isImportSaving = ref(false)

const isTestOpen = ref(false)
const isTestRunning = ref(false)
const testingRowKey = ref('')
const testMetaText = ref('')
const testResultText = ref('')
const chatModels = ref<AdminChatModel[]>([])
const selectedTestModel = ref('')

const isRateLimitTestOpen = ref(false)
const rateLimitTestRowKey = ref('')
const rateLimitTestResult = ref<Record<string, unknown> | null>(null)
const selectedRateLimitModel = ref<string>('')

function setRateLimitTestModel(modelId: string): void {
  selectedRateLimitModel.value = modelId
}

const batchState = ref<TokenBatchActionState>({
  running: false,
  paused: false,
  action: null,
  total: 0,
  processed: 0,
})
const shouldStopBatch = ref(false)

const selection = useBatchSelection(rows, (row) => row.key)
const selectedCount = computed(() => selection.selectedCount.value)

const editingRow = computed(() => rows.value.find((row) => row.key === editingRowKey.value) ?? null)
const testingRow = computed(() => rows.value.find((row) => row.key === testingRowKey.value) ?? null)

const filteredRows = computed(() => {
  const hasTypeFilter = filters.value.typeSso || filters.value.typeSuperSso
  const hasStatusFilter =
    filters.value.statusActive || filters.value.statusInvalid || filters.value.statusExhausted

  return rows.value.filter((row) => {
    const tokenType = row.token_type === 'ssoSuper' ? 'ssoSuper' : 'sso'
    const matchesType =
      !hasTypeFilter ||
      (filters.value.typeSso && tokenType === 'sso') ||
      (filters.value.typeSuperSso && tokenType === 'ssoSuper')
    if (!matchesType) return false

    if (!hasStatusFilter) return true

    const active = isTokenActive(row)
    const invalid = isTokenInvalid(row)
    const exhausted = isTokenExhausted(row)
    return (
      (filters.value.statusActive && active) ||
      (filters.value.statusInvalid && invalid) ||
      (filters.value.statusExhausted && exhausted)
    )
  })
})

const tokenStats = computed<TokenStats>(() => {
  let active = 0
  let exhausted = 0
  let invalid = 0
  let chatQuota = 0
  let totalCalls = 0

  for (const row of rows.value) {
    if (isTokenInvalid(row)) {
      invalid += 1
    } else if (isTokenExhausted(row)) {
      exhausted += 1
    } else {
      active += 1
      if (row.quota_known && row.quota > 0) {
        chatQuota += row.quota
      }
    }
    totalCalls += row.use_count
  }

  return {
    total: rows.value.length,
    active,
    exhausted,
    invalid,
    chatQuota,
    totalCalls,
  }
})

const allVisibleSelected = computed(() => {
  if (filteredRows.value.length === 0) return false
  return filteredRows.value.every((row) => selection.isSelected(row.key))
})

const tableEmptyText = computed(() => {
  if (rows.value.length === 0) return '暂无 Token，请点击右上角导入或添加。'
  return '当前筛选无结果。'
})

const batchProgressText = computed(() => {
  const total = batchState.value.total
  if (total <= 0) return '0%'
  const percent = Math.floor((batchState.value.processed / total) * 100)
  return `${String(percent)}% (${String(batchState.value.processed)}/${String(total)})`
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
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

async function handleApiFailure(errorValue: unknown, fallback: string): Promise<void> {
  if (errorValue instanceof AdminApiRequestError && errorValue.status === 401) {
    await logout('/admin/token')
    return
  }
  error(formatError(errorValue, fallback))
}

function normalizePoolMap(poolMap: AdminTokenPoolMap): TokenRow[] {
  const out: TokenRow[] = []
  const dedupe = new Set<string>()

  const appendPool = (pool: AdminTokenPool): void => {
    const list = poolMap[pool]
    for (const item of list) {
      const token = toDisplayToken(item.token)
      const key = createTokenKey(token)
      if (!token || !key) continue

      const dedupeKey = `${pool}:${key}`
      if (dedupe.has(dedupeKey)) continue
      dedupe.add(dedupeKey)

      out.push({
        ...item,
        token,
        status: normalizeTokenStatus(item.status),
        token_type: item.token_type === 'ssoSuper' ? 'ssoSuper' : poolToTokenType(pool),
        note: item.note,
        fail_count: Number.isFinite(item.fail_count) ? item.fail_count : 0,
        use_count: Number.isFinite(item.use_count) ? item.use_count : 0,
        pool,
        key,
      })
    }
  }

  appendPool('ssoBasic')
  appendPool('ssoSuper')
  return out
}

function buildPoolMap(tokenRows: readonly TokenRow[]): AdminTokenPoolMap {
  const out: AdminTokenPoolMap = { ssoBasic: [], ssoSuper: [] }
  for (const row of tokenRows) {
    out[row.pool].push({
      token: row.token,
      status: row.status,
      quota: row.quota,
      quota_known: row.quota_known,
      heavy_quota: row.heavy_quota,
      heavy_quota_known: row.heavy_quota_known,
      token_type: row.token_type,
      note: row.note,
      fail_count: row.fail_count,
      use_count: row.use_count,
    })
  }
  return out
}

async function loadTokenData(): Promise<void> {
  isLoading.value = true
  try {
    const poolMap = await fetchAdminTokens()
    rows.value = normalizePoolMap(poolMap)
  } catch (errorValue) {
    await handleApiFailure(errorValue, '加载 Token 失败')
  } finally {
    isLoading.value = false
  }
}

async function loadChatModels(): Promise<void> {
  try {
    chatModels.value = await fetchAdminChatModels()
    if (chatModels.value.length === 0) {
      selectedTestModel.value = ''
      return
    }

    const current = selectedTestModel.value
    if (current && chatModels.value.some((item) => item.id === current)) return

    const storedValue = (() => {
      try {
        return window.localStorage.getItem(TEST_MODEL_STORAGE_KEY) ?? ''
      } catch {
        return ''
      }
    })()

    const defaultModel = chatModels.value.some((item) => item.id === storedValue)
      ? storedValue
      : (chatModels.value[0]?.id ?? '')
    selectedTestModel.value = defaultModel
  } catch (errorValue) {
    await handleApiFailure(errorValue, '加载测试模型失败')
  }
}

async function persistRows(nextRows: TokenRow[], successText: string): Promise<boolean> {
  try {
    await saveAdminTokens(buildPoolMap(nextRows))
    rows.value = nextRows
    success(successText)
    await loadTokenData()
    return true
  } catch (errorValue) {
    await handleApiFailure(errorValue, '保存 Token 失败')
    return false
  }
}

function resetFilters(): void {
  filters.value = { ...DEFAULT_TOKEN_FILTERS }
}

function onFilterUpdate(nextFilters: TokenFilterState): void {
  filters.value = nextFilters
}

function openAddModal(): void {
  editorMode.value = 'create'
  editingRowKey.value = ''
  isEditorOpen.value = true
}

function openEditModal(row: TokenRow): void {
  editorMode.value = 'edit'
  editingRowKey.value = row.key
  isEditorOpen.value = true
}

function closeEditorModal(): void {
  if (isEditorSaving.value) return
  isEditorOpen.value = false
}

async function onEditorSubmit(payload: TokenEditorSubmitPayload): Promise<void> {
  const displayToken = toDisplayToken(payload.token)
  const key = createTokenKey(displayToken)
  if (!displayToken || !key) {
    error('Token 不能为空')
    return
  }

  const nextRows = [...rows.value]
  if (editorMode.value === 'create') {
    if (nextRows.some((row) => row.key === key)) {
      error('Token 已存在')
      return
    }
    nextRows.push({
      token: displayToken,
      status: 'active',
      quota: payload.quota,
      quota_known: true,
      heavy_quota: -1,
      heavy_quota_known: false,
      token_type: poolToTokenType(payload.pool),
      note: payload.note,
      fail_count: 0,
      use_count: 0,
      pool: payload.pool,
      key,
    })
  } else {
    const index = nextRows.findIndex((row) => row.key === editingRowKey.value)
    if (index < 0) {
      error('编辑目标不存在，请刷新后重试')
      return
    }
    const current = nextRows[index]
    if (!current) {
      error('编辑目标不存在，请刷新后重试')
      return
    }
    nextRows[index] = {
      ...current,
      pool: payload.pool,
      token_type: poolToTokenType(payload.pool),
      quota: payload.quota,
      quota_known: true,
      note: payload.note,
    }
  }

  isEditorSaving.value = true
  const saved = await persistRows(
    nextRows,
    editorMode.value === 'create' ? 'Token 添加成功' : 'Token 保存成功',
  )
  isEditorSaving.value = false
  if (saved) isEditorOpen.value = false
}

function openImportModal(): void {
  isImportOpen.value = true
}

function closeImportModal(): void {
  if (isImportSaving.value) return
  isImportOpen.value = false
}

async function onImportSubmit(payload: TokenImportSubmitPayload): Promise<void> {
  const existing = new Set(rows.value.map((row) => row.key))
  const nextRows = [...rows.value]
  let added = 0

  for (const rawToken of payload.tokens) {
    const displayToken = toDisplayToken(rawToken)
    const key = createTokenKey(displayToken)
    if (!displayToken || !key || existing.has(key)) continue
    existing.add(key)
    nextRows.push({
      token: displayToken,
      status: 'active',
      quota: 80,
      quota_known: true,
      heavy_quota: -1,
      heavy_quota_known: false,
      token_type: poolToTokenType(payload.pool),
      note: '',
      fail_count: 0,
      use_count: 0,
      pool: payload.pool,
      key,
    })
    added += 1
  }

  if (added === 0) {
    info('没有可导入的新 Token')
    return
  }

  isImportSaving.value = true
  const saved = await persistRows(nextRows, `已导入 ${String(added)} 个 Token`)
  isImportSaving.value = false
  if (saved) isImportOpen.value = false
}

async function deleteSingleToken(row: TokenRow): Promise<void> {
  const ok = await requestConfirm('确定要删除此 Token 吗？', {
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return

  const nextRows = rows.value.filter((item) => item.key !== row.key)
  await persistRows(nextRows, 'Token 删除成功')
}

async function refreshSingleToken(row: TokenRow): Promise<void> {
  try {
    const normalizedToken = normalizeSsoToken(row.token)
    const results = await refreshAdminTokens([normalizedToken])
    const successValue = results[`sso=${normalizedToken}`] ?? results[normalizedToken] ?? false
    if (successValue) {
      success('刷新成功')
    } else {
      error('刷新失败')
    }
    await loadTokenData()
  } catch (errorValue) {
    await handleApiFailure(errorValue, '刷新失败')
  }
}

async function copyTokenToClipboard(token: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(token)
    success('Token 已复制')
  } catch {
    error('复制失败，请检查浏览器权限')
  }
}

function setTestModel(modelId: string): void {
  selectedTestModel.value = modelId
  try {
    window.localStorage.setItem(TEST_MODEL_STORAGE_KEY, modelId)
  } catch {
    // ignore
  }
}

async function openTestModal(row: TokenRow): Promise<void> {
  testingRowKey.value = row.key
  testMetaText.value = ''
  testResultText.value = ''
  isTestOpen.value = true
  if (chatModels.value.length === 0) {
    await loadChatModels()
  }
}

function closeTestModal(): void {
  if (isTestRunning.value) return
  isTestOpen.value = false
}

function formatResult(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function resolveTokenType(row: TokenRow): 'sso' | 'ssoSuper' {
  return row.token_type === 'ssoSuper' ? 'ssoSuper' : 'sso'
}

async function runTokenTest(): Promise<void> {
  const row = testingRow.value
  if (!row) {
    error('测试目标不存在')
    return
  }
  if (!selectedTestModel.value) {
    error('请选择测试模型')
    return
  }

  isTestRunning.value = true
  try {
    const result = await testAdminToken({
      token: normalizeSsoToken(row.token),
      tokenType: resolveTokenType(row),
      model: selectedTestModel.value,
    })

    testMetaText.value = `HTTP ${String(result.upstreamStatus)} · 额度刷新 ${result.quotaRefreshSuccess ? '成功' : '失败'}${result.reactivated ? ' · 已恢复' : ''}`
    testResultText.value = formatResult(result.result)

    if (result.success) {
      success('测试成功')
      await loadTokenData()
    } else {
      error('测试失败')
    }
  } catch (errorValue) {
    await handleApiFailure(errorValue, '测试失败')
  } finally {
    isTestRunning.value = false
  }
}

async function openRateLimitTestModal(row: TokenRow): Promise<void> {
  rateLimitTestRowKey.value = row.key
  rateLimitTestResult.value = null
  selectedRateLimitModel.value = chatModels.value[0]?.id ?? ''
  isRateLimitTestOpen.value = true
  if (chatModels.value.length === 0) {
    await loadChatModels()
  }
}

function closeRateLimitTestModal(): void {
  isRateLimitTestOpen.value = false
  rateLimitTestResult.value = null
}

async function runRateLimitTest(model: string): Promise<void> {
  const row = rows.value.find((r) => r.key === rateLimitTestRowKey.value)
  if (!row) {
    error('测试目标不存在')
    closeRateLimitTestModal()
    return
  }

  try {
    const result = await testAdminTokenRateLimit({
      token: normalizeSsoToken(row.token),
      tokenType: resolveTokenType(row),
      model,
    })

    rateLimitTestResult.value = {
      model: result.model,
      remaining_queries: result.remaining_queries,
      raw_response: result.raw_response,
    }

    if (typeof result.remaining_queries === 'number') {
      success(`查询成功：剩余额度 ${String(result.remaining_queries)}`)
      await loadTokenData()
    } else {
      error('查询成功，但未返回有效额度')
    }
  } catch (errorValue) {
    await handleApiFailure(errorValue, '查询失败')
  }
}

function toggleSelectAllVisible(checked: boolean): void {
  const visibleKeys = filteredRows.value.map((row) => row.key)
  selection.setMany(visibleKeys, checked)
}

function toggleSelect(payload: { key: string; selected: boolean }): void {
  selection.setKeySelected(payload.key, payload.selected)
}

function exportSelectedTokens(): void {
  const selected = selection.selectedItems.value
  if (selected.length === 0) {
    error('未选择 Token')
    return
  }
  const content = selected.map((row) => row.token).join('\n')
  const blob = new Blob([`${content}\n`], { type: 'text/plain' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tokens_export_${new Date().toISOString().slice(0, 10)}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

async function runBatch(
  action: 'refresh' | 'delete',
  queue: string[],
  executor: (chunk: string[]) => Promise<void>,
): Promise<void> {
  batchState.value = {
    running: true,
    paused: false,
    action,
    total: queue.length,
    processed: 0,
  }

  try {
    while (queue.length > 0) {
      if (shouldStopBatch.value) break
      if (batchState.value.paused) {
        await sleep(120)
        continue
      }

      const chunk = queue.splice(0, BATCH_SIZE)
      await executor(chunk)
      batchState.value = {
        ...batchState.value,
        processed: Math.min(batchState.value.total, batchState.value.processed + chunk.length),
      }
      await sleep(BATCH_DELAY_MS)
    }

    if (shouldStopBatch.value) {
      info(action === 'delete' ? '已终止删除任务' : '已终止刷新任务')
    } else {
      success(action === 'delete' ? '批量删除完成' : '批量刷新完成')
    }
  } catch (errorValue) {
    await handleApiFailure(errorValue, action === 'delete' ? '批量删除失败' : '批量刷新失败')
  } finally {
    batchState.value = {
      running: false,
      paused: false,
      action: null,
      total: 0,
      processed: 0,
    }
    shouldStopBatch.value = false
    await loadTokenData()
  }
}

async function startBatchRefresh(): Promise<void> {
  if (batchState.value.running) {
    info('当前有任务进行中')
    return
  }

  const selected = selection.selectedItems.value
  if (selected.length === 0) {
    error('未选择 Token')
    return
  }

  const queue = selected.map((row) => normalizeSsoToken(row.token))
  shouldStopBatch.value = false
  await runBatch('refresh', queue, async (chunk) => {
    await refreshAdminTokens(chunk)
  })
}

async function startBatchDelete(): Promise<void> {
  if (batchState.value.running) {
    info('当前有任务进行中')
    return
  }

  const selected = selection.selectedItems.value
  if (selected.length === 0) {
    error('未选择 Token')
    return
  }

  const ok = await requestConfirm(`确定要删除选中的 ${String(selected.length)} 个 Token 吗？`, {
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return

  let workingRows = [...rows.value]
  const queue = selected.map((row) => row.key)

  shouldStopBatch.value = false
  await runBatch('delete', queue, async (chunk) => {
    const removeSet = new Set(chunk)
    workingRows = workingRows.filter((row) => !removeSet.has(row.key))
    await saveAdminTokens(buildPoolMap(workingRows))
    rows.value = workingRows
    selection.setMany(chunk, false)
  })
}

function toggleBatchPause(): void {
  if (!batchState.value.running) return
  batchState.value = {
    ...batchState.value,
    paused: !batchState.value.paused,
  }
}

function stopBatchAction(): void {
  if (!batchState.value.running) return
  shouldStopBatch.value = true
}

onMounted(() => {
  void loadTokenData()
  void loadChatModels()
})
</script>

<template>
  <UiToastHost />

  <AdminPageShell max-width="1280px">
    <TokenToolbar
      :filters="filters"
      :result-count="filteredRows.length"
      :selected-count="selectedCount"
      :batch-running="batchState.running"
      :batch-paused="batchState.paused"
      :batch-progress-text="batchProgressText"
      @open-import="openImportModal"
      @open-add="openAddModal"
      @update:filters="onFilterUpdate"
      @reset-filters="resetFilters"
      @export="exportSelectedTokens"
      @refresh="startBatchRefresh"
      @delete="startBatchDelete"
      @pause="toggleBatchPause"
      @stop="stopBatchAction"
    >
      <template #stats>
        <TokenStatsGrid :stats="tokenStats" />
      </template>
    </TokenToolbar>

    <TokenTable
      :rows="filteredRows"
      :loading="isLoading"
      :empty-text="tableEmptyText"
      :all-selected="allVisibleSelected"
      :is-selected="selection.isSelected"
      @toggle-select-all="toggleSelectAllVisible"
      @toggle-select="toggleSelect"
      @request-refresh="refreshSingleToken"
      @request-test="openTestModal"
      @request-rate-limit-test="openRateLimitTestModal"
      @request-edit="openEditModal"
      @request-delete="deleteSingleToken"
      @copy-token="copyTokenToClipboard"
    />
  </AdminPageShell>

  <TokenAddEditModal
    :open="isEditorOpen"
    :mode="editorMode"
    :initial-token="editingRow?.token ?? ''"
    :initial-pool="editingRow?.pool ?? 'ssoBasic'"
    :initial-quota="editingRow?.quota ?? 80"
    :initial-note="editingRow?.note ?? ''"
    :saving="isEditorSaving"
    @close="closeEditorModal"
    @submit="onEditorSubmit"
  />

  <TokenImportModal
    :open="isImportOpen"
    :saving="isImportSaving"
    @close="closeImportModal"
    @submit="onImportSubmit"
  />

  <TokenTestModal
    :open="isTestOpen"
    :token-display="testingRow?.token ?? ''"
    :models="chatModels"
    :selected-model="selectedTestModel"
    :running="isTestRunning"
    :meta-text="testMetaText"
    :result-text="testResultText"
    @close="closeTestModal"
    @run="runTokenTest"
    @update:selected-model="setTestModel"
  />

  <TokenRateLimitTestModal
    :open="isRateLimitTestOpen"
    :models="chatModels"
    :selected-model="selectedRateLimitModel"
    :running="false"
    :result-text="rateLimitTestResult ? JSON.stringify(rateLimitTestResult, null, 2) : null"
    @close="closeRateLimitTestModal"
    @submit="runRateLimitTest"
    @update:selected-model="setRateLimitTestModel"
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
