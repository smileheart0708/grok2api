export interface AdminNavItem {
  label: string
  path: string
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { label: 'Token 管理', path: '/admin/token' },
  { label: 'API Key 管理', path: '/admin/keys' },
  { label: '数据中心', path: '/admin/datacenter' },
  { label: '缓存管理', path: '/admin/cache' },
  { label: '配置管理', path: '/admin/config' },
]
