<script setup lang="ts">
import { Download, Plus } from 'lucide-vue-next'
import type { TokenFilterState } from '@/types/admin-api'
import UiButton from '@/components/ui/ui-button.vue'

interface Props {
  filters: TokenFilterState
  resultCount: number
  selectedCount: number
  batchRunning: boolean
  batchPaused: boolean
  batchProgressText: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'open-import' | 'open-add' | 'reset-filters' | 'export' | 'refresh' | 'delete' | 'pause' | 'stop'): void
  (e: 'update:filters', value: TokenFilterState): void
}>()

function readChecked(event: Event): boolean {
  const target = event.target
  if (target instanceof HTMLInputElement) return target.checked
  return false
}

function updateFilter(key: keyof TokenFilterState, event: Event): void {
  emit('update:filters', {
    ...props.filters,
    [key]: readChecked(event),
  })
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">Token 列表</h2>
        <p class="mt-1 text-sm text-accent-4">管理 Grok2API 的 Token 服务号池。</p>
      </div>
      <div class="flex w-full items-center gap-3 sm:w-auto">
        <UiButton
          variant="solid"
          tone="neutral"
          size="sm"
          class="gap-2"
          @click="$emit('open-import')"
        >
          <Download :size="14" aria-hidden="true" />
          导入
        </UiButton>
        <UiButton variant="solid" size="sm" class="gap-2" @click="$emit('open-add')">
          <Plus :size="14" aria-hidden="true" />
          添加
        </UiButton>
      </div>
    </div>

    <slot name="stats" />

    <div
      id="token-filter-bar"
      class="token-filter-bar mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3"
    >
      <div class="filter-group flex items-center gap-3">
        <span class="text-xs text-accent-5">类型</span>
        <label class="filter-chip">
          <input
            id="filter-type-sso"
            :checked="filters.typeSso"
            type="checkbox"
            @change="updateFilter('typeSso', $event)"
          />
          <span>sso</span>
        </label>
        <label class="filter-chip">
          <input
            id="filter-type-supersso"
            :checked="filters.typeSuperSso"
            type="checkbox"
            @change="updateFilter('typeSuperSso', $event)"
          />
          <span>supersso</span>
        </label>
      </div>
      <div class="filter-group flex items-center gap-3">
        <span class="text-xs text-accent-5">状态</span>
        <label class="filter-chip">
          <input
            id="filter-status-active"
            :checked="filters.statusActive"
            type="checkbox"
            @change="updateFilter('statusActive', $event)"
          />
          <span>活跃</span>
        </label>
        <label class="filter-chip">
          <input
            id="filter-status-invalid"
            :checked="filters.statusInvalid"
            type="checkbox"
            @change="updateFilter('statusInvalid', $event)"
          />
          <span>失效</span>
        </label>
        <label class="filter-chip">
          <input
            id="filter-status-exhausted"
            :checked="filters.statusExhausted"
            type="checkbox"
            @change="updateFilter('statusExhausted', $event)"
          />
          <span>额度用尽</span>
        </label>
      </div>
      <div class="filter-summary ml-auto flex items-center gap-3">
        <span class="text-xs text-accent-5">结果 {{ resultCount }}</span>
        <UiButton variant="outline" size="xs" @click="$emit('reset-filters')">清空筛选</UiButton>
      </div>
      
      <div v-if="selectedCount > 0 || batchRunning" class="batch-actions flex w-full items-center gap-3 pt-3 border-t border-border mt-3">
        <div class="flex items-center gap-2 text-sm font-medium">
          <span class="text-xs text-accent-5">已选择</span>
          <span class="rounded-full bg-black px-1.5 py-0.5 text-xs text-white">{{ selectedCount }}</span>
          <span class="text-xs text-accent-5">项</span>
        </div>
        <span class="toolbar-sep"></span>
        <div class="flex items-center gap-1">
          <UiButton
            variant="outline"
            size="xs"
            :disabled="batchRunning || selectedCount === 0"
            @click="$emit('export')"
          >
            导出
          </UiButton>
          <UiButton
            variant="outline"
            size="xs"
            :disabled="batchRunning || selectedCount === 0"
            @click="$emit('refresh')"
          >
            刷新
          </UiButton>
          <UiButton
            variant="danger"
            size="xs"
            :disabled="batchRunning || selectedCount === 0"
            @click="$emit('delete')"
          >
            删除
          </UiButton>
        </div>
        <div
          v-if="batchRunning"
          class="flex items-center gap-2 text-xs text-accent-5"
        >
          <span class="toolbar-sep"></span>
          <span>{{ batchProgressText }}</span>
          <UiButton variant="link" @click="$emit('pause')">
            {{ batchPaused ? '继续' : '暂停' }}
          </UiButton>
          <UiButton variant="link" @click="$emit('stop')">终止</UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
