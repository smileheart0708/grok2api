<script setup lang="ts">
import MigrationPage from '@/components/migration-page.vue'
</script>

<template>
  <MigrationPage
    title="缓存管理页（Vue）"
    description="该页面用于迁移原 /admin/cache 功能，后续逐步替换缓存统计与清理操作面板。"
    route-path="/admin/cache"
    legacy-path="/static/cache/cache.html"
  />
</template>
