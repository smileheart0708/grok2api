<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Github, Menu, X } from 'lucide-vue-next'
import { RouterLink, useRoute } from 'vue-router'
import { ADMIN_NAV_ITEMS } from '@/constants/admin-nav'
import { cycleTheme, useTheme } from '@/composables/use-theme'
import {
  fetchAdminStorageType,
  formatStorageLabel,
  logoutToLegacyLogin,
} from '@/lib/admin-auth'

const route = useRoute()
const { themePreference } = useTheme()

const isMobileMenuVisible = ref(false)
const isMobileMenuOpen = ref(false)
const storageLabel = ref('-')
const hideMenuTimer = ref<number | null>(null)

const themeButtonText = computed(() => {
  switch (themePreference.value) {
    case 'light':
      return '主题: Light'
    case 'dark':
      return '主题: Dark'
    default:
      return '主题: Auto'
  }
})

const isStorageReady = computed(() => storageLabel.value !== '-')

function isNavActive(path: string): boolean {
  return route.path.startsWith(path)
}

function clearMenuHideTimer(): void {
  if (hideMenuTimer.value === null) return
  window.clearTimeout(hideMenuTimer.value)
  hideMenuTimer.value = null
}

function openMobileMenu(): void {
  clearMenuHideTimer()
  isMobileMenuVisible.value = true

  requestAnimationFrame(() => {
    isMobileMenuOpen.value = true
  })
}

function closeMobileMenu(): void {
  if (!isMobileMenuVisible.value) return

  isMobileMenuOpen.value = false
  clearMenuHideTimer()

  hideMenuTimer.value = window.setTimeout(() => {
    isMobileMenuVisible.value = false
    hideMenuTimer.value = null
  }, 180)
}

function toggleMobileMenu(): void {
  if (isMobileMenuOpen.value) {
    closeMobileMenu()
    return
  }

  openMobileMenu()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  closeMobileMenu()
}

function onWindowResize(): void {
  if (window.innerWidth > 768) {
    closeMobileMenu()
  }
}

function onThemeToggle(): void {
  cycleTheme()
}

async function refreshStorageMode(): Promise<void> {
  const storageType = await fetchAdminStorageType()
  storageLabel.value = formatStorageLabel(storageType)
}

function onLogout(): void {
  logoutToLegacyLogin(route.fullPath)
}

watch(
  () => route.fullPath,
  () => {
    closeMobileMenu()
  },
)

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onWindowResize)
  void refreshStorageMode()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onWindowResize)
  clearMenuHideTimer()
})
</script>

<template>
  <header class="app-nav">
    <div class="app-nav-inner">
      <div class="nav-left">
        <div class="nav-brand">
          <a
            href="https://github.com/TQZHR/grok2api"
            target="_blank"
            rel="noopener noreferrer"
            class="brand-link"
          >
            <Github class="admin-header__icon-github" :size="14" aria-hidden="true" />
            <span>Grok2API</span>
          </a>
          <a
            href="https://github.com/TQZHR"
            target="_blank"
            rel="noopener noreferrer"
            class="admin-header__author"
          >
            @TQZHR
          </a>
        </div>

        <div class="nav-divider"></div>

        <nav class="nav-desktop-links" aria-label="后台导航">
          <RouterLink
            v-for="item in ADMIN_NAV_ITEMS"
            :key="item.path"
            :to="item.path"
            class="nav-link nav-desktop-link"
            :class="{ active: isNavActive(item.path) }"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
      </div>

      <div class="nav-actions nav-desktop-actions">
        <button
          type="button"
          class="nav-action-btn"
          :class="{ 'storage-ready': isStorageReady }"
          title="存储模式"
          @click="refreshStorageMode"
        >
          {{ storageLabel }}
        </button>
        <button type="button" class="nav-action-btn" title="切换主题" @click="onThemeToggle">
          {{ themeButtonText }}
        </button>
        <a
          href="https://github.com/TQZHR/grok2api/issues"
          target="_blank"
          rel="noopener noreferrer"
          class="nav-action-btn"
        >
          反馈
        </a>
        <button type="button" class="nav-action-btn" @click="onLogout">退出</button>
      </div>

      <button
        type="button"
        class="mobile-nav-toggle"
        aria-label="打开导航菜单"
        aria-controls="mobile-nav-drawer"
        :aria-expanded="isMobileMenuOpen"
        @click="toggleMobileMenu"
      >
        <Menu :size="18" aria-hidden="true" />
      </button>
    </div>

    <div
      id="mobile-nav-overlay"
      class="mobile-nav-overlay"
      :class="{ hidden: !isMobileMenuVisible, 'is-open': isMobileMenuOpen }"
      :aria-hidden="!isMobileMenuOpen"
      @click="closeMobileMenu"
    ></div>

    <aside
      id="mobile-nav-drawer"
      class="mobile-nav-drawer"
      :class="{ hidden: !isMobileMenuVisible, 'is-open': isMobileMenuOpen }"
      :aria-hidden="!isMobileMenuOpen"
    >
      <div class="mobile-nav-header">
        <div class="admin-header__mobile-title">管理菜单</div>
        <button type="button" class="mobile-nav-close" aria-label="关闭导航菜单" @click="closeMobileMenu">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>

      <div class="mobile-nav-links">
        <RouterLink
          v-for="item in ADMIN_NAV_ITEMS"
          :key="`mobile-${item.path}`"
          :to="item.path"
          class="nav-link mobile-nav-link"
          :class="{ active: isNavActive(item.path) }"
          @click="closeMobileMenu"
        >
          {{ item.label }}
        </RouterLink>
      </div>

      <div class="mobile-nav-actions">
        <button
          type="button"
          class="nav-action-btn mobile-action-btn"
          :class="{ 'storage-ready': isStorageReady }"
          title="存储模式"
          @click="refreshStorageMode"
        >
          {{ storageLabel }}
        </button>
        <button type="button" class="nav-action-btn mobile-action-btn" @click="onThemeToggle">
          {{ themeButtonText }}
        </button>
        <a
          href="https://github.com/TQZHR/grok2api/issues"
          target="_blank"
          rel="noopener noreferrer"
          class="nav-action-btn mobile-action-btn"
        >
          反馈
        </a>
        <button type="button" class="nav-action-btn mobile-action-btn" @click="onLogout">退出</button>
      </div>
    </aside>
  </header>
</template>

<style scoped>
.admin-header__author {
  color: var(--accents-4);
  text-decoration: none;
  font-size: 12px;
}

.admin-header__author:hover {
  color: var(--fg);
}

.admin-header__mobile-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--accents-7);
}

.admin-header__icon-github {
  flex-shrink: 0;
}
</style>
