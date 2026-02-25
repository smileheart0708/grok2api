<script setup lang="ts">
import UiStatCard from '@/components/ui/ui-stat-card.vue'
import type { TokenStats } from '@/components/token/token-types'

interface Props {
  stats: TokenStats
}

defineProps<Props>()
</script>

<template>
  <div id="stats-container" class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <UiStatCard :value="stats.total.toLocaleString()" label="Token 总数" />
    <UiStatCard
      :value="stats.active.toLocaleString()"
      label="Token 正常"
      value-class="text-green-600"
    />
    <UiStatCard
      :value="stats.exhausted.toLocaleString()"
      label="Token 限流"
      value-class="text-orange-500"
    />
    <UiStatCard
      :value="stats.invalid.toLocaleString()"
      label="Token 失效"
      value-class="text-red-600"
    />
    <UiStatCard :value="stats.chatQuota.toLocaleString()" label="总额度" />
    <UiStatCard :value="stats.totalCalls.toLocaleString()" label="总调用次数" />
  </div>
</template>
