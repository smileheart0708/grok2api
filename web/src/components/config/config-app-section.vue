<script setup lang="ts">
import { computed } from 'vue'
import { Copy, Settings2 } from 'lucide-vue-next'
import ConfigSectionCard from '@/components/config/config-section-card.vue'
import UiIconButton from '@/components/ui/ui-icon-button.vue'
import type { AdminConfigApp } from '@/types/admin-api'

interface Props {
  modelValue: AdminConfigApp
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: AdminConfigApp): void
  (e: 'copy-value', value: string): void
}>()

function patch(next: Partial<AdminConfigApp>): void {
  emit('update:modelValue', {
    ...props.modelValue,
    ...next,
  })
}

const apiKey = computed({
  get: () => props.modelValue.api_key,
  set: (value: string) => {
    patch({ api_key: value })
  },
})

const adminUsername = computed({
  get: () => props.modelValue.admin_username,
  set: (value: string) => {
    patch({ admin_username: value })
  },
})

const appKey = computed({
  get: () => props.modelValue.app_key,
  set: (value: string) => {
    patch({ app_key: value })
  },
})

const appUrl = computed({
  get: () => props.modelValue.app_url,
  set: (value: string) => {
    patch({ app_url: value })
  },
})

const imageFormat = computed({
  get: () => props.modelValue.image_format,
  set: (value: string) => {
    if (value === 'url' || value === 'base64' || value === 'b64_json') {
      patch({ image_format: value })
      return
    }
    patch({ image_format: 'url' })
  },
})
</script>

<template>
  <ConfigSectionCard title="应用设置" description="管理管理员登录、服务地址和媒体输出格式。">
    <template #icon>
      <Settings2 :size="16" aria-hidden="true" />
    </template>

    <div class="config-field">
      <div class="config-field-title">API 密钥</div>
      <p class="config-field-desc">调用 Grok2API 服务所需的 Bearer Token，请妥善保管。</p>
      <div class="config-field-input">
        <div class="config-secret-row">
          <input v-model="apiKey" type="text" class="geist-input" />
          <UiIconButton
            label="复制 API 密钥"
            variant="outline"
            size="md"
            @click="$emit('copy-value', apiKey)"
          >
            <Copy :size="14" aria-hidden="true" />
          </UiIconButton>
        </div>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">后台账号</div>
      <p class="config-field-desc">登录 Grok2API 服务管理后台的用户名。</p>
      <div class="config-field-input">
        <input v-model="adminUsername" type="text" class="geist-input" />
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">后台密码</div>
      <p class="config-field-desc">登录 Grok2API 服务管理后台的密码，请妥善保管。</p>
      <div class="config-field-input">
        <div class="config-secret-row">
          <input v-model="appKey" type="text" class="geist-input" />
          <UiIconButton
            label="复制后台密码"
            variant="outline"
            size="md"
            @click="$emit('copy-value', appKey)"
          >
            <Copy :size="14" aria-hidden="true" />
          </UiIconButton>
        </div>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">应用地址</div>
      <p class="config-field-desc">当前 Grok2API 服务的外部访问 URL。</p>
      <div class="config-field-input">
        <input v-model="appUrl" type="text" class="geist-input" />
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">图片格式</div>
      <p class="config-field-desc">生成的图片格式（url / base64 / b64_json）。</p>
      <div class="config-field-input">
        <select v-model="imageFormat" class="geist-input h-[34px]">
          <option value="url">URL</option>
          <option value="base64">Base64</option>
          <option value="b64_json">b64_json</option>
        </select>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">视频格式</div>
      <p class="config-field-desc">当前仅支持 URL 返回。</p>
      <div class="config-field-input">
        <select class="geist-input h-[34px]" :value="props.modelValue.video_format" disabled>
          <option value="url">URL</option>
        </select>
      </div>
    </div>
  </ConfigSectionCard>
</template>
