import { onBeforeUnmount } from 'vue'
import { useToast } from '@/composables/use-toast'
import { fetchAdminSession, logout as logoutAdmin } from '@/lib/admin-auth'

const ADMIN_REQUESTED_WITH = 'grok2api-admin'

interface LegacyCommonBridgeOptions {
  enableAdminAuth?: boolean
  logoutRedirectPath?: string
}

interface LegacyBridgeSnapshot {
  showToast: Window['showToast'] | undefined
  buildAuthHeaders: Window['buildAuthHeaders'] | undefined
  ensureApiKey: Window['ensureApiKey'] | undefined
  logout: Window['logout'] | undefined
}

function normalizeToastMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message.trim()
  }
  if (typeof message === 'number' || typeof message === 'boolean' || typeof message === 'bigint') {
    return String(message).trim()
  }
  return ''
}

function normalizeToastType(type: unknown): string {
  if (typeof type !== 'string') return 'success'
  const normalized = type.trim().toLowerCase()
  return normalized || 'success'
}

export function useLegacyCommonBridge(options: LegacyCommonBridgeOptions = {}): void {
  if (typeof window === 'undefined') return

  const { success, error, info } = useToast()
  const snapshot: LegacyBridgeSnapshot = {
    showToast: window.showToast,
    buildAuthHeaders: window.buildAuthHeaders,
    ensureApiKey: window.ensureApiKey,
    logout: window.logout,
  }

  const logoutRedirectPath = options.logoutRedirectPath

  window.showToast = (rawMessage: unknown, rawType: unknown = 'success') => {
    const message = normalizeToastMessage(rawMessage)
    if (!message) return

    const type = normalizeToastType(rawType)
    if (type === 'error') {
      error(message)
      return
    }
    if (type === 'warning' || type === 'info') {
      info(message)
      return
    }
    success(message)
  }

  if (options.enableAdminAuth) {
    window.buildAuthHeaders = () => ({ 'X-Requested-With': ADMIN_REQUESTED_WITH })
    window.ensureApiKey = async () => {
      const authed = await fetchAdminSession()
      if (authed) return 'cookie-session'

      void logoutAdmin(logoutRedirectPath)
      return null
    }
    window.logout = () => {
      void logoutAdmin(logoutRedirectPath)
    }
  }

  onBeforeUnmount(() => {
    if (snapshot.showToast === undefined) delete window.showToast
    else window.showToast = snapshot.showToast

    if (snapshot.buildAuthHeaders === undefined) delete window.buildAuthHeaders
    else window.buildAuthHeaders = snapshot.buildAuthHeaders

    if (snapshot.ensureApiKey === undefined) delete window.ensureApiKey
    else window.ensureApiKey = snapshot.ensureApiKey

    if (snapshot.logout === undefined) delete window.logout
    else window.logout = snapshot.logout
  })
}
