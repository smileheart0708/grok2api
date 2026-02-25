# AGENTS.md - grok2api 开发指南

## 项目概述

基于 Cloudflare Workers 的 Grok2API 服务，使用 TypeScript + Hono 框架，支持 D1 数据库和 KV 缓存。前端使用 Vue 3 + Tailwind CSS v4 单独部署。

## 技术栈

### 后端 (根目录)
- **运行时**: Cloudflare Workers
- **框架**: Hono v4.6+
- **语言**: TypeScript 5.7+ (严格模式)
- **数据库**: Cloudflare D1 (SQLite)
- **缓存**: Cloudflare KV

### 前端 (web/)
- **框架**: Vue 3.5+ + Vue Router 5 + Pinia 3
- **构建**: Vite 7
- **样式**: Tailwind CSS v4 (使用 `@theme inline` 定义主题)
- **语言**: TypeScript 5.9+ (严格模式)
- **Lint**: oxlint + ESLint + Stylelint (max-warnings 0)
- **包管理器**: pnpm 10.30+

## 构建/测试/部署命令

### 后端 API (根目录)

```bash
pnpm install
pnpm run dev              # wrangler 开发服务器
pnpm run typecheck        # tsc --noEmit
pnpm run lint             # eslint (max-warnings 0)
pnpm run lint:fix         # eslint --fix
pnpm run deploy           # wrangler deploy
pnpm run db:migrate       # wrangler d1 migrations apply DB --remote
```

### 前端 Vue (web/)

```bash
cd web && pnpm install
pnpm run dev              # Vite 开发服务器
pnpm run build            # 构建 (含类型检查)
pnpm run type-check       # vue-tsc --build
pnpm run lint             # oxlint + eslint + stylelint (max-warnings 0)
pnpm run lint:fix         # 自动修复 lint 问题
pnpm run format           # prettier --write src/
```

**注意**: 项目无单元测试框架，验证靠类型检查和手动测试。

## 项目结构

```
grok2api/
├── src/                      # 后端 API (Hono)
│   ├── index.ts              # 入口，路由注册
│   ├── env.ts                # Env 类型定义
│   ├── auth.ts               # 认证中间件
│   ├── db.ts                 # 数据库工具
│   ├── routes/               # API 路由
│   ├── repo/                 # 数据仓库层
│   ├── grok/                 # Grok API 客户端
│   ├── kv/                   # KV 缓存操作
│   └── utils/                # 工具函数
├── web/                      # Vue 3 前端 (独立项目)
│   ├── src/
│   │   ├── main.ts           # 入口
│   │   ├── App.vue           # 根组件
│   │   ├── router/           # Vue Router 配置
│   │   ├── stores/           # Pinia stores
│   │   ├── pages/            # 页面组件 (kebab-case)
│   │   └── components/       # 通用组件
│   ├── vite.config.ts
│   └── package.json
├── migrations/               # D1 数据库迁移
├── wrangler.toml             # Workers 配置
└── eslint.config.js          # ESLint (覆盖前后端)
```

## 代码风格指南

### 1. TypeScript 严格模式 (前后端一致)

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitReturns": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "noImplicitOverride": true,
  "noPropertyAccessFromIndexSignature": true
}
```

- **禁止 `any`**: 后端 warn，前端 error
- **前端禁止类型断言**: `assertionStyle: 'never'`
- 数组/对象索引访问需处理 `undefined`

### 2. 导入规范

```typescript
// 后端
import { Hono } from "hono";
import type { Context } from "hono";
import { dbFirst } from "./db";

// 前端 (使用 @ 别名)
import { ref, computed } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import MyComponent from '@/components/MyComponent.vue'
```

### 3. 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 文件/目录 | kebab-case | `api-keys.ts`, `token-page.vue` |
| 类型/接口 | PascalCase | `TokenRow`, `RouteRecordRaw` |
| 函数/变量 | camelCase | `selectBestToken`, `isLoading` |
| 常量 | UPPER_SNAKE_CASE | `MAX_FAILURES` |
| Vue 组件 | PascalCase 使用，kebab-case 文件 | `<TokenPage />`, `token-page.vue` |

### 4. Vue 组件规范

```vue
<script setup lang="ts">
interface Props {
  title: string
  count?: number
}
const props = withDefaults(defineProps<Props>(), { count: 0 })
const emit = defineEmits<{ (e: 'update', value: number): void }>()
</script>
```

- 使用 `<script setup lang="ts">` 语法
- Props 使用 `defineProps<T>()` 泛型语法
- Emits 使用类型化定义

### 5. Tailwind CSS v4 规范 (强制性)

**禁止使用 `var()` 定义 class，会导致警告**:

```css
/* ❌ 错误 - 会产生警告 */
<div class="text-[var(--accents-5)]">

/* ✅ 正确 - 使用主题变量 */
<div class="text-accent-5">
```

**原因**: Tailwind CSS v4 的 `@theme inline` 已将所有 CSS 变量映射为 utility classes，直接使用 `var()` 会绕过 Tailwind 的优化系统。

**主题变量映射** (在 `web/src/styles/index.css` 定义):
- `--color-bg` → `bg-bg`
- `--color-fg` → `text-fg`
- `--color-accent-1` ~ `--color-accent-7` → `bg-accent-1` ~ `text-accent-7`
- `--color-border` → `border-border`
- `--color-surface` → `bg-surface`
- `--color-surface-muted` → `bg-surface-muted`

### 6. 错误处理

```typescript
// 后端 API 错误
return c.json({
  error: { message: "错误信息", type: "authentication_error", code: "invalid_token" }
}, 401);
```

### 7. 数据库操作 (后端)

- 所有数据库操作封装在 `src/repo/` 目录
- 使用参数化查询防止 SQL 注入
- 时间戳统一使用毫秒 (ms)

## 部署流程

1. GitHub Actions 自动部署 (push main / v* tag)
2. CI: 安装依赖 -> 类型检查 -> 生成 wrangler.ci.toml -> 应用迁移 -> 部署
3. 前端独立构建，产物在 `web/dist/`

## 重要注意事项

1. **禁止 Windows 保留设备名** (NUL, CON, PRN, AUX, COM1-9, LPT1-9)
2. **不要修改 wrangler.toml 中的绑定 ID**
3. **KV 单值限制 25MB**
4. **web/ 是独立项目**，有自己的 package.json 和 tsconfig
5. **前端 ESLint max-warnings 0**，不允许警告
6. **Tailwind CSS v4 禁止使用 var()**，使用主题变量代替

## 常用调试

- 后端：`?debug=1` 查看错误堆栈，`/health` 健康检查
- 前端：`pnpm run dev` 启动 Vite 开发服务器，集成 Vue DevTools
