<script setup lang="ts">
import { Database } from 'lucide-vue-next'
import { computed } from 'vue'
import { cacheTypeLabel } from '@/components/cache/cache-utils'
import type { AdminCacheType } from '@/types/admin-api'

interface Props {
  activeType: AdminCacheType
  resultCount: number
}

const { activeType, resultCount } = defineProps<Props>()

const activeLabel = computed(() => cacheTypeLabel(activeType))
</script>

<template>
  <div class="cache-page-header flex flex-wrap justify-between items-start gap-3">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">缓存管理</h2>
      <p class="text-[var(--accents-4)] mt-1 text-sm">管理本地图片与视频缓存。</p>
    </div>

    <div class="cache-page-meta inline-flex items-center gap-2 text-xs text-[var(--accents-5)]">
      <Database :size="14" aria-hidden="true" />
      <span>当前 {{ activeLabel }} · {{ resultCount }} 项</span>
    </div>
  </div>
</template>
