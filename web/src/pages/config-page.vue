<script setup lang="ts">
import AdminPageShell from '@/components/admin/admin-page-shell.vue'
import { useLegacyPage } from '@/composables/use-legacy-page'
import '@/styles/pages/config-page.css'

useLegacyPage({
  scripts: [
    '/legacy/common/admin-auth.js',
    '/legacy/common/toast.js',
    '/legacy/scripts/config.js',
  ],
  mountName: 'mountConfigPage',
})
</script>

<template>
  <div id="toast-container" class="toast-container"></div>

  <AdminPageShell max-width="960px">
    <div class="space-y-6">
      <div class="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">配置管理</h2>
          <p class="text-[var(--accents-4)] mt-1 text-sm">管理 API 密钥及系统参数设置。</p>
        </div>
        <button id="save-btn" onclick="saveConfig()" class="geist-button gap-2 config-save-btn" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          保存
        </button>
      </div>

      <div class="h-px bg-[var(--border)] my-6"></div>

      <div id="config-container" class="space-y-8">
        <div class="text-center py-12 text-[var(--accents-4)]">加载中...</div>
      </div>
    </div>
  </AdminPageShell>
</template>
