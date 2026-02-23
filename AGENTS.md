# AGENTS.md - grok2api 开发指南

## 项目概述

基于 Cloudflare Workers 的 Grok2API 服务，使用 TypeScript + Hono 框架，支持 D1 数据库和 KV 缓存。

## 技术栈

- **运行时**: Cloudflare Workers
- **框架**: Hono v4.6+
- **语言**: TypeScript 5.7+ (严格模式)
- **数据库**: Cloudflare D1 (SQLite)
- **缓存**: Cloudflare KV
- **包管理器**: pnpm 10.30+

## 构建/测试/部署命令

### 主项目 (根目录)

```bash
# 安装依赖
pnpm install

# 本地开发
pnpm run dev              # 启动 wrangler 开发服务器

# 类型检查 (无单元测试，验证靠类型检查)
pnpm run typecheck        # tsc -p tsconfig.json --noEmit

# Lint 和格式化
pnpm run lint             # eslint . --fix
pnpm run format           # prettier --write .

# 部署
pnpm run deploy           # wrangler deploy

# 数据库迁移
pnpm run db:migrate       # wrangler d1 migrations apply DB --remote
```

### Web 前端 (web/ 目录)

```bash
cd web
pnpm install
pnpm run dev              # Vite 开发服务器
pnpm run build            # 构建 (含类型检查)
pnpm run lint             # oxlint + eslint
pnpm run format           # prettier --write src/
```

**注意**: 主项目无单元测试框架，验证主要靠类型检查和手动测试。

## 项目结构

```
grok2api/
├── src/
│   ├── index.ts              # 入口文件，路由注册
│   ├── env.ts                # Env 类型定义
│   ├── auth.ts               # 认证中间件
│   ├── db.ts                 # 数据库工具函数
│   ├── settings.ts           # 配置管理
│   ├── routes/
│   │   ├── openai.ts         # OpenAI 兼容 API 入口
│   │   ├── openai/           # OpenAI 路由子模块
│   │   │   ├── types.ts      # 路由类型定义
│   │   │   ├── common.ts     # 公共工具
│   │   │   ├── register-*.ts # 各类路由注册
│   │   │   └── quota.ts      # 配额管理
│   │   ├── media.ts          # 媒体资源 API
│   │   └── admin.ts          # 管理面板 API
│   ├── repo/                 # 数据仓库层
│   │   ├── tokens.ts         # Token 管理
│   │   ├── apiKeys.ts        # API Key 管理
│   │   ├── logs.ts           # 日志管理
│   │   ├── cache.ts          # 缓存管理
│   │   └── adminSessions.ts  # 管理会话
│   ├── grok/                 # Grok API 客户端
│   │   ├── models.ts         # 模型定义
│   │   ├── create.ts         # 对话创建
│   │   ├── conversation.ts   # 对话管理
│   │   ├── processor.ts      # 响应处理
│   │   ├── headers.ts        # 请求头构建
│   │   └── upload.ts         # 文件上传
│   ├── kv/                   # KV 缓存操作
│   └── utils/                # 工具函数
├── web/                      # Vue 3 前端项目 (独立)
├── app/static/               # 管理面板静态资源
├── migrations/               # D1 数据库迁移
├── wrangler.toml             # Workers 配置
└── config.defaults.toml      # 默认配置模板
```

## 代码风格指南

### 1. TypeScript 类型系统

```jsonc
// tsconfig.json 核心配置
{
  "strict": true,
  "noUncheckedIndexedAccess": true,     // 数组索引访问需判空
  "exactOptionalPropertyTypes": true,   // 可选属性类型精确
  "noImplicitReturns": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "noImplicitOverride": true,
  "noPropertyAccessFromIndexSignature": true
}
```

- **严格禁止使用 `any`**，ESLint 配置为 `warn` 级别，仅在第三方库类型缺失且无法绕过时使用（需注释说明）
- 所有变量、参数、返回值必须有明确类型定义
- 优先使用 `interface` 定义数据结构
- 数组/对象索引访问需处理 `undefined` 情况

```typescript
// 正确示例
export interface Env {
  DB: D1Database;
  KV_CACHE: KVNamespace;
}

export async function dbFirst<T>(db: D1Database, sql: string): Promise<T | null> {
  const row = await stmt.first<T>();
  return row ?? null;  // 处理 undefined
}
```

### 2. 导入规范

- 使用 ES Module 语法 (`import`/`export`)
- 相对导入使用 `./` 或 `../` 前缀
- 类型导入显式声明 `type`
- 导入顺序：第三方库 → 本地模块 → 工具函数

```typescript
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "./env";
import { dbFirst, dbAll, dbRun } from "./db";
```

### 3. 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 文件/目录 | kebab-case | `api-keys.ts`, `register-chat-routes.ts` |
| 类型/接口 | PascalCase | `TokenRow`, `SettingsBundle`, `OpenAiRouteBindings` |
| 函数/变量 | camelCase | `selectBestToken`, `cooldownUntil`, `bearerToken` |
| 常量 | UPPER_SNAKE_CASE | `MAX_FAILURES`, `IMAGE_METHOD_LEGACY` |
| 数据库表名 | 复数 snake_case | `tokens`, `api_keys`, `settings` |
| 数据库字段 | snake_case | `created_time`, `remaining_queries` |

### 4. 错误处理

- 使用 `try/catch` 处理异步错误
- 错误信息使用中文（与项目整体风格一致）
- API 错误响应统一格式:

```typescript
// OpenAI 格式错误
return c.json({
  error: { message: "错误信息", type: "authentication_error", code: "invalid_token" }
}, 401);

// 管理面板格式错误
return c.json({ error: "错误信息", code: "ERROR_CODE" }, 401);
```

- 未捕获错误在 `app.onError` 中统一处理
- 使用 `?debug=1` 参数查看详细错误堆栈

### 5. 函数式编程风格

- 优先使用 `const` 声明变量
- 使用 `map`/`filter`/`reduce`/`flatMap` 处理数组
- 避免显式状态变更，优先纯函数
- 异步函数统一返回 `Promise<T>`

```typescript
const cleaned = tokens.map((t) => t.trim()).filter(Boolean);
const set = new Set<string>();
for (const t of tags) set.add(t);
return [...set].sort();
```

### 6. 数据库操作规范

- 所有数据库操作封装在 `src/repo/` 目录
- 使用参数化查询防止 SQL 注入
- 批量操作使用 `db.batch()`
- 时间戳统一使用毫秒 (ms) 存储

```typescript
// 使用 db.ts 提供的工具函数
export async function listTokens(db: Env["DB"]): Promise<TokenRow[]> {
  return dbAll<TokenRow>(db, "SELECT * FROM tokens ORDER BY created_time DESC");
}

// 批量操作
const stmts = items.map(item => db.prepare("INSERT...").bind(...));
await db.batch(stmts);
```

### 7. 路由注册模式

- 使用 Hono 路由组，路由注册按功能拆分到独立文件
- 模式: `register*Routes(app)` 函数注册路由

```typescript
// src/routes/openai.ts
export const openAiRoutes = new Hono<OpenAiRouteBindings>();
openAiRoutes.use("/*", cors({ origin: "*" }));
openAiRoutes.use("/*", requireApiAuth);

registerModelRoutes(openAiRoutes);
registerChatRoutes(openAiRoutes);
registerImageRoutes(openAiRoutes);
```

### 8. 注释规范

- 公共 API 必须写 JSDoc 注释
- 复杂逻辑需要行内注释说明
- 使用简体中文编写注释
- 避免无意义的注释

## 部署流程

1. GitHub Actions 自动部署（push 到 `main` 分支或 `v*` tag）
2. CI 流程：安装依赖 → 类型检查 → 生成 `wrangler.ci.toml` → 应用迁移 → 部署
3. 环境变量通过 GitHub Secrets 配置：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CF_D1_DATABASE_ID`
   - `CF_KV_NAMESPACE_ID`

## 重要注意事项

1. **禁止使用 Windows 保留设备名** (NUL, CON, PRN, AUX, COM1-9, LPT1-9) 作为文件名
2. **不要随意修改 wrangler.toml 中的绑定 ID**，否则可能导致数据丢失
3. **KV 缓存单值限制 25MB**，超出需分块存储
4. **缓存清理**: 每天 00:00 (Asia/Shanghai) 自动执行
5. **数据库迁移**: 新增表/字段需在 `migrations/` 创建 migration 文件
6. **web/ 目录是独立项目**，有自己的 package.json 和配置

## 常用调试技巧

- 访问 URL 添加 `?debug=1` 查看详细错误堆栈
- 检查 `/health` 端点验证服务状态和绑定
- 本地开发使用 `pnpm run dev` 实时调试
- 查看 Workers 日志通过 Cloudflare Dashboard
- 使用 `console.error` 记录错误（ESLint 配置为 warn）
