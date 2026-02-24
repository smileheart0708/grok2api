<script setup lang="ts">
import UiModal from '@/components/ui/ui-modal.vue'

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
        <button type="button" class="geist-button-outline text-xs px-3" @click="$emit('cancel')">
          {{ cancelText }}
        </button>
        <button
          type="button"
          :class="danger ? 'geist-button-danger' : 'geist-button'"
          class="text-xs px-3"
          @click="$emit('confirm')"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </UiModal>
</template>
