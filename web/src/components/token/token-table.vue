<script setup lang="ts">
import { TestTubeDiagonal, RefreshCw, Copy, Pencil, Trash2 } from 'lucide-vue-next'
import UiDataTable from '@/components/ui/ui-data-table.vue'
import UiIconButton from '@/components/ui/ui-icon-button.vue'
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
          <UiIconButton label="复制 Token" variant="ghost" size="xs" @click="emit('copy-token', item.token)">
            <Copy :size="14" aria-hidden="true" />
          </UiIconButton>
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
          <UiIconButton label="测试" variant="ghost" tone="brand" size="xs" @click="emit('request-test', item)">
            <TestTubeDiagonal :size="14" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton label="刷新状态" variant="ghost" size="xs" @click="emit('request-refresh', item)">
            <RefreshCw :size="14" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton label="编辑" variant="ghost" size="xs" @click="emit('request-edit', item)">
            <Pencil :size="14" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton label="删除" variant="danger" size="xs" @click="emit('request-delete', item)">
            <Trash2 :size="14" aria-hidden="true" />
          </UiIconButton>
        </div>
      </td>
    </tr>
  </UiDataTable>
</template>
