<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  maxWidth?: string
}

const { maxWidth = '1120px' } = defineProps<Props>()

const shellStyle = computed(() => ({
  '--admin-page-max-width': maxWidth,
}))
</script>

<template>
  <main class="admin-page-shell fade-in" :style="shellStyle">
    <slot />
  </main>
</template>

<style scoped>
.admin-page-shell {
  width: min(var(--admin-page-max-width), 100%);
  margin-inline: auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

@media (width <= 768px) {
  .admin-page-shell {
    padding: 20px 16px;
    gap: 18px;
  }
}
</style>
