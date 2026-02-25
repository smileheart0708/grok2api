<script setup lang="ts">
import { X } from 'lucide-vue-next'
import UiButton from '@/components/ui/ui-button.vue'
import type { AdminChatModel } from '@/types/admin-api'

interface Props {
  open: boolean
  models: AdminChatModel[]
  selectedModel: string
  running?: boolean
  resultText?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  running: false,
  resultText: null,
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit' | 'update:selected-model', model: string): void
}>()

function handleClose(): void {
  if (props.running) return
  emit('close')
}

function handleSubmit(): void {
  if (!props.selectedModel || props.running) return
  emit('submit', props.selectedModel)
}

function onModelChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  emit('update:selected-model', target.value)
}
</script>

<template>
  <div v-if="open" class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="handleClose">
    <div class="modal-content w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold text-fg">额度查询</h3>
        <button
          class="rounded p-1 text-accent-5 hover:bg-surface-muted hover:text-fg"
          :disabled="running"
          @click="handleClose"
        >
          <X :size="18" />
        </button>
      </div>

      <p class="mt-2 text-sm text-accent-4">
        选择一个模型来查询该模型的剩余额度
      </p>

      <div class="mt-4 space-y-3">
        <label class="block">
          <span class="text-sm text-accent-5">模型</span>
          <select
            class="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent-5 focus:ring-1 focus:ring-accent-5"
            :value="selectedModel"
            :disabled="running"
            @change="onModelChange"
          >
            <option
              v-for="model in models"
              :key="model.id"
              :value="model.id"
            >
              {{ model.displayName }} ({{ model.id }})
            </option>
          </select>
        </label>

        <div v-if="resultText" class="mt-4 rounded-lg border border-border bg-surface-muted p-4">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-fg">查询结果:</span>
          </div>
          <pre class="mt-2 max-h-64 overflow-auto text-xs text-accent-4">{{ resultText }}</pre>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <UiButton variant="outline" :disabled="running" @click="handleClose">关闭</UiButton>
        <UiButton
          variant="solid"
          :disabled="!selectedModel || running"
          @click="handleSubmit"
        >
          {{ running ? '查询中...' : '查询额度' }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
