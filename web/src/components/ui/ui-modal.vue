<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed } from 'vue'
import UiIconButton from '@/components/ui/ui-icon-button.vue'

interface Props {
  open: boolean
  title?: string
  size?: 'md' | 'lg'
  closeOnOverlay?: boolean
  showClose?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  size: 'md',
  closeOnOverlay: true,
  showClose: true,
})

const emit = defineEmits<(e: 'close') => void>()

const modalSizeClass = computed(() => (props.size === 'lg' ? 'modal-lg' : 'modal-md'))

function onOverlayClick(): void {
  if (!props.closeOnOverlay) return
  emit('close')
}
</script>

<template>
  <div
    class="modal-overlay"
    :class="{ hidden: !open, 'is-open': open }"
    role="dialog"
    aria-modal="true"
    @click="onOverlayClick"
  >
    <div class="modal-content" :class="modalSizeClass" @click.stop>
      <div v-if="title || $slots['header']" class="modal-header">
        <slot name="header">
          <h3 class="modal-title">{{ title }}</h3>
        </slot>
        <UiIconButton
          v-if="showClose"
          label="关闭弹窗"
          variant="ghost"
          size="sm"
          @click="$emit('close')"
        >
          <X :size="20" aria-hidden="true" />
        </UiIconButton>
      </div>
      <slot />
    </div>
  </div>
</template>
