<script setup lang="ts">
import { ChevronDown, ChevronUp, TestTubeDiagonal, RefreshCw, Copy, Pencil, Trash2, Gauge } from 'lucide-vue-next'
import { ref } from 'vue'
import UiCheckbox from '@/components/ui/ui-checkbox.vue'
import UiDataTable from '@/components/ui/ui-data-table.vue'
import UiIconButton from '@/components/ui/ui-icon-button.vue'
import type { TokenRow } from '@/components/token/token-types'
import {
  getTokenStatusClass,
  getTokenStatusLabel,
  shortenToken,
} from '@/components/token/token-utils'

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
  (e: 'request-refresh' | 'request-test' | 'request-rate-limit-test' | 'request-edit' | 'request-delete', row: TokenRow): void
  (e: 'copy-token', token: string): void
}>()

const expandedKeys = ref<Set<string>>(new Set())

function toggleExpanded(key: string): void {
  const next = new Set(expandedKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedKeys.value = next
}

function isExpanded(key: string): boolean {
  return expandedKeys.value.has(key)
}

function formatBucketValue(row: TokenRow, rateLimitModel: string): string {
  const bucket = row.quota_buckets.find((item) => item.rate_limit_model === rateLimitModel)
  if (!bucket) return '-'
  if (typeof bucket.remaining_queries === 'number') return String(bucket.remaining_queries)
  if (typeof bucket.remaining_tokens === 'number') return `${String(bucket.remaining_tokens)}t`
  return '-'
}

function formatTimestamp(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-'
  return new Date(value).toLocaleString()
}

function bucketList(row: TokenRow): TokenRow['quota_buckets'] {
  return [...row.quota_buckets].sort((a, b) => a.rate_limit_model.localeCompare(b.rate_limit_model))
}

function summaryRateModels(row: TokenRow): string[] {
  const names = row.quota_buckets.map((bucket) => bucket.rate_limit_model)
  return names.slice(0, 2)
}
</script>

<template>
  <UiDataTable
    :loading="loading"
    :empty="!loading && rows.length === 0"
    :empty-text="emptyText"
    min-width="980px"
  >
    <template #head>
      <tr>
        <th class="w-10">
          <UiCheckbox
            id="select-all"
            :model-value="allSelected"
            class="mx-auto"
            @change="emit('toggle-select-all', $event)"
          />
        </th>
        <th class="w-48 text-left">Token</th>
        <th class="w-24">类型</th>
        <th class="w-24">状态</th>
        <th class="w-64 text-left">额度摘要</th>
        <th class="text-left">备注</th>
        <th class="w-44 text-center">操作</th>
      </tr>
    </template>

    <template v-for="item in rows" :key="item.key">
      <tr :class="{ 'row-selected': isSelected(item.key) }">
        <td class="text-center">
          <UiCheckbox
            :model-value="isSelected(item.key)"
            class="mx-auto"
            @change="emit('toggle-select', { key: item.key, selected: $event })"
          />
        </td>
        <td class="text-left">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs text-gray-500" :title="item.token">{{
              shortenToken(item.token)
            }}</span>
            <UiIconButton
              label="复制 Token"
              variant="ghost"
              size="xs"
              @click="emit('copy-token', item.token)"
            >
              <Copy :size="14" aria-hidden="true" />
            </UiIconButton>
          </div>
        </td>
        <td class="text-center">
          <span class="badge badge-gray">{{ item.pool }}</span>
        </td>
        <td class="text-center">
          <span class="badge" :class="getTokenStatusClass(item)">{{
            getTokenStatusLabel(item)
          }}</span>
        </td>
        <td class="text-left">
          <div class="flex flex-wrap items-center gap-1">
            <template v-if="item.quota_buckets.length > 0">
              <span
                v-for="modelName in summaryRateModels(item)"
                :key="`${item.key}-${modelName}`"
                class="badge badge-gray font-mono"
              >
                {{ modelName }}: {{ formatBucketValue(item, modelName) }}
              </span>
              <span
                v-if="item.quota_buckets.length > 2"
                class="badge badge-gray font-mono"
              >
                +{{ String(item.quota_buckets.length - 2) }}
              </span>
            </template>
            <span v-else class="text-xs text-accent-4">暂无额度数据</span>
          </div>
        </td>
        <td class="max-w-[170px] truncate text-left text-xs text-gray-500">{{ item.note || '-' }}</td>
        <td class="text-center">
          <div class="flex items-center justify-center gap-2">
            <UiIconButton label="额度详情" variant="ghost" size="xs" @click="toggleExpanded(item.key)">
              <ChevronUp v-if="isExpanded(item.key)" :size="14" aria-hidden="true" />
              <ChevronDown v-else :size="14" aria-hidden="true" />
            </UiIconButton>
            <UiIconButton label="额度测试" variant="ghost" size="xs" @click="emit('request-rate-limit-test', item)">
              <Gauge :size="14" aria-hidden="true" />
            </UiIconButton>
            <UiIconButton label="测试" variant="ghost" size="xs" @click="emit('request-test', item)">
              <TestTubeDiagonal :size="14" aria-hidden="true" />
            </UiIconButton>
            <UiIconButton
              label="刷新状态"
              variant="ghost"
              size="xs"
              @click="emit('request-refresh', item)"
            >
              <RefreshCw :size="14" aria-hidden="true" />
            </UiIconButton>
            <UiIconButton label="编辑" variant="ghost" size="xs" @click="emit('request-edit', item)">
              <Pencil :size="14" aria-hidden="true" />
            </UiIconButton>
            <UiIconButton
              label="删除"
              variant="danger"
              size="xs"
              @click="emit('request-delete', item)"
            >
              <Trash2 :size="14" aria-hidden="true" />
            </UiIconButton>
          </div>
        </td>
      </tr>

      <tr v-if="isExpanded(item.key)" :class="{ 'row-selected': isSelected(item.key) }">
        <td></td>
        <td colspan="6" class="text-left">
          <div class="rounded-md border border-border bg-surface-muted p-3">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-xs font-semibold text-fg">额度详情</span>
              <span class="text-xs text-accent-5">
                known {{ String(item.quota_summary.known_count) }} / stale {{ String(item.quota_summary.stale_count) }}
              </span>
            </div>
            <div v-if="item.quota_buckets.length === 0" class="text-xs text-accent-4">暂无配额桶数据</div>
            <div v-else class="space-y-1">
              <div
                v-for="bucket in bucketList(item)"
                :key="`${item.key}-${bucket.rate_limit_model}-detail`"
                class="grid grid-cols-1 gap-1 rounded border border-border bg-surface px-2 py-2 text-xs md:grid-cols-6"
              >
                <div class="font-mono text-fg">{{ bucket.rate_limit_model }}</div>
                <div>queries: {{ bucket.remaining_queries ?? '-' }} / {{ bucket.total_queries ?? '-' }}</div>
                <div>tokens: {{ bucket.remaining_tokens ?? '-' }} / {{ bucket.total_tokens ?? '-' }}</div>
                <div>cost: {{ bucket.low_effort_cost ?? '-' }} / {{ bucket.high_effort_cost ?? '-' }}</div>
                <div>window: {{ bucket.window_size_seconds ?? '-' }}s</div>
                <div>
                  {{ formatTimestamp(bucket.refreshed_at) }}
                  <span v-if="bucket.stale" class="ml-1 text-orange-500">(stale)</span>
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </template>
  </UiDataTable>
</template>
