<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiModal from '@/components/ui/ui-modal.vue'
import UiButton from '@/components/ui/ui-button.vue'
import type { AdminTokenPool } from '@/types/admin-api'
import type { TokenEditorMode, TokenEditorSubmitPayload } from '@/components/token/token-types'

interface Props {
  open: boolean
  mode: TokenEditorMode
  initialToken: string
  initialPool: AdminTokenPool
  initialQuota: number
  initialNote: string
  saving: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: TokenEditorSubmitPayload): void
}>()

const tokenInput = ref('')
const poolInput = ref<AdminTokenPool>('ssoBasic')
const quotaInput = ref('80')
const noteInput = ref('')
const errorText = ref('')

const title = computed(() => (props.mode === 'edit' ? '编辑 Token' : '添加 Token'))
const submitText = computed(() => (props.mode === 'edit' ? '保存' : '添加'))
const isTokenLocked = computed(() => props.mode === 'edit')

watch(
  () => [props.open, props.mode, props.initialToken, props.initialPool, props.initialQuota, props.initialNote],
  () => {
    if (!props.open) return
    tokenInput.value = props.initialToken
    poolInput.value = props.initialPool
    quotaInput.value = String(Math.max(0, Math.floor(props.initialQuota)))
    noteInput.value = props.initialNote
    errorText.value = ''
  },
  { immediate: true },
)

function onSubmit(): void {
  const token = tokenInput.value.trim()
  if (!token) {
    errorText.value = 'Token 不能为空'
    return
  }

  const parsedQuota = Number.parseInt(quotaInput.value, 10)
  const quota = Number.isFinite(parsedQuota) && parsedQuota >= 0 ? parsedQuota : 0

  emit('submit', {
    token,
    pool: poolInput.value,
    quota,
    note: noteInput.value.trim().slice(0, 50),
  })
}
</script>

<template>
  <UiModal :open="open" :title="title" size="lg" @close="$emit('close')">
    <div class="space-y-4">
      <div>
        <label class="modal-label mb-1 block">Token</label>
        <input
          v-model="tokenInput"
          type="text"
          class="geist-input font-mono"
          :readonly="isTokenLocked"
          :disabled="saving"
          placeholder="sso=..."
        >
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="modal-label mb-1 block">类型</label>
          <select v-model="poolInput" class="geist-input" :disabled="saving">
            <option value="ssoBasic">ssoBasic</option>
            <option value="ssoSuper">ssoSuper</option>
          </select>
        </div>
        <div>
          <label class="modal-label mb-1 block">额度</label>
          <input v-model="quotaInput" type="number" class="geist-input" min="0" :disabled="saving">
        </div>
      </div>
      <div>
        <label class="modal-label mb-1 block">备注</label>
        <input
          v-model="noteInput"
          type="text"
          class="geist-input"
          placeholder="可选备注"
          maxlength="50"
          :disabled="saving"
        >
      </div>
      <p v-if="errorText" class="text-xs text-red-600">{{ errorText }}</p>
      <div class="flex justify-end gap-2 pt-2">
        <UiButton variant="outline" size="xs" :disabled="saving" @click="$emit('close')">取消</UiButton>
        <UiButton variant="solid" tone="brand" size="xs" :disabled="saving" @click="onSubmit">
          {{ saving ? '处理中...' : submitText }}
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>
