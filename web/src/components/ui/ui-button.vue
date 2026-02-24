<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({
  inheritAttrs: false,
})

type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'danger' | 'link' | 'nav' | 'tab'
type ButtonTone = 'neutral' | 'brand'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface UiButtonProps {
  variant?: ButtonVariant
  tone?: ButtonTone
  size?: ButtonSize
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  block?: boolean
  pressed?: boolean | null
}

const {
  variant = 'solid',
  tone = 'neutral',
  size = 'sm',
  type = 'button',
  disabled,
  loading,
  block,
  pressed = null,
} = defineProps<UiButtonProps>()

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
    class="ui-button"
    :data-variant="variant"
    :data-tone="tone"
    :data-size="size"
    :data-block="block ? 'true' : undefined"
    :data-loading="loading ? 'true' : undefined"
    :data-pressed="pressedAttr"
    :type="type"
    :disabled="isDisabled"
    :aria-pressed="pressedAttr"
    @click="onClick"
  >
    <slot />
  </button>
</template>
