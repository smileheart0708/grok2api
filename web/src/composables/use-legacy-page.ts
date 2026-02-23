import { onBeforeUnmount, onMounted } from 'vue'
import { mountLegacyPage, type LegacyPageSetup } from '@/legacy/loader'

export function useLegacyPage(setup: LegacyPageSetup): void {
  let cleanup: (() => void) | null = null

  onMounted(async () => {
    try {
      cleanup = await mountLegacyPage(setup)
    } catch (error) {
      console.error(error)
    }
  })

  onBeforeUnmount(() => {
    cleanup?.()
    cleanup = null
  })
}
