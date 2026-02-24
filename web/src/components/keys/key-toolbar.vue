<script setup lang="ts">
import { Plus, RotateCcw, Search } from 'lucide-vue-next'
import type { KeyFilterState, KeyFilterStatus } from '@/components/keys/key-utils'
import UiButton from '@/components/ui/ui-button.vue'

interface Props {
  filters: KeyFilterState
  resultCount: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'open-create' | 'reset-filters'): void
  (e: 'update:filters', value: KeyFilterState): void
}>()

function onSearchInput(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  emit('update:filters', {
    ...props.filters,
    search: target.value,
  })
}

function onStatusChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const status = target.value
  if (!isKeyFilterStatus(status)) return

  emit('update:filters', {
    ...props.filters,
    status,
  })
}

function isKeyFilterStatus(value: string): value is KeyFilterStatus {
  return value === 'all' || value === 'active' || value === 'inactive' || value === 'exhausted'
}
</script>

<template>
  <div class="space-y-6">
    <div class="keys-page-header flex flex-wrap justify-between items-start gap-3">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">API Key 管理</h2>
        <p class="text-[var(--accents-4)] mt-1 text-sm">管理访问 /v1/* 的 API Keys（含每日额度）。</p>
      </div>
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <UiButton variant="solid" size="sm" class="gap-2" @click="$emit('open-create')">
          <Plus :size="14" aria-hidden="true" />
          新增 Key
        </UiButton>
      </div>
    </div>

    <div class="keys-toolbar mb-4">
      <div class="keys-toolbar-left">
        <div class="keys-toolbar-search">
          <Search :size="14" class="keys-toolbar-search-icon" aria-hidden="true" />
          <input
            :value="filters.search"
            type="text"
            class="geist-input"
            placeholder="搜索名称或 Key..."
            @input="onSearchInput"
          >
        </div>
        <select class="geist-input" :value="filters.status" @change="onStatusChange">
          <option value="all">全部状态</option>
          <option value="active">仅启用</option>
          <option value="inactive">仅禁用</option>
          <option value="exhausted">仅额度用尽</option>
        </select>
        <UiButton variant="outline" size="xs" class="gap-1" @click="$emit('reset-filters')">
          <RotateCcw :size="12" aria-hidden="true" />
          重置
        </UiButton>
      </div>
      <div class="keys-toolbar-right text-xs text-[var(--accents-5)]">
        结果 <span>{{ resultCount }}</span>
      </div>
    </div>
  </div>
</template>
