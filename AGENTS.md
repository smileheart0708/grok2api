# AGENTS.md - grok2api 开发指南

## 项目概述

基于 Cloudflare Workers 的 Grok2API 服务，使用 TypeScript + Hono 框架，支持 D1 数据库和 KV 缓存。

## 技术栈

- **运行时**: Cloudflare Workers
- **框架**: Hono v4.6+
- **语言**: TypeScript 5.7+ (严格模式)
- **数据库**: Cloudflare D1 (SQLite)
- **缓存**: Cloudflare KV
- **包管理器**: pnpm

## 构建/测试/部署命令

```bash
# 安装依赖
pnpm install

# 本地开发
pnpm run dev              # 启动 wrangler 开发服务器

# 类型检查
pnpm run typecheck        # tsc --noEmit

# 部署
pnpm run deploy           # wrangler deploy

# 数据库迁移
pnpm run db:migrate       # wrangler d1 migrations apply DB --remote
```

**注意**: 本项目无单元测试框架，验证主要靠类型检查和手动测试。

## 项目结构

```
grok2api/
├── src/
│   ├── index.ts          # 入口文件，路由注册
│   ├── env.ts            # 类型定义
│   ├── auth.ts           # 认证中间件
│   ├── db.ts             # 数据库工具函数
│   ├── settings.ts       # 配置管理
│   ├── routes/           # 路由处理器
│   │   ├── openai.ts     # OpenAI 兼容 API
│   │   ├── media.ts      # 媒体资源 API
│   │   └── admin.ts      # 管理面板 API
│   ├── repo/             # 数据仓库层
│   │   ├── tokens.ts     # Token 管理
│   │   ├── apiKeys.ts    # API Key 管理
│   │   └── logs.ts       # 日志管理
│   ├── grok/             # Grok API 客户端
│   ├── kv/               # KV 缓存操作
│   └── utils/            # 工具函数
├── app/static/           # 管理面板静态资源
├── migrations/           # D1 数据库迁移
├── wrangler.toml         # Workers 配置
└── config.defaults.toml  # 默认配置模板
```

## 代码风格指南

### 1. TypeScript 类型系统

- **严格禁止使用 `any`**，除非第三方库类型缺失且无法绕过（需注释说明）
- 启用 `noUncheckedIndexedAccess`，数组/对象索引访问需判空
- 启用 `exactOptionalPropertyTypes`，可选属性类型必须精确
- 所有变量、参数、返回值必须有明确类型定义
- 优先使用接口 (interface) 定义数据结构

示例:
```typescript
export interface Env {
  DB: D1Database;
  KV_CACHE: KVNamespace;
}

export async function dbFirst<T>(db: D1Database, sql: string): Promise<T | null> {
  // 实现
}
```

### 2. 导入规范

- 使用 ES Module 语法 (`import`/`export`)
- 相对导入使用 `./` 或 `../` 前缀
- 导入顺序：第三方库 → 本地模块 → 工具函数
- 使用类型导入时显式声明 `type`

示例:
```typescript
import { Hono } from "hono";
import type { Env } from "./env";
import { dbFirst } from "./db";
```

### 3. 命名约定

- **文件/目录**: 小写 + 连字符 (kebab-case)，如 `api-keys.ts`
- **类型/接口**: 大驼峰 (PascalCase)，如 `TokenRow`, `SettingsBundle`
- **函数/变量**: 小驼峰 (camelCase)，如 `selectBestToken`, `cooldownUntil`
- **常量**: 全大写 + 下划线，如 `MAX_FAILURES`, `IMAGE_METHOD_LEGACY`
- **数据库表名**: 复数形式，如 `tokens`, `api_keys`, `settings`

### 4. 错误处理

- 使用 `try/catch` 处理异步错误
- 错误信息使用中文（与项目整体风格一致）
- API 错误响应统一格式:
```typescript
return c.json({ error: "错误信息", code: "ERROR_CODE" }, 401);
```
- 未捕获错误在 `app.onError` 中统一处理

### 5. 函数式编程风格

- 优先使用 `const` 声明变量
- 使用 `map`/`filter`/`reduce` 处理数组
- 避免显式状态变更，优先纯函数
- 异步函数统一返回 `Promise<T>`

示例:
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

示例:
```typescript
export async function listTokens(db: D1Database): Promise<TokenRow[]> {
  return dbAll<TokenRow>(db, "SELECT * FROM tokens ORDER BY created_time DESC");
}
```

### 7. 配置管理

- 默认配置在 `config.defaults.toml`
- 运行时配置存储在 D1 `settings` 表
- 使用 `getSettings()` / `saveSettings()` 访问配置
- 敏感配置（如 API Key）不提交到 Git

### 8. 注释规范

- 公共 API 必须写 JSDoc 注释
- 复杂逻辑需要行内注释说明
- 使用简体中文编写注释
- 避免无意义的注释

## 部署流程

1. GitHub Actions 自动部署（push 到 `main` 分支）
2. CI 流程：类型检查 → 生成 `wrangler.ci.toml` → 应用迁移 → 部署
3. 环境变量通过 GitHub Secrets 配置：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

## 重要注意事项

1. **禁止使用 Windows 保留设备名** (NUL, CON, PRN 等) 作为文件名
2. **不要随意修改 wrangler.toml 中的绑定 ID**，否则可能导致数据丢失
3. **KV 缓存单值限制 25MB**，超出需分块存储
4. **缓存清理**: 每天 00:00 (Asia/Shanghai) 自动执行
5. **数据库迁移**: 新增表/字段需创建 migration 文件

## 常用调试技巧

- 访问 URL 添加 `?debug=1` 查看详细错误堆栈
- 检查 `/health` 端点验证服务状态和绑定
- 本地开发使用 `wrangler dev` 实时调试
- 查看 Workers 日志通过 Cloudflare Dashboard
