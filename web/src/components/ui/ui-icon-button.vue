<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({
  inheritAttrs: false,
})

type IconButtonVariant = 'ghost' | 'outline' | 'danger' | 'nav'
type IconButtonTone = 'neutral' | 'brand'
type IconButtonSize = 'xs' | 'sm' | 'md'

interface UiIconButtonProps {
  label: string
  variant?: IconButtonVariant
  tone?: IconButtonTone
  size?: IconButtonSize
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  pressed?: boolean | null
}

const {
  label,
  variant = 'ghost',
  tone = 'neutral',
  size = 'sm',
  type = 'button',
  disabled,
  loading,
  pressed = null,
} = defineProps<UiIconButtonProps>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const attrs = useAttrs()

const isDisabled = computed(() => disabled || loading)
const pressedAttr = computed(() => {
  if (pressed === null) return undefined
  return pressed ? 'true' : 'false'
})

function onClick(event: MouseEvent): void {
  if (isDisabled.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}
</script>

<template>
  <button
    v-bind="attrs"
    class="ui-icon-button"
    :data-variant="variant"
    :data-tone="tone"
    :data-size="size"
    :data-loading="loading ? 'true' : undefined"
    :data-pressed="pressedAttr"
    :type="type"
    :disabled="isDisabled"
    :aria-label="label"
    :aria-pressed="pressedAttr"
    @click="onClick"
  >
    <slot />
  </button>
</template>
