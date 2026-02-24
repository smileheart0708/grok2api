<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Infinity as InfinityIcon, KeyRound, Sparkles } from 'lucide-vue-next'
import UiModal from '@/components/ui/ui-modal.vue'
import UiButton from '@/components/ui/ui-button.vue'
import {
  DEFAULT_KEY_LIMIT_DRAFT,
  generateRandomApiKey,
  toLimitsInput,
  type KeyEditorSubmitPayload,
  type KeyLimitDraft,
} from '@/components/keys/key-utils'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  initialName: string
  initialKey: string
  initialIsActive: boolean
  initialLimits: KeyLimitDraft
  saving: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: KeyEditorSubmitPayload): void
}>()

const nameInput = ref('')
const keyInput = ref('')
const activeInput = ref(true)
const limits = ref<KeyLimitDraft>({ ...DEFAULT_KEY_LIMIT_DRAFT })
const errorText = ref('')

const title = computed(() => (props.mode === 'edit' ? '编辑 API Key' : '新增 API Key'))
const submitText = computed(() => (props.mode === 'edit' ? '保存' : '创建'))
const isEditMode = computed(() => props.mode === 'edit')

watch(
  () => [props.open, props.mode, props.initialName, props.initialKey, props.initialIsActive, props.initialLimits],
  () => {
    if (!props.open) return
    nameInput.value = props.initialName
    keyInput.value = props.initialKey
    activeInput.value = props.initialIsActive
    limits.value = { ...props.initialLimits }
    errorText.value = ''
  },
  { immediate: true },
)

function applyRecommendedPreset(): void {
  limits.value = {
    chat: '300',
    heavy: '100',
    image: '100',
    video: '20',
  }
}

function applyUnlimitedPreset(): void {
  limits.value = { ...DEFAULT_KEY_LIMIT_DRAFT }
}

function onGenerateKey(): void {
  if (isEditMode.value) return
  keyInput.value = generateRandomApiKey()
}

function onSubmit(): void {
  const key = keyInput.value.trim()
  if (isEditMode.value && !key) {
    errorText.value = '编辑模式下 Key 不可为空'
    return
  }

  const payload: KeyEditorSubmitPayload = {
    name: nameInput.value.trim(),
    key,
    is_active: activeInput.value,
    limits: toLimitsInput(limits.value),
  }
  emit('submit', payload)
}
</script>

<template>
  <UiModal :open="open" :title="title" size="lg" :close-on-overlay="!saving" @close="$emit('close')">
    <div class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="modal-label mb-1 block">密钥名</label>
          <input
            v-model="nameInput"
            type="text"
            class="geist-input"
            maxlength="50"
            placeholder="留空=随机生成"
            :disabled="saving"
          >
        </div>
        <div>
          <label class="modal-label mb-1 block">API Key 值</label>
          <div class="flex flex-col sm:flex-row gap-2">
            <input
              v-model="keyInput"
              type="text"
              class="geist-input font-mono"
              :disabled="saving || isEditMode"
              placeholder="留空=随机生成 sk-..."
            >
            <UiButton
              variant="outline"
              size="xs"
              class="gap-1"
              :disabled="saving || isEditMode"
              @click="onGenerateKey"
            >
              <Sparkles :size="12" aria-hidden="true" />
              自动生成
            </UiButton>
          </div>
          <div class="text-xs text-[var(--accents-5)] mt-1">允许任意字符串；建议使用 sk- 前缀。</div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-[var(--accents-5)]">额度预设</span>
        <UiButton variant="outline" size="xs" class="gap-1" :disabled="saving" @click="applyRecommendedPreset">
          <KeyRound :size="12" aria-hidden="true" />
          推荐
        </UiButton>
        <UiButton variant="outline" size="xs" class="gap-1" :disabled="saving" @click="applyUnlimitedPreset">
          <InfinityIcon :size="12" aria-hidden="true" />
          不限
        </UiButton>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label class="modal-label mb-1 block">Chat / 天</label>
          <input v-model="limits.chat" type="number" class="geist-input" min="-1" :disabled="saving">
        </div>
        <div>
          <label class="modal-label mb-1 block">Heavy / 天</label>
          <input v-model="limits.heavy" type="number" class="geist-input" min="-1" :disabled="saving">
        </div>
        <div>
          <label class="modal-label mb-1 block">生图 / 天</label>
          <input v-model="limits.image" type="number" class="geist-input" min="-1" :disabled="saving">
        </div>
        <div>
          <label class="modal-label mb-1 block">视频 / 天</label>
          <input v-model="limits.video" type="number" class="geist-input" min="-1" :disabled="saving">
        </div>
      </div>

      <label class="inline-flex items-center gap-2">
        <input v-model="activeInput" type="checkbox" class="checkbox" :disabled="saving">
        <span class="text-sm">启用</span>
      </label>

      <p v-if="errorText" class="text-xs text-red-600">{{ errorText }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <UiButton variant="outline" size="xs" :disabled="saving" @click="$emit('close')">取消</UiButton>
        <UiButton variant="solid" tone="brand" size="xs" :disabled="saving" @click="onSubmit">
          {{ saving ? '提交中...' : submitText }}
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>
