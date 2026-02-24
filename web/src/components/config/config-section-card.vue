<script setup lang="ts">
interface Props {
  title: string
  description: string
}

defineProps<Props>()
</script>

<template>
  <section class="config-section">
    <header class="config-section-header">
      <div class="config-section-heading">
        <span class="config-section-icon">
          <slot name="icon" />
        </span>
        <div class="config-section-title-wrap">
          <h3 class="config-section-title">{{ title }}</h3>
          <p class="config-section-subtitle">{{ description }}</p>
        </div>
      </div>
    </header>
    <div class="config-grid">
      <slot />
    </div>
  </section>
</template>
