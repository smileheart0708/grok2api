<script setup lang="ts">
import { computed } from 'vue'
import { DatabaseBackup } from 'lucide-vue-next'
import ConfigSectionCard from '@/components/config/config-section-card.vue'
import type { AdminConfigCache } from '@/types/admin-api'

interface Props {
  modelValue: AdminConfigCache
}

const props = defineProps<Props>()

const emit = defineEmits<(e: 'update:modelValue', value: AdminConfigCache) => void>()

function patch(next: Partial<AdminConfigCache>): void {
  emit('update:modelValue', {
    ...props.modelValue,
    ...next,
  })
}

const enableAutoClean = computed({
  get: () => props.modelValue.enable_auto_clean,
  set: (value: boolean) => {
    patch({ enable_auto_clean: value })
  },
})

const limitMb = computed({
  get: () => props.modelValue.limit_mb,
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    patch({ limit_mb: Math.max(1, Math.floor(value)) })
  },
})

const keepBase64Cache = computed({
  get: () => props.modelValue.keep_base64_cache,
  set: (value: boolean) => {
    patch({ keep_base64_cache: value })
  },
})
</script>

<template>
  <ConfigSectionCard title="缓存设置" description="控制缓存清理阈值和 Base64 返回时的缓存策略。">
    <template #icon>
      <DatabaseBackup :size="16" aria-hidden="true" />
    </template>

    <div class="config-field">
      <div class="config-field-title">自动清理</div>
      <p class="config-field-desc">开启后按缓存上限自动回收。</p>
      <div class="config-field-input">
        <label class="config-toggle">
          <input v-model="enableAutoClean" type="checkbox" class="config-toggle-input" />
          <span class="config-toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">清理阈值（MB）</div>
      <p class="config-field-desc">超过阈值后触发缓存清理。</p>
      <div class="config-field-input">
        <input v-model.number="limitMb" type="number" min="1" class="geist-input" />
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">保留 Base64 缓存</div>
      <p class="config-field-desc">启用后会保留 Base64 返回场景的本地媒体缓存。</p>
      <div class="config-field-input">
        <label class="config-toggle">
          <input v-model="keepBase64Cache" type="checkbox" class="config-toggle-input" />
          <span class="config-toggle-slider"></span>
        </label>
      </div>
    </div>
  </ConfigSectionCard>
</template>
