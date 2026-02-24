<script setup lang="ts">
import { computed } from 'vue'
import { KeySquare } from 'lucide-vue-next'
import ConfigSectionCard from '@/components/config/config-section-card.vue'
import type { AdminConfigToken } from '@/types/admin-api'

interface Props {
  modelValue: AdminConfigToken
}

const props = defineProps<Props>()

const emit = defineEmits<(e: 'update:modelValue', value: AdminConfigToken) => void>()

function patch(next: Partial<AdminConfigToken>): void {
  emit('update:modelValue', {
    ...props.modelValue,
    ...next,
  })
}

const autoRefresh = computed({
  get: () => props.modelValue.auto_refresh,
  set: (value: boolean) => {
    patch({ auto_refresh: value })
  },
})

const refreshIntervalHours = computed({
  get: () => props.modelValue.refresh_interval_hours,
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    patch({ refresh_interval_hours: Math.max(1, Math.floor(value)) })
  },
})

const failThreshold = computed({
  get: () => props.modelValue.fail_threshold,
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    patch({ fail_threshold: Math.max(1, Math.floor(value)) })
  },
})

const saveDelayMs = computed({
  get: () => props.modelValue.save_delay_ms,
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    patch({ save_delay_ms: Math.max(0, Math.floor(value)) })
  },
})

const reloadIntervalSec = computed({
  get: () => props.modelValue.reload_interval_sec,
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    patch({ reload_interval_sec: Math.max(0, Math.floor(value)) })
  },
})
</script>

<template>
  <ConfigSectionCard title="Token 池设置" description="控制 Token 刷新、失败阈值与多 worker 一致性策略。">
    <template #icon>
      <KeySquare :size="16" aria-hidden="true" />
    </template>

    <div class="config-field">
      <div class="config-field-title">自动刷新</div>
      <p class="config-field-desc">是否开启 Token 自动刷新机制。</p>
      <div class="config-field-input">
        <label class="config-toggle">
          <input v-model="autoRefresh" type="checkbox" class="config-toggle-input">
          <span class="config-toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">刷新间隔（小时）</div>
      <p class="config-field-desc">Token 刷新的时间间隔。</p>
      <div class="config-field-input">
        <input v-model.number="refreshIntervalHours" type="number" min="1" class="geist-input">
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">失败阈值</div>
      <p class="config-field-desc">连续失败次数达到阈值后标记为不可用。</p>
      <div class="config-field-input">
        <input v-model.number="failThreshold" type="number" min="1" class="geist-input">
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">保存延迟（毫秒）</div>
      <p class="config-field-desc">Token 变更合并写入的延迟。</p>
      <div class="config-field-input">
        <input v-model.number="saveDelayMs" type="number" min="0" class="geist-input">
      </div>
    </div>

    <div class="config-field">
      <div class="config-field-title">一致性刷新（秒）</div>
      <p class="config-field-desc">多 worker 场景下 Token 状态刷新间隔。</p>
      <div class="config-field-input">
        <input v-model.number="reloadIntervalSec" type="number" min="0" class="geist-input">
      </div>
    </div>
  </ConfigSectionCard>
</template>
