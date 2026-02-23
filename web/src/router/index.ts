import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    component: () => import('@/pages/login-page.vue'),
  },
  {
    path: '/admin',
    redirect: '/admin/token',
  },
  {
    path: '/admin/token',
    component: () => import('@/pages/token-page.vue'),
  },
  {
    path: '/admin/keys',
    component: () => import('@/pages/keys-page.vue'),
  },
  {
    path: '/admin/config',
    component: () => import('@/pages/config-page.vue'),
  },
  {
    path: '/admin/datacenter',
    component: () => import('@/pages/datacenter-page.vue'),
  },
  {
    path: '/admin/cache',
    component: () => import('@/pages/cache-page.vue'),
  },
  {
    path: '/chat',
    component: () => import('@/pages/chat-page.vue'),
  },
  {
    path: '/admin/chat',
    component: () => import('@/pages/chat-page.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/pages/not-found-page.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
