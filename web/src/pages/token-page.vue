<script setup lang="ts">
import MigrationPage from '@/components/migration-page.vue'
</script>

<template>
  <MigrationPage
    title="Token 管理页（Vue）"
    description="该页面用于迁移原 /admin/token 功能。接口协议保持与旧版一致，后续逐步替换交互实现。"
    route-path="/admin/token"
    legacy-path="/static/token/token.html"
  />
</template>
