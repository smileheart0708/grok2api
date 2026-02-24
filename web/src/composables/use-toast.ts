import { readonly, ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastOptions {
  durationMs?: number
}

const toastsState = ref<ToastItem[]>([])
const toastTimers = new Map<number, number>()
let nextToastId = 1

function clearToastTimer(id: number): void {
  const timer = toastTimers.get(id)
  if (timer === undefined) return
  window.clearTimeout(timer)
  toastTimers.delete(id)
}

function removeToast(id: number): void {
  clearToastTimer(id)
  toastsState.value = toastsState.value.filter((item) => item.id !== id)
}

function pushToast(message: string, type: ToastType, options: ToastOptions = {}): number {
  const normalizedMessage = message.trim()
  if (!normalizedMessage) return -1

  const id = nextToastId++
  const durationMs = options.durationMs ?? 3000
  toastsState.value = [...toastsState.value, { id, type, message: normalizedMessage }]

  if (durationMs > 0) {
    const timer = window.setTimeout(() => {
      removeToast(id)
    }, durationMs)
    toastTimers.set(id, timer)
  }

  return id
}

function clearToasts(): void {
  for (const id of toastTimers.keys()) {
    clearToastTimer(id)
  }
  toastsState.value = []
}

export function useToast() {
  return {
    toasts: readonly(toastsState),
    pushToast,
    removeToast,
    clearToasts,
    success: (message: string, options?: ToastOptions) => pushToast(message, 'success', options),
    error: (message: string, options?: ToastOptions) => pushToast(message, 'error', options),
    info: (message: string, options?: ToastOptions) => pushToast(message, 'info', options),
  }
}

