<script setup lang="ts">
import { computed, ref, useAttrs, watchEffect } from 'vue'
import { cn } from '@/lib/cn'

defineOptions({
  inheritAttrs: false,
})

interface UiCheckboxProps {
  modelValue: boolean
  disabled?: boolean
  indeterminate?: boolean
}

const props = withDefaults(defineProps<UiCheckboxProps>(), {
  disabled: false,
  indeterminate: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: boolean, event: Event): void
}>()

const attrs = useAttrs()
const inputRef = ref<HTMLInputElement | null>(null)

const checkedValue = computed(() => props.modelValue)
const checkboxClass = computed(() =>
  cn(
    'size-3 shrink-0 cursor-pointer rounded-sm border border-accent-3 bg-surface accent-black transition-opacity disabled:cursor-not-allowed disabled:opacity-60',
  ),
)

watchEffect(() => {
  if (!inputRef.value) return
  inputRef.value.indeterminate = props.indeterminate
})

function onChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  emit('update:modelValue', target.checked)
  emit('change', target.checked, event)
}
</script>

<template>
  <input
    ref="inputRef"
    v-bind="{ ...attrs, class: undefined }"
    type="checkbox"
    :class="[checkboxClass, attrs['class']]"
    :checked="checkedValue"
    :disabled="props.disabled"
    @change="onChange"
  />
</template>
