<script setup lang="ts">
import { computed } from 'vue'
import { Bot } from 'lucide-vue-next'
import ConfigSectionCard from '@/components/config/config-section-card.vue'
import type { AdminConfigGrok } from '@/types/admin-api'

interface Props {
  modelValue: AdminConfigGrok
}

const props = defineProps<Props>()

const emit = defineEmits<(e: 'update:modelValue', value: AdminConfigGrok) => void>()

function patch(next: Partial<AdminConfigGrok>): void {
  emit('update:modelValue', {
    ...props.modelValue,
    ...next,
  })
}

function parseTags(value: string): string[] {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseCodes(value: string): number[] {
  const result: number[] = []
  for (const token of value.split(',')) {
    const parsed = Number(token.trim())
    if (!Number.isFinite(parsed)) continue
    result.push(Math.floor(parsed))
  }
  return result
}

const temporary = computed({
  get: () => props.modelValue.temporary,
  set: (value: boolean) => {
    patch({ temporary: value })
  },
})

const stream = computed({
  get: () => props.modelValue.stream,
  set: (value: boolean) => {
    patch({ stream: value })
  },
})

const thinking = computed({
  get: () => props.modelValue.thinking,
  set: (value: boolean) => {
    patch({ thinking: value })
  },
})

const dynamicStatsig = computed({
  get: () => props.modelValue.dynamic_statsig,
  set: (value: boolean) => {
    patch({ dynamic_statsig: value })
  },
})

const videoPosterPreview = computed({
  get: () => props.modelValue.video_poster_preview,
  set: (value: boolean) => {
    patch({ video_poster_preview: value })
  },
})

const baseProxyUrl = computed({
  get: () => props.modelValue.base_proxy_url,
  set: (value: string) => {
    patch({ base_proxy_url: value })
  },
})

const assetProxyUrl = computed({
  get: () => props.modelValue.asset_proxy_url,
  set: (value: string) => {
    patch({ asset_proxy_url: value })
  },
})

const cfClearance = computed({
  get: () => props.modelValue.cf_clearance,
  set: (value: string) => {
    patch({ cf_clearance: value })
  },
})

const filterTagsText = computed({
  get: () => props.modelValue.filter_tags.join('\n'),
  set: (value: string) => {
    patch({ filter_tags: parseTags(value) })
  },
})

const retryStatusText = computed({
  get: () => props.modelValue.retry_status_codes.join(', '),
  set: (value: string) => {
    patch({ retry_status_codes: parseCodes(value) })
  },
})

const imageGenerationMethod = computed({
  get: () => props.modelValue.image_generation_method,
  set: (value: string) => {
    patch({ image_generation_method: value.trim() || 'legacy' })
  },
})

const timeout = computed({
  get: () => props.modelValue.timeout,
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    patch({ timeout: Math.max(1, Math.floor(value)) })
  },
})

const maxRetry = computed({
  get: () => props.modelValue.max_retry,
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    patch({ max_retry: Math.max(0, Math.floor(value)) })
  },
})
</script>

<template>
  <ConfigSectionCard title="Grok 设置" description="控制上游请求策略、超时与输出行为。">
    <template #icon>
      <Bot :size="16" aria-hidden="true" />
    </template>

    <div class="config-field">
      <div class="config-field-title">临时对话</div>
      <p class="config-field-desc">是否启用临时对话模式。</p>
      <div class="config-field-input">
        <label class="config-toggle">
          <input v-model="temporary" type="checkbox" class="config-toggle-input">
          <span class="config-toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">流式响应</div>
      <p class="config-field-desc">是否默认启用流式输出。</p>
      <div class="config-field-input">
        <label class="config-toggle">
          <input v-model="stream" type="checkbox" class="config-toggle-input">
          <span class="config-toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">思维链</div>
      <p class="config-field-desc">是否启用模型思维链输出。</p>
      <div class="config-field-input">
        <label class="config-toggle">
          <input v-model="thinking" type="checkbox" class="config-toggle-input">
          <span class="config-toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">动态指纹</div>
      <p class="config-field-desc">是否启用动态生成 Statsig 值。</p>
      <div class="config-field-input">
        <label class="config-toggle">
          <input v-model="dynamicStatsig" type="checkbox" class="config-toggle-input">
          <span class="config-toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">过滤标签</div>
      <p class="config-field-desc">一行一个，保存时自动转为数组。</p>
      <div class="config-field-input">
        <textarea v-model="filterTagsText" class="geist-input font-mono text-xs" rows="4"></textarea>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">视频海报预览</div>
      <p class="config-field-desc">将视频标签替换为可点击预览图。</p>
      <div class="config-field-input">
        <label class="config-toggle">
          <input v-model="videoPosterPreview" type="checkbox" class="config-toggle-input">
          <span class="config-toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">超时时间（秒）</div>
      <p class="config-field-desc">请求 Grok 服务的超时时间。</p>
      <div class="config-field-input">
        <input v-model.number="timeout" type="number" min="1" class="geist-input">
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">最大重试</div>
      <p class="config-field-desc">请求失败时的最大重试次数。</p>
      <div class="config-field-input">
        <input v-model.number="maxRetry" type="number" min="0" class="geist-input">
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">重试状态码</div>
      <p class="config-field-desc">逗号分隔，例如 401,429,403。</p>
      <div class="config-field-input">
        <input v-model="retryStatusText" type="text" class="geist-input font-mono text-xs">
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">基础代理 URL</div>
      <p class="config-field-desc">代理请求 Grok 官网的基础地址。</p>
      <div class="config-field-input">
        <input v-model="baseProxyUrl" type="text" class="geist-input">
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">资源代理 URL</div>
      <p class="config-field-desc">代理图片/视频等静态资源地址。</p>
      <div class="config-field-input">
        <input v-model="assetProxyUrl" type="text" class="geist-input">
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">CF Clearance</div>
      <p class="config-field-desc">Cloudflare 验证 Cookie。</p>
      <div class="config-field-input">
        <input v-model="cfClearance" type="text" class="geist-input font-mono text-xs">
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">生图调用方式</div>
      <p class="config-field-desc">legacy 稳定，imagine_ws_experimental 更快但实验性。</p>
      <div class="config-field-input">
        <select v-model="imageGenerationMethod" class="geist-input h-[34px]">
          <option value="legacy">旧方法（REST API 轮询）</option>
          <option value="imagine_ws_experimental">新方法（WebSocket 实时推送）</option>
        </select>
      </div>
    </div>
  </ConfigSectionCard>
</template>
