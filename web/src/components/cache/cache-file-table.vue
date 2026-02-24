<script setup lang="ts">
import { Eye, FileImage, Trash2 } from 'lucide-vue-next'
import { computed, useTemplateRef, watchEffect } from 'vue'
import { formatFileSize, formatFileTime } from '@/components/cache/cache-utils'
import UiDataTable from '@/components/ui/ui-data-table.vue'
import type { AdminCacheListItem, AdminCacheType } from '@/types/admin-api'

interface Props {
  type: AdminCacheType
  rows: readonly AdminCacheListItem[]
  loading: boolean
  selectedNames: readonly string[]
  allSelected: boolean
  hasPartialSelection: boolean
  emptyText: string
}

const {
  type,
  rows,
  loading,
  selectedNames,
  allSelected,
  hasPartialSelection,
  emptyText,
} = defineProps<Props>()

const emit = defineEmits<{
  (e: 'toggle-select-all', value: boolean): void
  (e: 'toggle-select', payload: { name: string; selected: boolean }): void
  (e: 'view' | 'delete', row: AdminCacheListItem): void
}>()

const selectAllRef = useTemplateRef<HTMLInputElement>('select-all')

const selectedSet = computed(() => new Set(selectedNames))

watchEffect(() => {
  const element = selectAllRef.value
  if (!element) return
  element.indeterminate = hasPartialSelection && !allSelected
})

function readChecked(event: Event): boolean {
  const target = event.target
  if (target instanceof HTMLInputElement) return target.checked
  return false
}

function isRowSelected(name: string): boolean {
  return selectedSet.value.has(name)
}
</script>

<template>
  <UiDataTable
    :loading="loading"
    :empty="!loading && rows.length === 0"
    :empty-text="emptyText"
    min-width="640px"
  >
    <template #head>
      <tr>
        <th class="w-10 text-center">
          <input
            ref="select-all"
            :checked="allSelected"
            type="checkbox"
            class="checkbox"
            @change="emit('toggle-select-all', readChecked($event))"
          >
        </th>
        <th class="w-[55%] text-left">文件</th>
        <th class="w-[15%] text-left">大小</th>
        <th class="w-[20%] text-left">时间</th>
        <th class="w-[10%] text-center">操作</th>
      </tr>
    </template>

    <tr v-for="row in rows" :key="row.name" :class="{ 'row-selected': isRowSelected(row.name) }">
      <td class="text-center">
        <input
          type="checkbox"
          class="checkbox"
          :checked="isRowSelected(row.name)"
          @change="emit('toggle-select', { name: row.name, selected: readChecked($event) })"
        >
      </td>
      <td class="text-left">
        <div class="flex items-center gap-2">
          <img
            v-if="type === 'image' && row.preview_url"
            :src="row.preview_url"
            alt=""
            class="cache-preview"
            loading="lazy"
            decoding="async"
          >
          <span v-else class="cache-file-icon" aria-hidden="true">
            <FileImage :size="14" />
          </span>
          <span class="font-mono text-xs text-gray-500 break-all">{{ row.name }}</span>
        </div>
      </td>
      <td class="text-left">{{ formatFileSize(row.size_bytes) }}</td>
      <td class="text-left text-xs text-gray-500">{{ formatFileTime(row.mtime_ms) }}</td>
      <td class="text-center">
        <div class="cache-list-actions">
          <button type="button" class="cache-icon-button" title="查看文件" @click="emit('view', row)">
            <Eye :size="14" aria-hidden="true" />
          </button>
          <button type="button" class="cache-icon-button danger" title="删除文件" @click="emit('delete', row)">
            <Trash2 :size="14" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  </UiDataTable>
</template>
