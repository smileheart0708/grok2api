import { ref } from 'vue'

interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

const DEFAULT_TITLE = '请确认'
const DEFAULT_CONFIRM_TEXT = '确定'
const DEFAULT_CANCEL_TEXT = '取消'

export function useConfirm() {
  const isOpen = ref(false)
  const title = ref(DEFAULT_TITLE)
  const message = ref('')
  const confirmText = ref(DEFAULT_CONFIRM_TEXT)
  const cancelText = ref(DEFAULT_CANCEL_TEXT)
  const danger = ref(false)
  let resolver: ((value: boolean) => void) | null = null

  function resetState(): void {
    title.value = DEFAULT_TITLE
    message.value = ''
    confirmText.value = DEFAULT_CONFIRM_TEXT
    cancelText.value = DEFAULT_CANCEL_TEXT
    danger.value = false
  }

  function closeWithResult(value: boolean): void {
    isOpen.value = false
    if (resolver) {
      resolver(value)
      resolver = null
    }
    resetState()
  }

  function requestConfirm(nextMessage: string, options: ConfirmOptions = {}): Promise<boolean> {
    if (resolver) {
      resolver(false)
      resolver = null
    }

    title.value = options.title ?? DEFAULT_TITLE
    message.value = nextMessage.trim()
    confirmText.value = options.confirmText ?? DEFAULT_CONFIRM_TEXT
    cancelText.value = options.cancelText ?? DEFAULT_CANCEL_TEXT
    danger.value = options.danger ?? false
    isOpen.value = true

    return new Promise<boolean>((resolve) => {
      resolver = resolve
    })
  }

  function confirm(): void {
    closeWithResult(true)
  }

  function cancel(): void {
    closeWithResult(false)
  }

  return {
    isOpen,
    title,
    message,
    confirmText,
    cancelText,
    danger,
    requestConfirm,
    confirm,
    cancel,
  }
}

