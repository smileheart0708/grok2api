<script setup lang="ts">
import { RouterView } from 'vue-router'
import AdminHeader from '@/components/admin/admin-header.vue'
</script>

<template>
  <div class="min-h-dvh bg-bg text-fg">
    <AdminHeader />
    <main class="pt-[var(--header-height)]">
      <RouterView />
    </main>
  </div>
</template>
