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
  <div class="rounded-lg overflow-hidden bg-white mb-4 overflow-x-auto">
    <table class="geist-table" :style="tableStyle">
      <thead>
        <slot name="head" />
      </thead>
      <tbody>
        <slot />
      </tbody>
    </table>
    <div v-if="loading" class="text-center py-12 text-[var(--accents-4)]">加载中...</div>
    <div v-else-if="empty" class="text-center py-12 text-[var(--accents-4)]">{{ emptyText }}</div>
  </div>
</template>

