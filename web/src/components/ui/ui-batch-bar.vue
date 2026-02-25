<script setup lang="ts">
import UiButton from '@/components/ui/ui-button.vue'

interface Props {
  selectedCount: number
  running: boolean
  paused: boolean
  progressText: string
}

defineProps<Props>()

defineEmits<(e: 'export' | 'refresh' | 'delete' | 'pause' | 'stop') => void>()
</script>

<template>
  <div
    id="batch-actions"
    class="fixed bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 whitespace-nowrap shadow-lg select-none"
  >
    <div class="batch-actions-meta flex items-center gap-2 text-sm font-medium">
      <span class="text-xs text-[var(--accents-5)]">已选择</span>
      <span id="selected-count" class="rounded-full bg-black px-1.5 py-0.5 text-xs text-white">{{
        selectedCount
      }}</span>
      <span class="text-xs text-[var(--accents-5)]">项</span>
    </div>
    <span class="toolbar-sep"></span>
    <div class="batch-actions-buttons flex items-center gap-1">
      <UiButton
        id="btn-batch-export"
        variant="outline"
        size="xs"
        :disabled="running || selectedCount === 0"
        @click="$emit('export')"
      >
        导出
      </UiButton>
      <UiButton
        id="btn-batch-update"
        variant="outline"
        size="xs"
        :disabled="running || selectedCount === 0"
        @click="$emit('refresh')"
      >
        刷新
      </UiButton>
      <UiButton
        id="btn-batch-delete"
        variant="danger"
        size="xs"
        :disabled="running || selectedCount === 0"
        @click="$emit('delete')"
      >
        删除
      </UiButton>
    </div>
    <div
      v-if="running"
      id="batch-progress"
      class="flex items-center gap-2 text-xs text-[var(--accents-5)]"
    >
      <span class="toolbar-sep"></span>
      <span id="batch-progress-text">{{ progressText }}</span>
      <UiButton id="btn-pause-action" variant="link" @click="$emit('pause')">
        {{ paused ? '继续' : '暂停' }}
      </UiButton>
      <UiButton id="btn-stop-action" variant="link" @click="$emit('stop')">终止</UiButton>
    </div>
  </div>
</template>
