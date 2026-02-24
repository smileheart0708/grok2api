<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed } from 'vue'

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
        <button v-if="showClose" class="modal-close" type="button" aria-label="关闭弹窗" @click="$emit('close')">
          <X :size="20" aria-hidden="true" />
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>
