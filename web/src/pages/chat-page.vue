<script setup lang="ts">
import MigrationPage from '@/components/migration-page.vue'
</script>

<template>
  <MigrationPage
    title="聊天页（Vue）"
    description="该页面用于迁移原 /chat 与 /admin/chat。后续会按普通视图与管理视图拆分组件。"
    route-path="/chat"
    legacy-path="/static/chat/chat.html"
  />
</template>
