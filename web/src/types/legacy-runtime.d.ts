type LegacyMountFn = () => (() => void) | undefined

interface Window {
  __grok2apiLegacy?: Record<string, LegacyMountFn | undefined>
  Chart?: unknown
  showToast?: (message: unknown, type?: unknown) => void
  buildAuthHeaders?: (apiKey?: string) => Record<string, string>
  ensureApiKey?: () => Promise<string | null>
  logout?: () => void
}
