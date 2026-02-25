<script setup lang="ts">
interface Props {
  value: string | number
  label: string
  valueClass?: string
}

withDefaults(defineProps<Props>(), {
  valueClass: '',
})
</script>

<template>
  <div class="stat-card">
    <div class="stat-value" :class="valueClass">{{ value }}</div>
    <div class="stat-label">{{ label }}</div>
  </div>
</template>
