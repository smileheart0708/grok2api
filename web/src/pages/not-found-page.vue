<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="not-found-page">
    <section class="not-found-page__card">
      <p class="not-found-page__code">404</p>
      <h1 class="not-found-page__title">页面不存在</h1>
      <p class="not-found-page__description">路由未匹配，请返回登录页或管理页继续操作。</p>
      <div class="not-found-page__actions">
        <RouterLink class="not-found-page__link" to="/login">前往 /login</RouterLink>
        <RouterLink class="not-found-page__link" to="/admin/token">前往 /admin/token</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.not-found-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.not-found-page__card {
  width: min(560px, 100%);
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: #fff;
  padding: 24px;
  box-shadow: 0 14px 40px rgb(15 23 42 / 8%);
  display: grid;
  gap: 12px;
}

.not-found-page__code {
  margin: 0;
  color: #0f172a;
  font-size: 40px;
  font-weight: 700;
}

.not-found-page__title {
  margin: 0;
  color: #0f172a;
  font-size: 24px;
}

.not-found-page__description {
  margin: 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.6;
}

.not-found-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.not-found-page__link {
  display: inline-flex;
  text-decoration: none;
  color: #1d4ed8;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  padding: 8px 11px;
  font-size: 13px;
}

.not-found-page__link:hover {
  border-color: #2563eb;
}
</style>
