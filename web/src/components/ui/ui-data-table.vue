<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  loading: boolean
  empty: boolean
  emptyText?: string
  minWidth?: string
}

const props = withDefaults(defineProps<Props>(), {
  emptyText: '暂无数据',
  minWidth: '',
})

const tableStyle = computed(() => (props.minWidth ? { minWidth: props.minWidth } : undefined))
</script>

<template>
  <div class="ui-data-table mb-4 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
    <div class="ui-data-table__scroll overflow-x-auto">
      <table class="ui-data-table__table" :style="tableStyle">
        <thead>
          <slot name="head" />
        </thead>
        <tbody>
          <slot />
        </tbody>
      </table>
    </div>
    <div v-if="loading" class="text-center py-12 text-[var(--accents-4)]">加载中...</div>
    <div v-else-if="empty" class="text-center py-12 text-[var(--accents-4)]">{{ emptyText }}</div>
  </div>
</template>

<style>
.ui-data-table__table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.ui-data-table__table th {
  height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid var(--accents-1);
  color: var(--accents-5);
  font-weight: 500;
  text-align: center;
  background: var(--surface);
  white-space: nowrap;
}

.ui-data-table__table td {
  height: 44px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--accents-1);
  color: var(--accents-6);
  background: var(--surface);
  vertical-align: middle;
  transition: background-color 0.15s ease;
  font-size: 12px;
}

.ui-data-table__table tr:last-child td {
  border-bottom: none;
}

.ui-data-table__table tr:hover td {
  background: var(--surface-muted);
}

.ui-data-table__table tr.row-selected td {
  background: color-mix(in srgb, var(--surface-muted) 80%, var(--surface));
}

.ui-data-table__table tr.row-selected:hover td {
  background: color-mix(in srgb, var(--surface-muted) 94%, var(--surface));
}
</style>
