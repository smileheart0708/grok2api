<script setup lang="ts">
import { computed } from 'vue'
import { Gauge } from 'lucide-vue-next'
import ConfigSectionCard from '@/components/config/config-section-card.vue'
import type { AdminConfigPerformance } from '@/types/admin-api'

interface Props {
  modelValue: AdminConfigPerformance
}

const props = defineProps<Props>()

const emit = defineEmits<(e: 'update:modelValue', value: AdminConfigPerformance) => void>()

function patch(next: Partial<AdminConfigPerformance>): void {
  emit('update:modelValue', {
    ...props.modelValue,
    ...next,
  })
}

function toPositiveInt(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Math.max(1, Math.floor(value))
}

const assetsMaxConcurrent = computed({
  get: () => props.modelValue.assets_max_concurrent,
  set: (value: number) => {
    const parsed = toPositiveInt(value)
    if (parsed === null) return
    patch({ assets_max_concurrent: parsed })
  },
})

const mediaMaxConcurrent = computed({
  get: () => props.modelValue.media_max_concurrent,
  set: (value: number) => {
    const parsed = toPositiveInt(value)
    if (parsed === null) return
    patch({ media_max_concurrent: parsed })
  },
})

const usageMaxConcurrent = computed({
  get: () => props.modelValue.usage_max_concurrent,
  set: (value: number) => {
    const parsed = toPositiveInt(value)
    if (parsed === null) return
    patch({ usage_max_concurrent: parsed })
  },
})

const assetsDeleteBatchSize = computed({
  get: () => props.modelValue.assets_delete_batch_size,
  set: (value: number) => {
    const parsed = toPositiveInt(value)
    if (parsed === null) return
    patch({ assets_delete_batch_size: parsed })
  },
})

const adminAssetsBatchSize = computed({
  get: () => props.modelValue.admin_assets_batch_size,
  set: (value: number) => {
    const parsed = toPositiveInt(value)
    if (parsed === null) return
    patch({ admin_assets_batch_size: parsed })
  },
})
</script>

<template>
  <ConfigSectionCard title="并发性能" description="调整资源处理与统计任务的并发上限。">
    <template #icon>
      <Gauge :size="16" aria-hidden="true" />
    </template>

    <div class="config-field">
      <div class="config-field-title">资产并发上限</div>
      <p class="config-field-desc">资源上传/下载/列表并发上限，推荐 25。</p>
      <div class="config-field-input">
        <input v-model.number="assetsMaxConcurrent" type="number" min="1" class="geist-input" />
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">媒体并发上限</div>
      <p class="config-field-desc">视频/媒体生成请求并发上限，推荐 50。</p>
      <div class="config-field-input">
        <input v-model.number="mediaMaxConcurrent" type="number" min="1" class="geist-input" />
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">用量并发上限</div>
      <p class="config-field-desc">用量查询请求并发上限，推荐 25。</p>
      <div class="config-field-input">
        <input v-model.number="usageMaxConcurrent" type="number" min="1" class="geist-input" />
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">资产清理批量</div>
      <p class="config-field-desc">在线资产删除单批并发数量，推荐 10。</p>
      <div class="config-field-input">
        <input v-model.number="assetsDeleteBatchSize" type="number" min="1" class="geist-input" />
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">管理端批量</div>
      <p class="config-field-desc">管理端在线资产统计/清理批量并发数量，推荐 10。</p>
      <div class="config-field-input">
        <input v-model.number="adminAssetsBatchSize" type="number" min="1" class="geist-input" />
      </div>
    </div>
  </ConfigSectionCard>
</template>
