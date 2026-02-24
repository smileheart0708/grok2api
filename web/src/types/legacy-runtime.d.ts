type LegacyMountFn = () => (() => void) | undefined

interface Window {
  __grok2apiLegacy?: Record<string, LegacyMountFn | undefined>
  Chart?: unknown
  showToast?: (message: unknown, type?: unknown) => void
  buildAuthHeaders?: (apiKey?: string) => Record<string, string>
  ensureApiKey?: () => Promise<string | null>
  logout?: () => void
  saveApiKey?: () => void
  clearApiKey?: () => void
  switchTab?: (tab: 'chat' | 'image' | 'video') => void
  pickChatImage?: () => void
  sendChat?: () => Promise<void> | void
  generateImage?: () => Promise<void> | void
  startImageContinuous?: () => Promise<void> | void
  stopImageContinuous?: () => void
  clearImageWaterfall?: () => void
  pickVideoImage?: () => void
  generateVideo?: () => Promise<void> | void
}
