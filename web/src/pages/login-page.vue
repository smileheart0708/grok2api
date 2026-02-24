<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import UiButton from '@/components/ui/ui-button.vue'
import { DEFAULT_REDIRECT_PATH, fetchAdminSession, loginAdmin, sanitizeRedirectPath } from '@/lib/admin-auth'

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
    return current.pathname === next.pathname && current.search === next.search && current.hash === next.hash
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
  <main class="login-page">
    <section class="login-page__panel">
      <header class="login-page__header">
        <p class="login-page__badge">Admin Access</p>
        <h1 class="login-page__title">Grok2API 管理登录</h1>
        <p class="login-page__subtitle">使用管理员账号登录后台，系统将以 HttpOnly Cookie 保持会话。</p>
      </header>

      <form class="login-page__form" @submit.prevent="onSubmit">
        <label class="login-page__field">
          <span class="login-page__label">用户名</span>
          <input
            v-model="username"
            class="geist-input login-page__input"
            type="text"
            autocomplete="username"
            :disabled="isSubmitting"
          >
        </label>

        <label class="login-page__field">
          <span class="login-page__label">密码</span>
          <input
            v-model="password"
            class="geist-input login-page__input"
            type="password"
            autocomplete="current-password"
            :disabled="isSubmitting"
          >
        </label>

        <p v-if="errorMessage" class="login-page__error">{{ errorMessage }}</p>

        <UiButton class="login-page__submit" type="submit" variant="solid" size="md" :disabled="isSubmitting">
          {{ isSubmitting ? '登录中...' : '登录' }}
        </UiButton>
      </form>

      <footer class="login-page__footer">
        <a class="login-page__legacy" href="/chat">前往公开聊天</a>
      </footer>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 20px;
  background:
    radial-gradient(circle at 10% 10%, rgb(14 116 144 / 20%), transparent 45%),
    radial-gradient(circle at 100% 100%, rgb(14 165 233 / 18%), transparent 42%),
    linear-gradient(180deg, #f4f7fb 0%, #eef3f9 100%);
}

.login-page__panel {
  width: min(460px, 100%);
  border: 1px solid #d5e3f3;
  border-radius: 16px;
  background: rgb(255 255 255 / 95%);
  box-shadow: 0 28px 58px rgb(15 23 42 / 12%);
  padding: 24px;
}

.login-page__header {
  display: grid;
  gap: 10px;
}

.login-page__badge {
  margin: 0;
  width: fit-content;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  background: #dbeafe;
  color: #1e3a8a;
  border: 1px solid #bfdbfe;
}

.login-page__title {
  margin: 0;
  font-size: clamp(24px, 5vw, 30px);
  letter-spacing: -0.02em;
  color: #0f172a;
}

.login-page__subtitle {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #334155;
}

.login-page__form {
  margin-top: 16px;
  display: grid;
  gap: 12px;
}

.login-page__field {
  display: grid;
  gap: 6px;
}

.login-page__label {
  font-size: 13px;
  color: #334155;
}

.login-page__input {
  height: 38px;
}

.login-page__submit {
  width: 100%;
  height: 38px;
}

.login-page__error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}

.login-page__footer {
  margin-top: 14px;
}

.login-page__legacy {
  color: #0369a1;
  font-size: 13px;
  text-decoration: none;
}

.login-page__legacy:hover {
  text-decoration: underline;
}
</style>
