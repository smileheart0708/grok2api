<script setup lang="ts">
import MigrationPage from '@/components/migration-page.vue'
</script>

<template>
  <MigrationPage
    title="API Keys 管理页（Vue）"
    description="该页面用于迁移原 /admin/keys 功能。接口与鉴权流程保持兼容，确保渐进切换。"
    route-path="/admin/keys"
    legacy-path="/static/keys/keys.html"
  />
</template>
