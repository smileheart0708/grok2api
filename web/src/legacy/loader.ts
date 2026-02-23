type LegacyMountFn = () => (() => void) | undefined

type LegacyRegistry = Record<string, LegacyMountFn | undefined>

const scriptPromises = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  const existing = scriptPromises.get(src)
  if (existing) return existing

  const promise = new Promise<void>((resolve, reject) => {
    const found = document.querySelector<HTMLScriptElement>(`script[data-legacy-src="${src}"]`)
    if (found?.dataset['loaded'] === 'true') {
      resolve()
      return
    }

    const script = found ?? document.createElement('script')
    script.src = src
    script.async = false
    script.defer = false
    script.dataset['legacySrc'] = src

    script.onload = () => {
      script.dataset['loaded'] = 'true'
      resolve()
    }
    script.onerror = () => {
      reject(new Error(`Failed to load legacy script: ${src}`))
    }

    if (!found) {
      document.head.appendChild(script)
    }
  })

  scriptPromises.set(src, promise)
  return promise
}

export interface LegacyPageSetup {
  scripts: readonly string[]
  mountName: string
}

export async function mountLegacyPage(setup: LegacyPageSetup): Promise<() => void> {
  for (const src of setup.scripts) {
    await loadScript(src)
  }

  const registry: LegacyRegistry = window.__grok2apiLegacy ?? {}
  const mount = registry[setup.mountName]
  if (typeof mount !== 'function') {
    throw new Error(`Legacy mount "${setup.mountName}" is not available`)
  }

  const cleanup = mount()
  return typeof cleanup === 'function' ? cleanup : () => undefined
}
