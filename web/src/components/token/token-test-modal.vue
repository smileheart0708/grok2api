<script setup lang="ts">
import { computed } from 'vue'
import UiModal from '@/components/ui/ui-modal.vue'
import UiButton from '@/components/ui/ui-button.vue'
import type { AdminChatModel } from '@/types/admin-api'

interface Props {
  open: boolean
  tokenDisplay: string
  models: readonly AdminChatModel[]
  selectedModel: string
  running: boolean
  metaText: string
  resultText: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close' | 'run'): void
  (e: 'update:selected-model', value: string): void
}>()

const hasResult = computed(
  () => props.metaText.trim().length > 0 || props.resultText.trim().length > 0,
)

function onModelChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  emit('update:selected-model', target.value)
}
</script>

<template>
  <UiModal :open="open" title="测试 Token" size="lg" @close="$emit('close')">
    <div class="space-y-4">
      <div>
        <label class="modal-label mb-1 block">当前 Token</label>
        <input
          type="text"
          class="geist-input bg-gray-50 font-mono text-gray-500"
          :value="tokenDisplay"
          readonly
        />
      </div>
      <div>
        <label class="modal-label mb-1 block">测试模型（仅聊天模型）</label>
        <select
          class="geist-input"
          :value="selectedModel"
          :disabled="running || models.length === 0"
          @change="onModelChange"
        >
          <option v-if="models.length === 0" value="">暂无模型</option>
          <option v-for="model in models" :key="model.id" :value="model.id">
            {{ model.displayName }}
          </option>
        </select>
      </div>
      <div class="text-xs text-accent-5">
        测试消息固定为 <code>hi</code>，仅用于模拟一次下游聊天请求。
      </div>
      <div v-if="metaText" class="text-xs text-accent-5">{{ metaText }}</div>
      <pre
        v-if="hasResult"
        class="test-result-box max-h-64 overflow-auto rounded-md border border-border bg-accent-1 p-2 font-mono text-xs whitespace-pre-wrap"
        >{{ resultText }}</pre
      >
      <div class="flex justify-end gap-2 pt-2">
        <UiButton variant="outline" size="xs" :disabled="running" @click="$emit('close')"
          >取消</UiButton
        >
        <UiButton
          variant="solid"
          size="xs"
          :disabled="running || !selectedModel"
          @click="$emit('run')"
        >
          {{ running ? '测试中...' : '开始测试' }}
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>
