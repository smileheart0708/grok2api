<script setup lang="ts">
import { Download, Plus } from 'lucide-vue-next'
import type { TokenFilterState } from '@/types/admin-api'

interface Props {
  filters: TokenFilterState
  resultCount: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'open-import' | 'open-add' | 'reset-filters'): void
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
    <div class="flex flex-wrap justify-between items-start gap-3">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">Token 列表</h2>
        <p class="text-[var(--accents-4)] mt-1 text-sm">管理 Grok2API 的 Token 服务号池。</p>
      </div>
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <button type="button" class="geist-button-outline gap-2" @click="$emit('open-import')">
          <Download :size="14" aria-hidden="true" />
          导入
        </button>
        <button type="button" class="geist-button gap-2" @click="$emit('open-add')">
          <Plus :size="14" aria-hidden="true" />
          添加
        </button>
      </div>
    </div>

    <div
      id="token-filter-bar"
      class="token-filter-bar mb-4 bg-white border border-[var(--border)] rounded-lg px-4 py-3 flex flex-wrap items-center gap-4"
    >
      <div class="filter-group flex items-center gap-3">
        <span class="text-xs text-[var(--accents-5)]">类型</span>
        <label class="filter-chip">
          <input id="filter-type-sso" :checked="filters.typeSso" type="checkbox" @change="updateFilter('typeSso', $event)">
          <span>sso</span>
        </label>
        <label class="filter-chip">
          <input id="filter-type-supersso" :checked="filters.typeSuperSso" type="checkbox" @change="updateFilter('typeSuperSso', $event)">
          <span>supersso</span>
        </label>
      </div>
      <div class="filter-group flex items-center gap-3">
        <span class="text-xs text-[var(--accents-5)]">状态</span>
        <label class="filter-chip">
          <input id="filter-status-active" :checked="filters.statusActive" type="checkbox" @change="updateFilter('statusActive', $event)">
          <span>活跃</span>
        </label>
        <label class="filter-chip">
          <input id="filter-status-invalid" :checked="filters.statusInvalid" type="checkbox" @change="updateFilter('statusInvalid', $event)">
          <span>失效</span>
        </label>
        <label class="filter-chip">
          <input
            id="filter-status-exhausted"
            :checked="filters.statusExhausted"
            type="checkbox"
            @change="updateFilter('statusExhausted', $event)"
          >
          <span>额度用尽</span>
        </label>
      </div>
      <div class="filter-summary ml-auto flex items-center gap-3">
        <span class="text-xs text-[var(--accents-5)]">结果 {{ resultCount }}</span>
        <button type="button" class="geist-button-outline text-xs px-3 h-7" @click="$emit('reset-filters')">清空筛选</button>
      </div>
    </div>
  </div>
</template>
