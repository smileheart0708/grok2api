<script setup lang="ts">
import { computed } from 'vue'
import { Braces } from 'lucide-vue-next'
import ConfigSectionCard from '@/components/config/config-section-card.vue'
import type { AdminConfigExtraSections } from '@/types/admin-api'

interface Props {
  sections: AdminConfigExtraSections
  sectionJson: Record<string, string>
  errors: Record<string, string>
}

const props = defineProps<Props>()

const emit = defineEmits<(e: 'update:section-json', payload: { section: string; value: string }) => void>()

const sectionNames = computed(() => Object.keys(props.sections).sort((left, right) => left.localeCompare(right)))

function readSectionText(section: string): string {
  const current = props.sectionJson[section]
  if (current !== undefined) return current
  return JSON.stringify(props.sections[section], null, 2)
}

function onInput(section: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement)) return
  emit('update:section-json', {
    section,
    value: target.value,
  })
}
</script>

<template>
  <div v-if="sectionNames.length > 0" class="space-y-6">
    <ConfigSectionCard
      v-for="section in sectionNames"
      :key="section"
      :title="`扩展配置：${section}`"
      description="后端返回的未知分组，使用 JSON 编辑并原样提交。"
    >
      <template #icon>
        <Braces :size="16" aria-hidden="true" />
      </template>

      <div class="config-field">
        <div class="config-field-title">JSON 内容</div>
        <p class="config-field-desc">必须是对象类型，例如 { "key": "value" }。</p>
        <div class="config-field-input">
          <textarea
            class="geist-input font-mono text-xs config-json-textarea"
            rows="6"
            :value="readSectionText(section)"
            @input="onInput(section, $event)"
          ></textarea>
        </div>
        <p v-if="errors[section]" class="text-xs text-red-600 mt-1">{{ errors[section] }}</p>
      </div>
    </ConfigSectionCard>
  </div>
</template>
