<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Save } from 'lucide-vue-next'
import AdminPageShell from '@/components/admin/admin-page-shell.vue'
import ConfigAppSection from '@/components/config/config-app-section.vue'
import ConfigCacheSection from '@/components/config/config-cache-section.vue'
import ConfigExtraSections from '@/components/config/config-extra-sections.vue'
import ConfigGrokSection from '@/components/config/config-grok-section.vue'
import ConfigPerformanceSection from '@/components/config/config-performance-section.vue'
import ConfigTokenSection from '@/components/config/config-token-section.vue'
import UiToastHost from '@/components/ui/ui-toast-host.vue'
import UiButton from '@/components/ui/ui-button.vue'
import { useToast } from '@/composables/use-toast'
import { isRecord } from '@/lib/guards'
import {
  AdminApiRequestError,
  fetchAdminConfig,
  saveAdminConfig,
} from '@/lib/admin-api'
import { logout } from '@/lib/admin-auth'
import type {
  AdminConfigApp,
  AdminConfigCache,
  AdminConfigExtraSections,
  AdminConfigGrok,
  AdminConfigPayload,
  AdminConfigPerformance,
  AdminConfigToken,
} from '@/types/admin-api'
import '@/styles/pages/config-page.css'

const { success, error } = useToast()

const isLoading = ref(true)
const isSaving = ref(false)

function createDefaultPayload(): AdminConfigPayload {
  return {
    app: {
      api_key: '',
      admin_username: 'admin',
      app_key: '',
      app_url: '',
      image_format: 'url',
      video_format: 'url',
    },
    grok: {
      temporary: false,
      stream: true,
      thinking: false,
      dynamic_statsig: true,
      filter_tags: [],
      video_poster_preview: false,
      timeout: 600,
      base_proxy_url: '',
      asset_proxy_url: '',
      cf_clearance: '',
      max_retry: 3,
      retry_status_codes: [401, 429, 403],
      image_generation_method: 'legacy',
    },
    token: {
      auto_refresh: true,
      refresh_interval_hours: 8,
      fail_threshold: 5,
      save_delay_ms: 500,
      reload_interval_sec: 30,
    },
    cache: {
      enable_auto_clean: true,
      limit_mb: 1024,
      keep_base64_cache: false,
    },
    performance: {
      assets_max_concurrent: 25,
      media_max_concurrent: 50,
      usage_max_concurrent: 25,
      assets_delete_batch_size: 10,
      admin_assets_batch_size: 10,
    },
    extras: {},
  }
}

const defaults = createDefaultPayload()
const appConfig = ref<AdminConfigApp>({ ...defaults.app })
const grokConfig = ref<AdminConfigGrok>({
  ...defaults.grok,
  filter_tags: [...defaults.grok.filter_tags],
  retry_status_codes: [...defaults.grok.retry_status_codes],
})
const tokenConfig = ref<AdminConfigToken>({ ...defaults.token })
const cacheConfig = ref<AdminConfigCache>({ ...defaults.cache })
const performanceConfig = ref<AdminConfigPerformance>({ ...defaults.performance })
const extraSections = ref<AdminConfigExtraSections>({})
const extraSectionJson = ref<Record<string, string>>({})
const extraSectionErrors = ref<Record<string, string>>({})

function formatError(errorValue: unknown, fallback: string): string {
  if (errorValue instanceof AdminApiRequestError) return errorValue.message
  if (errorValue instanceof Error && errorValue.message.trim()) {
    return `${fallback}: ${errorValue.message}`
  }
  return fallback
}

async function handleApiFailure(errorValue: unknown, fallback: string): Promise<void> {
  if (errorValue instanceof AdminApiRequestError && errorValue.status === 401) {
    await logout('/admin/config')
    return
  }
  error(formatError(errorValue, fallback))
}

function applyConfig(payload: AdminConfigPayload): void {
  appConfig.value = { ...payload.app }
  grokConfig.value = {
    ...payload.grok,
    filter_tags: [...payload.grok.filter_tags],
    retry_status_codes: [...payload.grok.retry_status_codes],
  }
  tokenConfig.value = { ...payload.token }
  cacheConfig.value = { ...payload.cache }
  performanceConfig.value = { ...payload.performance }

  const nextExtras: AdminConfigExtraSections = {}
  const nextSectionJson: Record<string, string> = {}
  for (const [section, value] of Object.entries(payload.extras)) {
    nextExtras[section] = { ...value }
    nextSectionJson[section] = JSON.stringify(value, null, 2)
  }

  extraSections.value = nextExtras
  extraSectionJson.value = nextSectionJson
  extraSectionErrors.value = {}
}

async function loadConfig(): Promise<void> {
  isLoading.value = true
  try {
    const payload = await fetchAdminConfig()
    applyConfig(payload)
  } catch (errorValue) {
    await handleApiFailure(errorValue, '加载配置失败')
  } finally {
    isLoading.value = false
  }
}

function normalizeTags(value: readonly string[]): string[] {
  return value
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function normalizeRetryCodes(value: readonly number[]): number[] {
  const output: number[] = []
  for (const item of value) {
    if (!Number.isFinite(item)) continue
    output.push(Math.floor(item))
  }
  return output
}

function toNumber(value: number, fallback: number, min: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.floor(value))
}

function parseExtraSections(): AdminConfigExtraSections | null {
  const nextErrors: Record<string, string> = {}
  const nextExtras: AdminConfigExtraSections = {}

  for (const section of Object.keys(extraSections.value)) {
    const source = extraSectionJson.value[section] ?? '{}'
    let parsed: unknown
    try {
      parsed = JSON.parse(source)
    } catch {
      nextErrors[section] = 'JSON 格式无效'
      continue
    }
    if (!isRecord(parsed)) {
      nextErrors[section] = '必须是 JSON 对象'
      continue
    }
    nextExtras[section] = { ...parsed }
  }

  extraSectionErrors.value = nextErrors
  if (Object.keys(nextErrors).length > 0) {
    return null
  }
  return nextExtras
}

function buildPayload(): AdminConfigPayload | null {
  const adminUsername = appConfig.value.admin_username.trim()
  if (!adminUsername) {
    error('后台账号不能为空')
    return null
  }

  const appKey = appConfig.value.app_key.trim()
  if (!appKey) {
    error('后台密码不能为空')
    return null
  }

  const extras = parseExtraSections()
  if (!extras) {
    error('扩展配置存在无效 JSON，请修正后再保存')
    return null
  }

  return {
    app: {
      api_key: appConfig.value.api_key.trim(),
      admin_username: adminUsername,
      app_key: appKey,
      app_url: appConfig.value.app_url.trim(),
      image_format: appConfig.value.image_format,
      video_format: 'url',
    },
    grok: {
      temporary: grokConfig.value.temporary,
      stream: grokConfig.value.stream,
      thinking: grokConfig.value.thinking,
      dynamic_statsig: grokConfig.value.dynamic_statsig,
      filter_tags: normalizeTags(grokConfig.value.filter_tags),
      video_poster_preview: grokConfig.value.video_poster_preview,
      timeout: toNumber(grokConfig.value.timeout, 600, 1),
      base_proxy_url: grokConfig.value.base_proxy_url.trim(),
      asset_proxy_url: grokConfig.value.asset_proxy_url.trim(),
      cf_clearance: grokConfig.value.cf_clearance.trim(),
      max_retry: toNumber(grokConfig.value.max_retry, 3, 0),
      retry_status_codes: normalizeRetryCodes(grokConfig.value.retry_status_codes),
      image_generation_method: grokConfig.value.image_generation_method.trim() || 'legacy',
    },
    token: {
      auto_refresh: tokenConfig.value.auto_refresh,
      refresh_interval_hours: toNumber(tokenConfig.value.refresh_interval_hours, 8, 1),
      fail_threshold: toNumber(tokenConfig.value.fail_threshold, 5, 1),
      save_delay_ms: toNumber(tokenConfig.value.save_delay_ms, 500, 0),
      reload_interval_sec: toNumber(tokenConfig.value.reload_interval_sec, 30, 0),
    },
    cache: {
      enable_auto_clean: cacheConfig.value.enable_auto_clean,
      limit_mb: toNumber(cacheConfig.value.limit_mb, 1024, 1),
      keep_base64_cache: cacheConfig.value.keep_base64_cache,
    },
    performance: {
      assets_max_concurrent: toNumber(performanceConfig.value.assets_max_concurrent, 25, 1),
      media_max_concurrent: toNumber(performanceConfig.value.media_max_concurrent, 50, 1),
      usage_max_concurrent: toNumber(performanceConfig.value.usage_max_concurrent, 25, 1),
      assets_delete_batch_size: toNumber(performanceConfig.value.assets_delete_batch_size, 10, 1),
      admin_assets_batch_size: toNumber(performanceConfig.value.admin_assets_batch_size, 10, 1),
    },
    extras,
  }
}

async function saveConfigForm(): Promise<void> {
  if (isLoading.value || isSaving.value) return

  const payload = buildPayload()
  if (!payload) return

  isSaving.value = true
  try {
    const message = await saveAdminConfig(payload)
    success(message || '配置已保存')
    await loadConfig()
  } catch (errorValue) {
    await handleApiFailure(errorValue, '保存配置失败')
  } finally {
    isSaving.value = false
  }
}

function updateSectionJson(payload: { section: string; value: string }): void {
  extraSectionJson.value = {
    ...extraSectionJson.value,
    [payload.section]: payload.value,
  }
  if (!extraSectionErrors.value[payload.section]) return
  const nextErrors: Record<string, string> = {}
  for (const [key, value] of Object.entries(extraSectionErrors.value)) {
    if (key === payload.section) continue
    nextErrors[key] = value
  }
  extraSectionErrors.value = nextErrors
}

async function copyValue(text: string): Promise<void> {
  const value = text.trim()
  if (!value) {
    error('内容为空，无法复制')
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    success('已复制')
  } catch {
    error('复制失败，请检查浏览器权限')
  }
}

onMounted(() => {
  void loadConfig()
})
</script>

<template>
  <UiToastHost />

  <AdminPageShell max-width="1120px">
    <div class="space-y-6">
      <div class="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">配置管理</h2>
          <p class="text-[var(--accents-4)] mt-1 text-sm">管理 API 密钥及系统参数设置。</p>
        </div>
        <UiButton
          variant="solid"
          tone="brand"
          size="sm"
          class="gap-2 config-save-btn"
          :disabled="isLoading || isSaving"
          @click="saveConfigForm"
        >
          <Save :size="14" aria-hidden="true" />
          {{ isSaving ? '保存中...' : '保存' }}
        </UiButton>
      </div>

      <div class="h-px bg-[var(--border)] my-6"></div>

      <div v-if="isLoading" class="text-center py-12 text-[var(--accents-4)]">加载中...</div>
      <div v-else id="config-container" class="space-y-8">
        <ConfigAppSection v-model="appConfig" @copy-value="copyValue" />
        <ConfigGrokSection v-model="grokConfig" />
        <ConfigTokenSection v-model="tokenConfig" />
        <ConfigCacheSection v-model="cacheConfig" />
        <ConfigPerformanceSection v-model="performanceConfig" />
        <ConfigExtraSections
          :sections="extraSections"
          :section-json="extraSectionJson"
          :errors="extraSectionErrors"
          @update:section-json="updateSectionJson"
        />
      </div>
    </div>
  </AdminPageShell>
</template>
