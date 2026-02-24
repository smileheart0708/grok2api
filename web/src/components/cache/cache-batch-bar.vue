<script setup lang="ts">
import { GripVertical, RotateCcw, Trash2 } from 'lucide-vue-next'
import { computed, onUnmounted, ref, useTemplateRef } from 'vue'
import UiButton from '@/components/ui/ui-button.vue'

interface Props {
  selectedCount: number
  loading: boolean
  deleting: boolean
  sectionLabel: string
}

const { selectedCount, loading, deleting, sectionLabel } = defineProps<Props>()

defineEmits<(e: 'load' | 'delete') => void>()

const rootRef = useTemplateRef<HTMLDivElement>('root')
const isDragging = ref(false)
const dragPosition = ref<{ left: number; top: number } | null>(null)

let pointerId = -1
let dragStartLeft = 0
let dragStartTop = 0
let dragClientStartX = 0
let dragClientStartY = 0

const loadDisabled = computed(() => deleting)
const deleteDisabled = computed(() => deleting || selectedCount === 0)
const deleteLabel = computed(() => (deleting ? '清理中...' : '清理'))

const floatingStyle = computed(() => {
  const position = dragPosition.value
  if (!position) return undefined
  return {
    left: `${String(position.left)}px`,
    top: `${String(position.top)}px`,
    bottom: 'auto',
    transform: 'none',
  }
})

function removeDragListeners(): void {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerEnd)
  window.removeEventListener('pointercancel', onPointerEnd)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return

  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (target.closest('button')) return

  const root = rootRef.value
  if (!root) return

  const rect = root.getBoundingClientRect()
  dragPosition.value ??= {
    left: rect.left,
    top: rect.top,
  }

  const position = dragPosition.value

  dragStartLeft = position.left
  dragStartTop = position.top
  dragClientStartX = event.clientX
  dragClientStartY = event.clientY
  pointerId = event.pointerId
  isDragging.value = true

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerEnd)
  window.addEventListener('pointercancel', onPointerEnd)
}

function onPointerMove(event: PointerEvent): void {
  if (!isDragging.value || event.pointerId !== pointerId) return
  const nextLeft = dragStartLeft + (event.clientX - dragClientStartX)
  const nextTop = dragStartTop + (event.clientY - dragClientStartY)
  dragPosition.value = {
    left: nextLeft,
    top: nextTop,
  }
}

function onPointerEnd(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return
  pointerId = -1
  isDragging.value = false
  removeDragListeners()
}

onUnmounted(() => {
  removeDragListeners()
})
</script>

<template>
  <div
    id="batch-actions"
    ref="root"
    class="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 bg-white border border-[var(--border)] rounded-full px-3 py-2 flex items-center shadow-lg gap-3 cursor-move select-none active:cursor-grabbing whitespace-nowrap"
    :class="{ 'is-dragging': isDragging }"
    :style="floatingStyle"
    @pointerdown="onPointerDown"
  >
    <div class="batch-actions-meta text-sm font-medium flex items-center gap-2">
      <GripVertical :size="13" class="text-[var(--accents-4)]" aria-hidden="true" />
      <span class="text-[var(--accents-5)] text-xs">{{ sectionLabel }}已选择</span>
      <span class="bg-black text-white text-xs px-1.5 py-0.5 rounded-full">{{ selectedCount }}</span>
      <span class="text-[var(--accents-5)] text-xs">项</span>
    </div>
    <span class="toolbar-sep"></span>
    <div class="batch-actions-buttons flex items-center gap-1">
      <UiButton
        variant="outline"
        size="xs"
        :disabled="loadDisabled"
        @click="$emit('load')"
      >
        <RotateCcw :size="12" aria-hidden="true" />
        {{ loading ? '加载中...' : '加载' }}
      </UiButton>
      <UiButton
        variant="danger"
        size="xs"
        :disabled="deleteDisabled"
        @click="$emit('delete')"
      >
        <Trash2 :size="12" aria-hidden="true" />
        {{ deleteLabel }}
      </UiButton>
    </div>
  </div>
</template>
