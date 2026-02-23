<script setup lang="ts">
import MigrationPage from '@/components/migration-page.vue'
</script>

<template>
  <MigrationPage
    title="配置页（Vue）"
    description="该页面用于迁移原 /admin/config 功能，后续会按配置分组逐步拆分为独立组件。"
    route-path="/admin/config"
    legacy-path="/static/config/config.html"
  />
</template>
