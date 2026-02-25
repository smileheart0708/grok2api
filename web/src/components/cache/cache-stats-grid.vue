<script setup lang="ts">
import { Image as ImageIcon, Trash2, Video } from 'lucide-vue-next'
import { computed } from 'vue'
import { cacheSectionTitle, cacheUnit } from '@/components/cache/cache-utils'
import UiIconButton from '@/components/ui/ui-icon-button.vue'
import type { AdminCacheType } from '@/types/admin-api'

interface Props {
  imageCount: number
  imageSizeText: string
  videoCount: number
  videoSizeText: string
  activeType: AdminCacheType
  clearingType: AdminCacheType | null
}

const { imageCount, imageSizeText, videoCount, videoSizeText, activeType, clearingType } =
  defineProps<Props>()

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

function onCardKeydown(event: KeyboardEvent, type: AdminCacheType): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('select-type', type)
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div
      v-for="section in sections"
      :key="section.type"
      class="stat-card cache-card text-left"
      :class="{ selected: activeType === section.type }"
      role="button"
      tabindex="0"
      @click="emit('select-type', section.type)"
      @keydown="onCardKeydown($event, section.type)"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="cache-stat-label inline-flex items-center gap-1.5">
            <component :is="section.icon" :size="14" aria-hidden="true" />
            <span>{{ section.title }}</span>
          </div>
          <div class="cache-stat-value">
            <span>{{ section.count }}</span>
            <span class="ml-1 text-xs text-[var(--accents-4)]">{{ section.unit }}</span>
          </div>
        </div>

        <div class="shrink-0 text-right">
          <div class="font-mono text-xs text-[var(--accents-4)]">{{ section.sizeText }}</div>
          <UiIconButton
            class="mt-4"
            :label="`清空${section.title}`"
            variant="danger"
            size="md"
            :disabled="clearingType === section.type"
            @click.stop="emit('clear-type', section.type)"
          >
            <Trash2 :size="14" aria-hidden="true" />
          </UiIconButton>
        </div>
      </div>
    </div>
  </div>
</template>
