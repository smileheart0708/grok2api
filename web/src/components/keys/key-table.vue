<script setup lang="ts">
import { Copy, Pencil, Trash2 } from 'lucide-vue-next'
import UiIconButton from '@/components/ui/ui-icon-button.vue'
import UiDataTable from '@/components/ui/ui-data-table.vue'
import UiButton from '@/components/ui/ui-button.vue'
import {
  formatCreatedAt,
  formatLastUsedAt,
  formatLimitPair,
  formatUsagePair,
  isApiKeyExhausted,
} from '@/components/keys/key-utils'
import type { AdminApiKeyRow } from '@/types/admin-api'

interface Props {
  rows: readonly AdminApiKeyRow[]
  loading: boolean
  emptyText: string
}

defineProps<Props>()

const emit = defineEmits<(e: 'copy' | 'edit' | 'delete', row: AdminApiKeyRow) => void>()

function statusText(row: AdminApiKeyRow): string {
  if (isApiKeyExhausted(row)) return '额度用尽'
  if (row.is_active) return '启用'
  return '禁用'
}

function statusClass(row: AdminApiKeyRow): string {
  if (isApiKeyExhausted(row)) return 'pill-exhausted'
  if (row.is_active) return 'pill-active'
  return 'pill-muted'
}
</script>

<template>
  <UiDataTable
    :loading="loading"
    :empty="!loading && rows.length === 0"
    :empty-text="emptyText"
    min-width="1180px"
  >
    <template #head>
      <tr>
        <th class="w-56 text-left">名称</th>
        <th class="w-52 text-left">Key</th>
        <th class="w-28">状态</th>
        <th class="w-64 text-left">每日额度（chat / image / video）</th>
        <th class="w-64 text-left">今日已用（chat / image / video）</th>
        <th class="w-44">最后使用</th>
        <th class="w-40">创建时间</th>
        <th class="w-40 text-center">操作</th>
      </tr>
    </template>

    <tr v-for="row in rows" :key="row.key">
      <td class="text-left">
        <div class="font-medium">{{ row.name || '-' }}</div>
      </td>
      <td class="text-left">
        <div class="inline-flex items-center gap-1 whitespace-nowrap">
          <span class="mono whitespace-nowrap">{{ row.display_key }}</span>
          <UiIconButton label="复制 Key" variant="ghost" size="xs" class="shrink-0" @click="emit('copy', row)">
            <Copy :size="14" aria-hidden="true" />
          </UiIconButton>
        </div>
      </td>
      <td class="text-center">
        <span class="pill" :class="statusClass(row)">{{ statusText(row) }}</span>
      </td>
      <td class="text-left mono">{{ formatLimitPair(row) }}</td>
      <td class="text-left mono">{{ formatUsagePair(row) }}</td>
      <td class="text-center text-sm">{{ formatLastUsedAt(row.last_used_at) }}</td>
      <td class="text-center text-sm">{{ formatCreatedAt(row.created_at) }}</td>
      <td class="text-center">
        <div class="inline-flex items-center gap-2">
          <UiButton variant="outline" size="xs" class="py-1 gap-1" @click="emit('edit', row)">
            <Pencil :size="12" aria-hidden="true" />
            编辑
          </UiButton>
          <UiButton variant="danger" size="xs" class="py-1 gap-1" @click="emit('delete', row)">
            <Trash2 :size="12" aria-hidden="true" />
            删除
          </UiButton>
        </div>
      </td>
    </tr>
  </UiDataTable>
</template>
