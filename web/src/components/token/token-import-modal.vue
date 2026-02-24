<script setup lang="ts">
import { ref, watch } from 'vue'
import UiModal from '@/components/ui/ui-modal.vue'
import type { AdminTokenPool } from '@/types/admin-api'
import type { TokenImportSubmitPayload } from '@/components/token/token-types'

interface Props {
  open: boolean
  saving: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: TokenImportSubmitPayload): void
}>()

const poolInput = ref<AdminTokenPool>('ssoBasic')
const textInput = ref('')
const errorText = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    poolInput.value = 'ssoBasic'
    textInput.value = ''
    errorText.value = ''
  },
)

function onSubmit(): void {
  const tokens = textInput.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (tokens.length === 0) {
    errorText.value = '请输入至少一个 Token'
    return
  }

  emit('submit', {
    pool: poolInput.value,
    tokens,
  })
}
</script>

<template>
  <UiModal :open="open" title="批量导入 Token" size="lg" @close="$emit('close')">
    <div class="space-y-4">
      <div>
        <label class="modal-label mb-1 block">目标 Pool</label>
        <select v-model="poolInput" class="geist-input" :disabled="saving">
          <option value="ssoBasic">ssoBasic</option>
          <option value="ssoSuper">ssoSuper</option>
        </select>
      </div>
      <div>
        <label class="modal-label mb-1 block">Token 列表（每行一个）</label>
        <textarea
          v-model="textInput"
          class="geist-input font-mono h-48"
          placeholder="粘贴 Token，一行一个..."
          :disabled="saving"
        ></textarea>
      </div>
      <p v-if="errorText" class="text-xs text-red-600">{{ errorText }}</p>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="geist-button-outline text-xs px-3" :disabled="saving" @click="$emit('close')">取消</button>
        <button type="button" class="geist-button text-xs px-3" :disabled="saving" @click="onSubmit">
          {{ saving ? '导入中...' : '开始导入' }}
        </button>
      </div>
    </div>
  </UiModal>
</template>
