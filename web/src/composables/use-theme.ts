import { computed, readonly, ref } from 'vue'

export type ThemePreference = 'auto' | 'light' | 'dark'

type ResolvedTheme = Exclude<ThemePreference, 'auto'>

const THEME_STORAGE_KEY = 'grok2api_theme_preference'
const THEME_ORDER: ThemePreference[] = ['auto', 'light', 'dark']
const SYSTEM_DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

const themePreferenceState = ref<ThemePreference>('auto')
const resolvedThemeState = ref<ResolvedTheme>('light')

let isThemeInitialized = false
let systemMediaQuery: MediaQueryList | null = null
let systemMediaQueryListener: ((event: MediaQueryListEvent) => void) | null = null

function isThemePreference(value: string): value is ThemePreference {
  return value === 'auto' || value === 'light' || value === 'dark'
}

function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'auto'

  try {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (!storedValue) return 'auto'
    return isThemePreference(storedValue) ? storedValue : 'auto'
  } catch {
    return 'auto'
  }
}

function persistThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // 忽略存储异常，主题仍可在当前会话生效
  }
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference

  if (typeof window === 'undefined') return 'light'

  const mediaQuery = window.matchMedia(SYSTEM_DARK_MEDIA_QUERY)
  return mediaQuery.matches ? 'dark' : 'light'
}

function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset['theme'] = theme
}

function syncResolvedTheme(): void {
  const resolvedTheme = resolveTheme(themePreferenceState.value)
  resolvedThemeState.value = resolvedTheme
  applyResolvedTheme(resolvedTheme)
}

function ensureSystemThemeListener(): void {
  if (typeof window === 'undefined') return
  if (systemMediaQueryListener) return

  systemMediaQuery = window.matchMedia(SYSTEM_DARK_MEDIA_QUERY)
  systemMediaQueryListener = () => {
    if (themePreferenceState.value !== 'auto') return
    syncResolvedTheme()
  }

  systemMediaQuery.addEventListener('change', systemMediaQueryListener)
}

export function initTheme(): void {
  if (!isThemeInitialized) {
    ensureSystemThemeListener()
    isThemeInitialized = true
  }

  themePreferenceState.value = readStoredThemePreference()
  syncResolvedTheme()
}

export function setThemePreference(preference: ThemePreference): void {
  themePreferenceState.value = preference
  persistThemePreference(preference)
  syncResolvedTheme()
}

export function cycleTheme(): ThemePreference {
  const currentIndex = THEME_ORDER.indexOf(themePreferenceState.value)
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % THEME_ORDER.length
  const nextPreference = THEME_ORDER[nextIndex] ?? 'auto'
  setThemePreference(nextPreference)
  return nextPreference
}

export function useTheme() {
  return {
    themePreference: readonly(themePreferenceState),
    resolvedTheme: computed(() => resolvedThemeState.value),
    setThemePreference,
    cycleTheme,
  }
}
