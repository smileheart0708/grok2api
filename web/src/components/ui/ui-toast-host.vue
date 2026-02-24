<script setup lang="ts">
import { computed } from 'vue'
import { useToast, type ToastItem } from '@/composables/use-toast'

const { toasts, removeToast } = useToast()

const hasToasts = computed(() => toasts.value.length > 0)

function toastClass(item: ToastItem): string {
  if (item.type === 'error') return 'toast-error'
  if (item.type === 'info') return 'toast-info'
  return 'toast-success'
}
</script>

<template>
  <div v-if="hasToasts" class="toast-container" aria-live="polite" aria-atomic="true">
    <div
      v-for="item in toasts"
      :key="item.id"
      class="toast"
      :class="toastClass(item)"
      role="status"
      tabindex="0"
      @click="removeToast(item.id)"
      @keydown.enter.prevent="removeToast(item.id)"
    >
      <div class="toast-icon">
        <svg
          v-if="item.type === 'error'"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <svg
          v-else-if="item.type === 'info'"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <svg
          v-else
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="toast-content">{{ item.message }}</div>
    </div>
  </div>
</template>

<style scoped>
.toast-info .toast-icon {
  background: #eff6ff;
  color: #2563eb;
}
</style>

