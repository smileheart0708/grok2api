<script setup lang="ts">
import { RouterView } from 'vue-router'
import AdminHeader from '@/components/admin/admin-header.vue'
</script>

<template>
  <div class="admin-layout">
    <AdminHeader />
    <main class="admin-layout__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100dvh;
  background: var(--bg);
  color: var(--fg);
}

.admin-layout__main {
  padding-top: var(--header-height);
}
</style>
