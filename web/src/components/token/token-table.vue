<script setup lang="ts">
import UiDataTable from '@/components/ui/ui-data-table.vue'
import type { TokenRow } from '@/components/token/token-types'
import { getTokenStatusClass, getTokenStatusLabel, shortenToken } from '@/components/token/token-utils'

interface Props {
  rows: readonly TokenRow[]
  loading: boolean
  emptyText: string
  allSelected: boolean
  isSelected: (key: string) => boolean
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'toggle-select-all', value: boolean): void
  (e: 'toggle-select', payload: { key: string; selected: boolean }): void
  (e: 'request-refresh' | 'request-test' | 'request-edit' | 'request-delete', row: TokenRow): void
  (e: 'copy-token', token: string): void
}>()

function readChecked(event: Event): boolean {
  const target = event.target
  if (target instanceof HTMLInputElement) return target.checked
  return false
}
</script>

<template>
  <UiDataTable
    :loading="loading"
    :empty="!loading && rows.length === 0"
    :empty-text="emptyText"
    min-width="800px"
  >
    <template #head>
      <tr>
        <th class="w-10">
          <input
            id="select-all"
            :checked="allSelected"
            type="checkbox"
            class="checkbox"
            @change="emit('toggle-select-all', readChecked($event))"
          >
        </th>
        <th class="w-48 text-left">Token</th>
        <th class="w-24">类型</th>
        <th class="w-24">状态</th>
        <th class="w-20">额度</th>
        <th class="text-left">备注</th>
        <th class="w-40 text-center">操作</th>
      </tr>
    </template>

    <tr v-for="item in rows" :key="item.key" :class="{ 'row-selected': isSelected(item.key) }">
      <td class="text-center">
        <input
          type="checkbox"
          class="checkbox"
          :checked="isSelected(item.key)"
          @change="emit('toggle-select', { key: item.key, selected: readChecked($event) })"
        >
      </td>
      <td class="text-left">
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs text-gray-500" :title="item.token">{{ shortenToken(item.token) }}</span>
          <button
            type="button"
            class="text-gray-400 hover:text-black transition-colors"
            title="复制 Token"
            @click="emit('copy-token', item.token)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </td>
      <td class="text-center">
        <span class="badge badge-gray">{{ item.pool }}</span>
      </td>
      <td class="text-center">
        <span class="badge" :class="getTokenStatusClass(item)">{{ getTokenStatusLabel(item) }}</span>
      </td>
      <td class="text-center font-mono text-xs">{{ item.quota_known ? item.quota : '-' }}</td>
      <td class="text-left text-gray-500 text-xs truncate max-w-[150px]">{{ item.note || '-' }}</td>
      <td class="text-center">
        <div class="flex items-center justify-center gap-2">
          <button
            type="button"
            class="p-1 text-gray-400 hover:text-blue-600 rounded"
            title="测试"
            @click="emit('request-test', item)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 3h6"></path>
              <path d="M10 3v6.5L5.2 17a4 4 0 0 0 3.3 6h7a4 4 0 0 0 3.3-6L14 9.5V3"></path>
              <path d="M8.5 14h7"></path>
            </svg>
          </button>
          <button
            type="button"
            class="p-1 text-gray-400 hover:text-black rounded"
            title="刷新状态"
            @click="emit('request-refresh', item)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
          <button
            type="button"
            class="p-1 text-gray-400 hover:text-black rounded"
            title="编辑"
            @click="emit('request-edit', item)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button
            type="button"
            class="p-1 text-gray-400 hover:text-red-600 rounded"
            title="删除"
            @click="emit('request-delete', item)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  </UiDataTable>
</template>
