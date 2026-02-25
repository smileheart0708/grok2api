<script setup lang="ts">
import { Eye, FileImage, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { formatFileSize, formatFileTime } from '@/components/cache/cache-utils'
import UiCheckbox from '@/components/ui/ui-checkbox.vue'
import UiDataTable from '@/components/ui/ui-data-table.vue'
import UiIconButton from '@/components/ui/ui-icon-button.vue'
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

const selectedSet = computed(() => new Set(selectedNames))

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
          <UiCheckbox
            :model-value="allSelected"
            :indeterminate="hasPartialSelection && !allSelected"
            class="mx-auto"
            @change="emit('toggle-select-all', $event)"
          />
        </th>
        <th class="w-[55%] text-left">文件</th>
        <th class="w-[15%] text-left">大小</th>
        <th class="w-[20%] text-left">时间</th>
        <th class="w-[10%] text-center">操作</th>
      </tr>
    </template>

    <tr v-for="row in rows" :key="row.name" :class="{ 'row-selected': isRowSelected(row.name) }">
      <td class="text-center">
        <UiCheckbox
          :model-value="isRowSelected(row.name)"
          class="mx-auto"
          @change="emit('toggle-select', { name: row.name, selected: $event })"
        />
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
          <UiIconButton label="查看文件" variant="ghost" size="xs" @click="emit('view', row)">
            <Eye :size="14" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton label="删除文件" variant="danger" size="xs" @click="emit('delete', row)">
            <Trash2 :size="14" aria-hidden="true" />
          </UiIconButton>
        </div>
      </td>
    </tr>
  </UiDataTable>
</template>
