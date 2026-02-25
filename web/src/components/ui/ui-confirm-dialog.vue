<script setup lang="ts">
import UiModal from '@/components/ui/ui-modal.vue'
import UiButton from '@/components/ui/ui-button.vue'

interface Props {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

withDefaults(defineProps<Props>(), {
  title: '请确认',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
})

defineEmits<(e: 'confirm' | 'cancel') => void>()
</script>

<template>
  <UiModal :open="open" :title="title" size="md" @close="$emit('cancel')">
    <div class="confirm-dialog-body">
      <div class="confirm-dialog-message">{{ message }}</div>
      <div class="confirm-dialog-actions">
        <UiButton variant="outline" size="xs" @click="$emit('cancel')">
          {{ cancelText }}
        </UiButton>
        <UiButton
          :variant="danger ? 'danger' : 'solid'"
          size="xs"
          :tone="danger ? 'neutral' : 'brand'"
          @click="$emit('confirm')"
        >
          {{ confirmText }}
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>
