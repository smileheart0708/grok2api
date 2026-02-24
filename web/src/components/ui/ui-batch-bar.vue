<script setup lang="ts">
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
    class="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 bg-white border border-[var(--border)] rounded-full px-3 py-2 flex items-center shadow-lg gap-3 select-none whitespace-nowrap"
  >
    <div class="batch-actions-meta text-sm font-medium flex items-center gap-2">
      <span class="text-[var(--accents-5)] text-xs">已选择</span>
      <span id="selected-count" class="bg-black text-white text-xs px-1.5 py-0.5 rounded-full">{{ selectedCount }}</span>
      <span class="text-[var(--accents-5)] text-xs">项</span>
    </div>
    <span class="toolbar-sep"></span>
    <div class="batch-actions-buttons flex items-center gap-1">
      <button
        id="btn-batch-export"
        type="button"
        class="geist-button-outline text-xs px-3 gap-1 border-0 hover:bg-gray-100"
        :disabled="running || selectedCount === 0"
        @click="$emit('export')"
      >
        导出
      </button>
      <button
        id="btn-batch-update"
        type="button"
        class="geist-button-outline text-xs px-3 gap-1 border-0 hover:bg-gray-100 justify-center"
        :disabled="running || selectedCount === 0"
        @click="$emit('refresh')"
      >
        刷新
      </button>
      <button
        id="btn-batch-delete"
        type="button"
        class="geist-button-danger text-xs px-3"
        :disabled="running || selectedCount === 0"
        @click="$emit('delete')"
      >
        删除
      </button>
    </div>
    <div v-if="running" id="batch-progress" class="text-xs text-[var(--accents-5)] flex items-center gap-2">
      <span class="toolbar-sep"></span>
      <span id="batch-progress-text">{{ progressText }}</span>
      <button id="btn-pause-action" type="button" class="batch-link" @click="$emit('pause')">
        {{ paused ? '继续' : '暂停' }}
      </button>
      <button id="btn-stop-action" type="button" class="batch-link" @click="$emit('stop')">终止</button>
    </div>
  </div>
</template>
