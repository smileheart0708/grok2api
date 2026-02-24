<script setup lang="ts">
import UiStatCard from '@/components/ui/ui-stat-card.vue'
import type { KeyStats } from '@/components/keys/key-utils'

interface Props {
  stats: KeyStats
}

defineProps<Props>()
</script>

<template>
  <div id="keys-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
    <UiStatCard :value="stats.total.toLocaleString()" label="总数" />
    <UiStatCard :value="stats.active.toLocaleString()" label="启用" value-class="text-green-600" />
    <UiStatCard :value="stats.inactive.toLocaleString()" label="禁用" value-class="text-gray-500" />
    <UiStatCard :value="stats.exhausted.toLocaleString()" label="今日额度用尽" value-class="text-orange-600" />
  </div>
</template>
