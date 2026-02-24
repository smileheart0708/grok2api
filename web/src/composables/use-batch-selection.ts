import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

interface BatchSelectionResult<T> {
  selectedKeys: ComputedRef<string[]>
  selectedCount: ComputedRef<number>
  selectedItems: ComputedRef<T[]>
  isSelected: (key: string) => boolean
  setKeySelected: (key: string, selected: boolean) => void
  toggleKey: (key: string) => void
  setMany: (keys: readonly string[], selected: boolean) => void
  clear: () => void
}

export function useBatchSelection<T>(
  items: Ref<T[]>,
  resolveKey: (item: T) => string,
): BatchSelectionResult<T> {
  const selectedKeys = ref<string[]>([])

  const selectedKeySet = computed(() => new Set(selectedKeys.value))

  watch(
    items,
    (nextItems) => {
      if (selectedKeys.value.length === 0) return
      const validKeys = new Set(nextItems.map((item) => resolveKey(item)))
      selectedKeys.value = selectedKeys.value.filter((key) => validKeys.has(key))
    },
    { deep: false },
  )

  function isSelected(key: string): boolean {
    return selectedKeySet.value.has(key)
  }

  function setKeySelected(key: string, selected: boolean): void {
    const exists = selectedKeySet.value.has(key)
    if (selected && !exists) {
      selectedKeys.value = [...selectedKeys.value, key]
      return
    }
    if (!selected && exists) {
      selectedKeys.value = selectedKeys.value.filter((current) => current !== key)
    }
  }

  function toggleKey(key: string): void {
    setKeySelected(key, !isSelected(key))
  }

  function setMany(keys: readonly string[], selected: boolean): void {
    if (keys.length === 0) return

    if (selected) {
      const next = new Set(selectedKeys.value)
      for (const key of keys) {
        next.add(key)
      }
      selectedKeys.value = [...next]
      return
    }

    const toRemove = new Set(keys)
    selectedKeys.value = selectedKeys.value.filter((key) => !toRemove.has(key))
  }

  function clear(): void {
    selectedKeys.value = []
  }

  const selectedItems = computed<T[]>(() => {
    const set = selectedKeySet.value
    return items.value.filter((item) => set.has(resolveKey(item)))
  })

  return {
    selectedKeys: computed(() => selectedKeys.value),
    selectedCount: computed(() => selectedKeys.value.length),
    selectedItems,
    isSelected,
    setKeySelected,
    toggleKey,
    setMany,
    clear,
  }
}
