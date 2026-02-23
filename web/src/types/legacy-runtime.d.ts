type LegacyMountFn = () => (() => void) | undefined

interface Window {
  __grok2apiLegacy?: Record<string, LegacyMountFn | undefined>
  Chart?: unknown
}
