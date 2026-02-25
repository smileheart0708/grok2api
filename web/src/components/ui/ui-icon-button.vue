<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '@/lib/cn'

defineOptions({
  inheritAttrs: false,
})

type IconButtonVariant = 'ghost' | 'outline' | 'danger' | 'nav'
type IconButtonSize = 'xs' | 'sm' | 'md'

interface UiIconButtonProps {
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  pressed?: boolean | null
}

const {
  label,
  variant = 'ghost',
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

const sizeClass = computed(() => {
  switch (size) {
    case 'xs':
      return 'size-6'
    case 'sm':
      return 'size-7'
    case 'md':
      return 'size-8'
    default:
      return 'size-7'
  }
})

const variantClass = computed(() => {
  switch (variant) {
    case 'outline':
      return 'border-[var(--btn-neutral-outline-border)] bg-[var(--btn-neutral-outline-bg)] text-[var(--btn-neutral-outline-fg)] hover:border-[var(--btn-neutral-outline-hover-border)] hover:bg-[var(--btn-neutral-outline-hover-bg)] hover:text-[var(--btn-neutral-outline-hover-fg)]'
    case 'danger':
      return 'border-[var(--btn-danger-border)] bg-[var(--btn-danger-bg)] text-[var(--btn-danger-fg)] hover:border-[var(--btn-danger-hover-bg)] hover:bg-[var(--btn-danger-hover-bg)]'
    case 'nav':
      return 'rounded-full border-[var(--btn-nav-border)] bg-[var(--btn-nav-bg)] text-[var(--btn-nav-fg)] hover:border-[var(--btn-nav-hover-border)] hover:text-[var(--btn-nav-hover-fg)]'
    case 'ghost':
    default:
      return 'border-transparent bg-transparent text-[var(--btn-neutral-ghost-fg)] hover:bg-[var(--btn-neutral-ghost-hover-bg)] hover:text-[var(--btn-neutral-ghost-hover-fg)]'
  }
})

const buttonClass = computed(() =>
  cn(
    'inline-flex items-center justify-center gap-1 rounded-[var(--btn-radius)] border border-transparent leading-none select-none transition-[color,background-color,border-color,opacity] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--btn-focus-ring)] disabled:pointer-events-none disabled:opacity-[var(--btn-disabled-opacity)]',
    sizeClass.value,
    variantClass.value,
  ),
)

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
    v-bind="{ ...attrs, class: undefined }"
    :class="[buttonClass, attrs['class']]"
    :data-variant="variant"
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
