<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '@/lib/cn'

defineOptions({
  inheritAttrs: false,
})

type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'danger' | 'link' | 'nav' | 'tab'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'
type ButtonTone = 'brand' | 'neutral'

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
  tone = 'brand',
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

const sizeClass = computed(() => {
  if (variant === 'link') return 'px-0 py-0 text-xs font-medium'
  switch (size) {
    case 'xs':
      return 'min-h-7 px-2.5 text-xs'
    case 'sm':
      return 'min-h-8 px-3 text-sm'
    case 'md':
      return 'min-h-9 px-3.5 text-sm'
    case 'lg':
      return 'min-h-10 px-4 text-[0.9375rem]'
    default:
      return 'min-h-8 px-3 text-sm'
  }
})

const variantClass = computed(() => {
  switch (variant) {
    case 'solid':
      return tone === 'neutral'
        ? 'border-[var(--btn-neutral-solid-border)] bg-[var(--btn-neutral-solid-bg)] text-[var(--btn-neutral-solid-fg)] hover:border-[var(--btn-neutral-solid-hover-bg)] hover:bg-[var(--btn-neutral-solid-hover-bg)]'
        : 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-contrast)] hover:opacity-85'
    case 'outline':
      return tone === 'brand'
        ? 'border-[var(--primary)] bg-[var(--surface)] text-[var(--primary)] hover:bg-[var(--surface-muted)]'
        : 'border-[var(--btn-neutral-outline-border)] bg-[var(--btn-neutral-outline-bg)] text-[var(--btn-neutral-outline-fg)] hover:border-[var(--btn-neutral-outline-hover-border)] hover:bg-[var(--btn-neutral-outline-hover-bg)] hover:text-[var(--btn-neutral-outline-hover-fg)]'
    case 'ghost':
      return 'border-transparent bg-transparent text-[var(--btn-neutral-ghost-fg)] hover:bg-[var(--btn-neutral-ghost-hover-bg)] hover:text-[var(--btn-neutral-ghost-hover-fg)]'
    case 'danger':
      return 'border-[var(--btn-danger-border)] bg-[var(--btn-danger-bg)] text-[var(--btn-danger-fg)] hover:border-[var(--btn-danger-hover-bg)] hover:bg-[var(--btn-danger-hover-bg)]'
    case 'link':
      return 'min-h-auto border-0 bg-transparent text-[var(--btn-link-fg)] underline hover:text-[var(--btn-link-hover-fg)]'
    case 'nav':
      return 'min-h-6 rounded-full border-[var(--btn-nav-border)] bg-[var(--btn-nav-bg)] px-2 text-[11px] font-medium text-[var(--btn-nav-fg)] hover:border-[var(--btn-nav-hover-border)] hover:text-[var(--btn-nav-hover-fg)]'
    case 'tab':
      return 'min-h-[30px] rounded-full border-[var(--btn-tab-border)] bg-[var(--btn-tab-bg)] px-3 text-[13px] font-medium text-[var(--btn-tab-fg)] hover:border-[var(--btn-tab-hover-border)] hover:text-[var(--btn-tab-hover-fg)] data-[pressed=true]:border-[var(--btn-neutral-solid-border)] data-[pressed=true]:bg-[var(--btn-neutral-solid-bg)] data-[pressed=true]:text-[var(--btn-neutral-solid-fg)]'
    default:
      return ''
  }
})

const buttonClass = computed(() => {
  return cn(
    'inline-flex items-center justify-center gap-1.5 rounded-[var(--btn-radius)] border border-transparent font-semibold leading-none whitespace-nowrap select-none transition-[color,background-color,border-color,opacity] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--btn-focus-ring)] disabled:pointer-events-none disabled:opacity-[var(--btn-disabled-opacity)]',
    sizeClass.value,
    variantClass.value,
    block ? 'w-full' : '',
  )
})

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
