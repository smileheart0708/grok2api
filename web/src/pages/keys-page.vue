<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminPageShell from '@/components/admin/admin-page-shell.vue'
import KeyEditModal from '@/components/keys/key-edit-modal.vue'
import KeyStatsGrid from '@/components/keys/key-stats-grid.vue'
import KeyTable from '@/components/keys/key-table.vue'
import KeyToolbar from '@/components/keys/key-toolbar.vue'
import {
  DEFAULT_KEY_FILTERS,
  buildKeyStats,
  filterApiKeys,
  toLimitDraft,
  type KeyEditorSubmitPayload,
  type KeyFilterState,
} from '@/components/keys/key-utils'
import UiConfirmDialog from '@/components/ui/ui-confirm-dialog.vue'
import UiToastHost from '@/components/ui/ui-toast-host.vue'
import { useConfirm } from '@/composables/use-confirm'
import { useToast } from '@/composables/use-toast'
import {
  AdminApiRequestError,
  createAdminApiKey,
  deleteAdminApiKey,
  fetchAdminApiKeys,
  updateAdminApiKey,
} from '@/lib/admin-api'
import { logout } from '@/lib/admin-auth'
import type { AdminApiKeyRow } from '@/types/admin-api'
import '@/styles/pages/keys-page.css'

const { success, error } = useToast()
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
const rows = ref<AdminApiKeyRow[]>([])

const filters = ref<KeyFilterState>({ ...DEFAULT_KEY_FILTERS })

const isEditorOpen = ref(false)
const editorMode = ref<'create' | 'edit'>('create')
const editingKey = ref('')
const isEditorSaving = ref(false)

const editingRow = computed(() => rows.value.find((row) => row.key === editingKey.value) ?? null)
const filteredRows = computed(() => filterApiKeys(rows.value, filters.value))
const stats = computed(() => buildKeyStats(rows.value))

const tableEmptyText = computed(() => {
  if (rows.value.length === 0) return '暂无 API Key，请点击右上角新增。'
  return '没有符合筛选条件的 API Key。'
})

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
    await logout('/admin/keys')
    return
  }
  error(formatError(errorValue, fallback))
}

async function loadApiKeys(): Promise<void> {
  isLoading.value = true
  try {
    rows.value = await fetchAdminApiKeys()
  } catch (errorValue) {
    await handleApiFailure(errorValue, '加载 API Key 失败')
  } finally {
    isLoading.value = false
  }
}

function updateFilters(nextFilters: KeyFilterState): void {
  filters.value = nextFilters
}

function resetFilters(): void {
  filters.value = { ...DEFAULT_KEY_FILTERS }
}

function openCreateModal(): void {
  editorMode.value = 'create'
  editingKey.value = ''
  isEditorOpen.value = true
}

function openEditModal(row: AdminApiKeyRow): void {
  editorMode.value = 'edit'
  editingKey.value = row.key
  isEditorOpen.value = true
}

function closeEditorModal(): void {
  if (isEditorSaving.value) return
  isEditorOpen.value = false
}

async function copyToClipboard(text: string, silent = false): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    if (!silent) success('已复制')
    return true
  } catch {
    if (!silent) error('复制失败，请检查浏览器权限')
    return false
  }
}

async function onEditorSubmit(payload: KeyEditorSubmitPayload): Promise<void> {
  isEditorSaving.value = true
  try {
    if (editorMode.value === 'create') {
      const created = await createAdminApiKey({
        name: payload.name,
        key: payload.key,
        is_active: payload.is_active,
        limits: payload.limits,
      })
      await loadApiKeys()
      isEditorOpen.value = false

      const createdKey = created?.key ?? payload.key
      if (createdKey) {
        const copied = await copyToClipboard(createdKey, true)
        success(copied ? '创建成功，已复制 Key' : '创建成功')
      } else {
        success('创建成功')
      }
      return
    }

    const current = editingRow.value
    if (!current) {
      error('编辑目标不存在，请刷新后重试')
      return
    }

    await updateAdminApiKey({
      key: current.key,
      name: payload.name,
      is_active: payload.is_active,
      limits: payload.limits,
    })
    await loadApiKeys()
    isEditorOpen.value = false
    success('更新成功')
  } catch (errorValue) {
    await handleApiFailure(errorValue, '保存 API Key 失败')
  } finally {
    isEditorSaving.value = false
  }
}

async function deleteKey(row: AdminApiKeyRow): Promise<void> {
  const ok = await requestConfirm('确定删除该 API Key 吗？此操作不可恢复。', {
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return

  try {
    await deleteAdminApiKey(row.key)
    await loadApiKeys()
    success('删除成功')
  } catch (errorValue) {
    await handleApiFailure(errorValue, '删除 API Key 失败')
  }
}

async function copyApiKey(row: AdminApiKeyRow): Promise<void> {
  await copyToClipboard(row.key)
}

onMounted(() => {
  void loadApiKeys()
})
</script>

<template>
  <UiToastHost />

  <AdminPageShell max-width="1120px">
    <KeyToolbar
      :filters="filters"
      :result-count="filteredRows.length"
      @open-create="openCreateModal"
      @update:filters="updateFilters"
      @reset-filters="resetFilters"
    />

    <div class="h-px bg-[var(--border)] my-6"></div>

    <KeyStatsGrid :stats="stats" />

    <KeyTable
      :rows="filteredRows"
      :loading="isLoading"
      :empty-text="tableEmptyText"
      @copy="copyApiKey"
      @edit="openEditModal"
      @delete="deleteKey"
    />
  </AdminPageShell>

  <KeyEditModal
    :open="isEditorOpen"
    :mode="editorMode"
    :initial-name="editingRow?.name ?? ''"
    :initial-key="editingRow?.key ?? ''"
    :initial-is-active="editingRow?.is_active ?? true"
    :initial-limits="toLimitDraft(editingRow)"
    :saving="isEditorSaving"
    @close="closeEditorModal"
    @submit="onEditorSubmit"
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
