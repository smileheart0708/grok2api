<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import UiButton from '@/components/ui/ui-button.vue'
import {
  DEFAULT_REDIRECT_PATH,
  fetchAdminSession,
  loginAdmin,
  sanitizeRedirectPath,
} from '@/lib/admin-auth'

const router = useRouter()
const username = ref('')
const password = ref('')
const isSubmitting = ref(false)
const isRedirecting = ref(false)
const errorMessage = ref('')

const redirectTarget = computed(() => {
  if (typeof window === 'undefined') return DEFAULT_REDIRECT_PATH
  const params = new URLSearchParams(window.location.search)
  return sanitizeRedirectPath(params.get('redirect'))
})

function isLoginPath(target: string): boolean {
  try {
    const parsed = new URL(target, 'https://grok2api.local')
    return parsed.pathname === '/login'
  } catch {
    return false
  }
}

function isCurrentLocation(target: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const current = new URL(window.location.href)
    const next = new URL(target, current.origin)
    return (
      current.pathname === next.pathname &&
      current.search === next.search &&
      current.hash === next.hash
    )
  } catch {
    return false
  }
}

function resolveRedirectTarget(): string {
  const target = redirectTarget.value
  if (isLoginPath(target)) return DEFAULT_REDIRECT_PATH
  if (isCurrentLocation(target)) return DEFAULT_REDIRECT_PATH
  return target
}

function jumpToAdmin(): void {
  if (isRedirecting.value) return

  isRedirecting.value = true
  const target = resolveRedirectTarget()
  void router.replace(target).catch(() => {
    if (typeof window !== 'undefined') window.location.assign(target)
  })
}

async function onSubmit(): Promise<void> {
  const normalizedUsername = username.value.trim()
  const normalizedPassword = password.value

  if (!normalizedUsername || !normalizedPassword) {
    errorMessage.value = '请输入用户名和密码'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  const result = await loginAdmin({ username: normalizedUsername, password: normalizedPassword })

  if (!result.ok) {
    isSubmitting.value = false
    errorMessage.value = result.message || '登录失败，请稍后重试'
    return
  }

  const authed = await fetchAdminSession()
  isSubmitting.value = false

  if (!authed) {
    errorMessage.value = '登录成功，但会话未生效。请检查 Cookie、反向代理或浏览器隐私设置。'
    return
  }

  jumpToAdmin()
}

onMounted(async () => {
  const authed = await fetchAdminSession()
  if (authed) {
    jumpToAdmin()
  }
})
</script>

<template>
  <main
    class="grid min-h-dvh place-items-center p-5 [background:radial-gradient(circle_at_10%_10%,rgb(14_116_144_/_20%),transparent_45%),radial-gradient(circle_at_100%_100%,rgb(14_165_233_/_18%),transparent_42%),linear-gradient(180deg,#f4f7fb_0%,#eef3f9_100%)]"
  >
    <section
      class="w-full max-w-[460px] rounded-2xl border border-[#d5e3f3] bg-white/95 p-6 shadow-[0_28px_58px_rgb(15_23_42_/_12%)]"
    >
      <header class="grid gap-2.5">
        <p
          class="m-0 w-fit rounded-full border border-[#bfdbfe] bg-[#dbeafe] px-2.5 py-1 text-xs font-semibold text-[#1e3a8a]"
        >
          Admin Access
        </p>
        <h1 class="m-0 text-[clamp(24px,5vw,30px)] tracking-[-0.02em] text-[#0f172a]">
          Grok2API 管理登录
        </h1>
        <p class="m-0 text-sm leading-[1.6] text-[#334155]">
          使用管理员账号登录后台，系统将以 HttpOnly Cookie 保持会话。
        </p>
      </header>

      <form class="mt-4 grid gap-3" @submit.prevent="onSubmit">
        <label class="grid gap-1.5">
          <span class="text-[13px] text-[#334155]">用户名</span>
          <input
            v-model="username"
            class="geist-input h-[38px]"
            type="text"
            autocomplete="username"
            :disabled="isSubmitting"
          />
        </label>

        <label class="grid gap-1.5">
          <span class="text-[13px] text-[#334155]">密码</span>
          <input
            v-model="password"
            class="geist-input h-[38px]"
            type="password"
            autocomplete="current-password"
            :disabled="isSubmitting"
          />
        </label>

        <p v-if="errorMessage" class="m-0 text-[13px] text-[#b91c1c]">{{ errorMessage }}</p>

        <UiButton
          class="h-[38px] w-full"
          type="submit"
          variant="solid"
          size="md"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? '登录中...' : '登录' }}
        </UiButton>
      </form>

      <footer class="mt-3.5">
        <a class="text-[13px] text-[#0369a1] no-underline hover:underline" href="/chat"
          >前往公开聊天</a
        >
      </footer>
    </section>
  </main>
</template>
