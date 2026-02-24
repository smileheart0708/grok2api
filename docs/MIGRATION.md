# 前端迁移进度文档

## 迁移概述

本项目正在进行前端从 Legacy JavaScript 到 Vue 3 的迁移。迁移采用渐进式策略，通过 `useLegacyPage` composable 实现 Legacy JS 与 Vue 组件的共存。

## 当前迁移进度

### 已完成迁移 (100% Vue 实现)

| 页面 | 文件路径 | 状态 | 说明 |
|------|----------|------|------|
| 登录页 | `web/src/pages/login-page.vue` | [OK] 完成 | 完整 Vue 组件，含认证逻辑 |
| Token 管理 | `web/src/pages/token-page.vue` | [OK] 完成 | 完整 Vue 组件，含所有子组件 |
| API Key 管理 | `web/src/pages/keys-page.vue` | [OK] 完成 | 完整 Vue 组件，含筛选、统计、CRUD |
| 配置管理 | `web/src/pages/config-page.vue` | [OK] 完成 | 完整 Vue 组件，含强类型分组与兜底 JSON |
| 缓存管理 | `web/src/pages/cache-page.vue` | [OK] 完成 | 完整 Vue 组件，含统计、分区列表、批量清理与拖拽工具栏 |

### 部分迁移 (Vue 外壳 + Legacy JS)

| 页面 | 文件路径 | 状态 | Legacy 脚本依赖 |
|------|----------|------|-----------------|
| 数据中心 | `web/src/pages/datacenter-page.vue` | [WARN] 待迁移 | `datacenter.js` |
| 在线聊天 | `web/src/pages/chat-page.vue` | [WARN] 待迁移 | `chat.js` |

### 进度统计

- **已迁移页面**: 5/7 (71.4%)
- **已迁移功能点**: 登录认证、Token 管理、API Key 管理、配置管理、缓存管理
- **待迁移功能点**: 数据中心、在线聊天

## 已建立的 Vue 基础设施

### 路由配置

```
/login                    -> login-page.vue (Vue)
/admin/token              -> token-page.vue (Vue)
/admin/keys               -> keys-page.vue (Vue)
/admin/config             -> config-page.vue (Vue)
/admin/datacenter         -> datacenter-page.vue (Legacy)
/admin/cache              -> cache-page.vue (Vue)
/chat                     -> chat-page.vue (Legacy)
```

### 共享组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `AdminLayout` | `layouts/admin-layout.vue` | 管理后台布局 |
| `AdminHeader` | `components/admin/admin-header.vue` | 管理后台头部导航 |
| `AdminPageShell` | `components/admin/admin-page-shell.vue` | 页面内容外壳 |
| `UiModal` | `components/ui/ui-modal.vue` | 通用模态框 |
| `UiToastHost` | `components/ui/ui-toast-host.vue` | Toast 通知容器 |
| `UiConfirmDialog` | `components/ui/ui-confirm-dialog.vue` | 确认对话框 |
| `UiBatchBar` | `components/ui/ui-batch-bar.vue` | 批量操作工具栏 |
| `UiStatCard` | `components/ui/ui-stat-card.vue` | 统计卡片 |
| `UiDataTable` | `components/ui/ui-data-table.vue` | 数据表格 |

### Token 管理专用组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `TokenTable` | `components/token/token-table.vue` | Token 数据表格 |
| `TokenToolbar` | `components/token/token-toolbar.vue` | Token 工具栏 |
| `TokenStatsGrid` | `components/token/token-stats-grid.vue` | Token 统计网格 |
| `TokenAddEditModal` | `components/token/token-add-edit-modal.vue` | Token 添加/编辑模态框 |
| `TokenImportModal` | `components/token/token-import-modal.vue` | Token 导入模态框 |
| `TokenTestModal` | `components/token/token-test-modal.vue` | Token 测试模态框 |

### API Key 管理专用组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `KeyTable` | `components/keys/key-table.vue` | API Key 数据表格 |
| `KeyToolbar` | `components/keys/key-toolbar.vue` | API Key 工具栏 |
| `KeyStatsGrid` | `components/keys/key-stats-grid.vue` | API Key 统计网格 |
| `KeyEditModal` | `components/keys/key-edit-modal.vue` | API Key 添加/编辑模态框 |

### 配置管理专用组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `ConfigAppSection` | `components/config/config-app-section.vue` | 应用配置区块 |
| `ConfigGrokSection` | `components/config/config-grok-section.vue` | Grok 配置区块 |
| `ConfigTokenSection` | `components/config/config-token-section.vue` | Token 配置区块 |
| `ConfigCacheSection` | `components/config/config-cache-section.vue` | 缓存配置区块 |
| `ConfigPerformanceSection` | `components/config/config-performance-section.vue` | 性能配置区块 |
| `ConfigExtraSections` | `components/config/config-extra-sections.vue` | 扩展配置区块 |
| `ConfigSectionCard` | `components/config/config-section-card.vue` | 配置卡片容器 |

### 缓存管理专用组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `CacheToolbar` | `components/cache/cache-toolbar.vue` | 缓存页头部与当前分区信息 |
| `CacheStatsGrid` | `components/cache/cache-stats-grid.vue` | 图片/视频缓存统计卡与清空操作 |
| `CacheFileTable` | `components/cache/cache-file-table.vue` | 缓存文件列表表格（含选择、查看、删除） |
| `CacheBatchBar` | `components/cache/cache-batch-bar.vue` | 批量操作浮动栏（含拖拽） |
| `cache-utils` | `components/cache/cache-utils.ts` | 缓存页格式化与常量工具 |

### Composables

| Composable | 路径 | 用途 |
|------------|------|------|
| `useToast` | `composables/use-toast.ts` | Toast 通知 |
| `useConfirm` | `composables/use-confirm.ts` | 确认对话框 |
| `useBatchSelection` | `composables/use-batch-selection.ts` | 批量选择逻辑 |
| `useTheme` | `composables/use-theme.ts` | 主题切换 |
| `useLegacyPage` | `composables/use-legacy-page.ts` | Legacy 页面加载器 |

### API 客户端

| 模块 | 路径 | 用途 |
|------|------|------|
| `admin-api` | `lib/admin-api.ts` | 管理 API 请求封装 |
| `admin-auth` | `lib/admin-auth.ts` | 管理员认证逻辑 |
| `guards` | `lib/guards.ts` | 运行时类型守卫 |

### 类型定义

| 模块 | 路径 | 用途 |
|------|------|------|
| `admin-api` | `types/admin-api.ts` | 管理 API 类型定义 |
| `legacy-runtime` | `types/legacy-runtime.d.ts` | Legacy JS 全局类型 |

## Legacy 代码清单

### 公共模块 (`web/public/legacy/common/`)

| 文件 | 功能 | 迁移状态 |
|------|------|----------|
| `admin-auth.js` | 管理员认证 | [OK] 已迁移到 `src/legacy/common-bridge.ts` + `lib/admin-auth.ts`，文件已删除 |
| `toast.js` | Toast 通知 | [OK] 已迁移到 `src/legacy/common-bridge.ts` + `composables/use-toast.ts`，文件已删除 |
| `draggable.js` | 拖拽功能 | [OK] 已由 `components/cache/cache-batch-bar.vue` 替代，文件已删除 |

### 页面脚本 (`web/public/legacy/scripts/`)

| 文件 | 功能 | 关联页面 | 复杂度 |
|------|------|----------|--------|
| `token.js` | Token 管理 | token-page.vue | [OK] 已被 Vue 替代 |
| `keys.js` | API Key 管理 | keys-page.vue | [OK] 已被 Vue 替代并删除 |
| `config.js` | 配置管理 | config-page.vue | [OK] 已被 Vue 替代并删除 |
| `datacenter.js` | 数据中心 | datacenter-page.vue | 高 (含 Chart.js) |
| `cache.js` | 缓存管理 | cache-page.vue | [OK] 已被 Vue 替代并删除 |
| `chat.js` | 在线聊天 | chat-page.vue | 高 (含 SSE) |

## 后续迁移计划

### 迁移优先级

1. **低优先级**: `datacenter-page.vue` (数据中心)
   - 复杂度高，含 Chart.js 图表
   - 需要设计图表组件封装方案

2. **低优先级**: `chat-page.vue` (在线聊天)
   - 复杂度高，含 SSE 流式响应
   - 功能独立，可延后迁移

### 迁移步骤规范

每个页面的迁移应遵循以下步骤:

#### 1. 准备阶段

- [ ] 阅读 Legacy JS 源码，理解业务逻辑
- [ ] 分析 API 调用，确认类型定义
- [ ] 识别可复用的现有组件和 composables

#### 2. 类型定义

- [ ] 在 `types/admin-api.ts` 中补充缺失的类型
- [ ] 确保所有 API 响应有完整类型定义
- [ ] 使用 `lib/guards.ts` 中的类型守卫函数

#### 3. 组件开发

- [ ] 在 `components/` 下创建页面专用组件
- [ ] 使用 `<script setup lang="ts">` 语法
- [ ] Props 使用 `defineProps<T>()` 泛型语法
- [ ] 复用现有 UI 组件 (`components/ui/`)

#### 4. 页面迁移

- [ ] 移除 `useLegacyPage` 调用
- [ ] 移除 Legacy 脚本引用
- [ ] 使用 Vue 组件替换模板中的 DOM 操作
- [ ] 确保所有 `onclick` 等内联事件改为 Vue 事件绑定

#### 5. 样式迁移

- [ ] 检查 `web/src/styles/pages/` 下的 CSS 文件
- [ ] 将页面专用样式移入组件 `<style scoped>`
- [ ] 确保主题变量使用 `var(--xxx)` 格式

#### 6. 验证阶段

- [ ] 运行 `pnpm run type-check` 确保无类型错误
- [ ] 运行 `pnpm run lint` 确保无 lint 错误
- [ ] 手动测试所有功能点

#### 7. 清理阶段

- [ ] 删除已废弃的 Legacy 脚本文件
- [ ] 更新本文档的迁移状态

## 代码风格规范

### TypeScript

- 严格模式，禁止 `any`
- 所有 API 响应必须经过类型守卫验证
- 使用 `readonly` 修饰不可变数据

### Vue 组件

- 文件命名: `kebab-case.vue`
- 组件使用: `<PascalCase />`
- Props 定义: 使用 `interface` + `defineProps<T>()`
- 事件定义: 使用类型化 `defineEmits<{ ... }>()`

### API 调用

- 统一使用 `lib/admin-api.ts` 封装
- 错误处理使用 `AdminApiRequestError`
- 所有请求携带 `X-Requested-With` 头

### 样式

- 使用 CSS 变量实现主题
- 页面专用样式放在 `<style scoped>` 或 `styles/pages/`
- 遵循 Tailwind 工具类优先原则

## 注意事项

1. **渐进式迁移**: 通过 `useLegacyPage` 可实现新旧代码共存，不必一次性迁移所有页面

2. **API 一致性**: 迁移后的 Vue 组件应调用相同的后端 API，保持行为一致

3. **依赖关系**: `datacenter-page.vue` 依赖 Chart.js，需全局注入 (已在组件中处理)

4. **SSE 流式响应**: `chat-page.vue` 的流式响应逻辑需要特别处理，建议参考现代 SSE 封装方案

5. **清理时机**: Legacy 脚本文件应在对应页面完全迁移并验证后再删除

## 参考资源

- [Vue 3 文档](https://vuejs.org/)
- [Vue Router 5 文档](https://router.vuejs.org/)
- [Pinia 3 文档](https://pinia.vuejs.org/)
- [项目 AGENTS.md](../AGENTS.md) - 开发规范
