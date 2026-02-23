<script setup lang="ts">
import MigrationPage from '@/components/migration-page.vue'
</script>

<template>
  <MigrationPage
    title="登录页（Vue）"
    description="该路由已接入 Vue 项目骨架。后续会将旧版登录逻辑逐步迁移到组件化实现。"
    route-path="/login"
    legacy-path="/static/login/login.html"
  />
</template>
