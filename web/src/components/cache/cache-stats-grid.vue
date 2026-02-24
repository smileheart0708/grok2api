<script setup lang="ts">
import { Image as ImageIcon, Trash2, Video } from 'lucide-vue-next'
import { computed } from 'vue'
import { cacheSectionTitle, cacheUnit } from '@/components/cache/cache-utils'
import type { AdminCacheType } from '@/types/admin-api'

interface Props {
  imageCount: number
  imageSizeText: string
  videoCount: number
  videoSizeText: string
  activeType: AdminCacheType
  clearingType: AdminCacheType | null
}

const { imageCount, imageSizeText, videoCount, videoSizeText, activeType, clearingType } = defineProps<Props>()

const emit = defineEmits<(e: 'select-type' | 'clear-type', type: AdminCacheType) => void>()

interface CacheSectionItem {
  type: AdminCacheType
  icon: typeof ImageIcon
  title: string
  count: number
  sizeText: string
  unit: string
}

function createSection(
  type: AdminCacheType,
  icon: typeof ImageIcon,
  count: number,
  sizeText: string,
): CacheSectionItem {
  return {
    type,
    icon,
    title: cacheSectionTitle(type),
    count,
    sizeText,
    unit: cacheUnit(type),
  }
}

const sections = computed<CacheSectionItem[]>(() => [
  createSection('image', ImageIcon, imageCount, imageSizeText),
  createSection('video', Video, videoCount, videoSizeText),
])
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <button
      v-for="section in sections"
      :key="section.type"
      type="button"
      class="stat-card cache-card text-left"
      :class="{ selected: activeType === section.type }"
      @click="emit('select-type', section.type)"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="cache-stat-label inline-flex items-center gap-1.5">
            <component :is="section.icon" :size="14" aria-hidden="true" />
            <span>{{ section.title }}</span>
          </div>
          <div class="cache-stat-value">
            <span>{{ section.count }}</span>
            <span class="text-xs text-[var(--accents-4)] ml-1">{{ section.unit }}</span>
          </div>
        </div>

        <div class="text-right shrink-0">
          <div class="text-xs font-mono text-[var(--accents-4)]">{{ section.sizeText }}</div>
          <button
            type="button"
            class="cache-action-btn mt-4"
            :disabled="clearingType === section.type"
            :title="`清空${section.title}`"
            @click.stop="emit('clear-type', section.type)"
          >
            <Trash2 :size="14" aria-hidden="true" />
          </button>
        </div>
      </div>
    </button>
  </div>
</template>
