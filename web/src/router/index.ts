import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { DEFAULT_REDIRECT_PATH, fetchAdminSession, sanitizeRedirectPath } from '@/lib/admin-auth'

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
    component: () => import('@/layouts/admin-layout.vue'),
    meta: { requiresAdminAuth: true },
    children: [
      {
        path: '',
        redirect: '/admin/token',
      },
      {
        path: 'token',
        component: () => import('@/pages/token-page.vue'),
      },
      {
        path: 'keys',
        component: () => import('@/pages/keys-page.vue'),
      },
      {
        path: 'config',
        component: () => import('@/pages/config-page.vue'),
      },
      {
        path: 'datacenter',
        component: () => import('@/pages/datacenter-page.vue'),
      },
      {
        path: 'cache',
        component: () => import('@/pages/cache-page.vue'),
      },
    ],
  },
  {
    path: '/chat',
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

router.beforeEach(async (to) => {
  if (!to.meta.requiresAdminAuth) return true

  const authed = await fetchAdminSession()
  if (authed) return true

  const redirectTarget = sanitizeRedirectPath(to.fullPath || DEFAULT_REDIRECT_PATH)
  if (redirectTarget === DEFAULT_REDIRECT_PATH) {
    return { path: '/login', replace: true }
  }

  return {
    path: '/login',
    query: { redirect: redirectTarget },
    replace: true,
  }
})

export default router
