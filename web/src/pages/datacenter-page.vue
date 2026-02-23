<script setup lang="ts">
import MigrationPage from '@/components/migration-page.vue'
</script>

<template>
  <MigrationPage
    title="数据中心页（Vue）"
    description="该页面对应原 /admin/datacenter。后续迁移会保持统计与展示接口不变。"
    route-path="/admin/datacenter"
    legacy-path="/static/datacenter/datacenter.html"
  />
</template>
