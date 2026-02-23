<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

interface MigrationPageProps {
  title: string
  description: string
  routePath: string
  legacyPath?: string
}

const props = defineProps<MigrationPageProps>()

const quickLinks = [
  '/login',
  '/admin/token',
  '/admin/keys',
  '/admin/config',
  '/admin/datacenter',
  '/admin/cache',
  '/chat',
] as const

const legacyHref = computed(() => props.legacyPath ?? props.routePath)
</script>

<template>
  <main class="migration-page">
    <section class="migration-page__card">
      <p class="migration-page__badge">Vue 渐进迁移中</p>
      <h1 class="migration-page__title">{{ title }}</h1>
      <p class="migration-page__description">{{ description }}</p>

      <p class="migration-page__meta">当前路由：{{ routePath }}</p>

      <div class="migration-page__actions">
        <a
          class="migration-page__link migration-page__link--legacy"
          :href="legacyHref"
          target="_blank"
          rel="noopener noreferrer"
        >
          打开旧版页面
        </a>
      </div>

      <nav class="migration-page__nav" aria-label="管理面板路由导航">
        <RouterLink
          v-for="link in quickLinks"
          :key="link"
          class="migration-page__link"
          :to="link"
        >
          {{ link }}
        </RouterLink>
      </nav>
    </section>
  </main>
</template>

<style scoped>
.migration-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(800px 420px at -10% -20%, rgb(66 153 225 / 20%), transparent 60%),
    radial-gradient(760px 420px at 120% 120%, rgb(56 189 248 / 16%), transparent 58%),
    linear-gradient(180deg, #f8fbff 0%, #f4f7fb 100%);
}

.migration-page__card {
  width: min(900px, 100%);
  border: 1px solid #d7e4f8;
  border-radius: 16px;
  background: rgb(255 255 255 / 92%);
  backdrop-filter: blur(6px);
  box-shadow: 0 24px 70px rgb(15 23 42 / 12%);
  padding: 28px;
  display: grid;
  gap: 14px;
}

.migration-page__badge {
  margin: 0;
  display: inline-flex;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #bfdbfe;
  background: #dbeafe;
  color: #1e3a8a;
  font-size: 12px;
  font-weight: 600;
}

.migration-page__title {
  margin: 0;
  color: #0f172a;
  font-size: clamp(24px, 3.5vw, 34px);
  line-height: 1.15;
}

.migration-page__description {
  margin: 0;
  color: #334155;
  font-size: 15px;
  line-height: 1.65;
}

.migration-page__meta {
  margin: 0;
  color: #475569;
  font-size: 13px;
}

.migration-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.migration-page__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.migration-page__link {
  text-decoration: none;
  padding: 8px 11px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  color: #0f172a;
  background: #fff;
  font-size: 13px;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.migration-page__link:hover {
  border-color: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgb(37 99 235 / 15%);
}

.migration-page__link--legacy {
  border-color: #2563eb;
  color: #1d4ed8;
}

@media (width <= 768px) {
  .migration-page {
    padding: 16px;
  }

  .migration-page__card {
    padding: 18px;
  }
}
</style>
