# Grok2API

本项目为对 [chenyme/grok2api](https://github.com/chenyme/grok2api) 的二次修改与增强。

**中文** | [English](docs/README.en.md)

> [!NOTE]
> 本项目仅供学习与研究，使用者必须在遵循 Grok 的 **使用条款** 以及 **法律法规** 的情况下使用，不得用于非法用途。

基于 **Cloudflare Workers** 重构的 Grok2API，使用 TypeScript + Hono 框架，支持 D1 数据库和 KV 缓存。全面适配最新 Web 调用格式，支持流/非流式对话、图像生成/编辑、深度思考，号池并发与自动负载均衡一体化。

<img width="1941" height="1403" alt="screenshot" src="docs/assets/screenshot-2026-02-05-064737.png" />

<br>

## 快速开始

### 环境要求

- Node.js 18+
- Cloudflare 账号
- `wrangler` CLI

### 安装依赖

```bash
npm install
```

### 登录 Cloudflare

```bash
npx wrangler login
```

### 初始化 D1 数据库

```bash
# 创建 D1 数据库
npx wrangler d1 create grok2api

# 将输出的 database_id 填入 wrangler.toml

# 应用数据库迁移
npx wrangler d1 migrations apply DB --remote
```

### 创建 KV 缓存

```bash
# 创建 KV namespace
npx wrangler kv namespace create grok2api-cache

# 将输出的 id 填入 wrangler.toml
```

### 部署到 Workers

```bash
npx wrangler deploy
```

部署成功后：
- 健康检查：`GET https://<你的域名>/health`
- 管理面板：`https://<你的域名>/login`
- 默认账号密码：`admin / admin`（建议登录后立即修改）

### GitHub Actions 一键部署

仓库已配置自动部署工作流（`.github/workflows/cloudflare-workers.yml`），push 到 `main` 分支时自动部署。

前置条件：在 GitHub 仓库 Settings → Secrets and variables → Actions 中配置：
- `CLOUDFLARE_API_TOKEN`（需包含 Workers、D1、KV 编辑权限）
- `CLOUDFLARE_ACCOUNT_ID`

<br>

## 功能特性

- **D1（SQLite）**：持久化存储 Tokens / API Keys / 管理员会话 / 配置 / 日志
- **KV 缓存**：缓存 `/images/*` 的图片/视频资源，每天 0 点自动清理
- **移动端适配**：全站响应式布局，支持手机端抽屉导航、表格横向滚动
- **Token 管理**：支持 sso/ssoSuper 类型筛选、状态筛选、批量操作
- **API Key 管理**：统计卡片、名称/Key 搜索、状态筛选、额度管理
- **图像生成**：支持 `grok-imagine-1.0`，支持宽高比选择和并发控制
- **图像编辑**：支持 `grok-imagine-1.0-edit`
- **视频生成**：支持 `grok-imagine-1.0-video`
- **对话聊天**：支持 grok-3/4 系列模型，支持流式输出和思维链

<br>

## 管理面板

访问地址：`https://<你的域名>/login`

常用页面：
- `/admin/token`：Token 管理（导入/导出/批量操作）
- `/admin/keys`：API Key 管理（统计/筛选/新增/编辑/删除）
- `/admin/datacenter`：数据中心（常用指标 + 日志查看）
- `/admin/config`：配置管理
- `/admin/cache`：缓存管理（本地缓存 + 在线资产）
- `/chat`：在线聊天界面
- `/admin/chat`：聊天管理界面

<br>

## 接口说明

### `POST /v1/chat/completions`

通用对话接口，支持聊天、图像生成、视频生成。

```bash
curl https://<你的域名>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -d '{
    "model": "grok-4",
    "messages": [{"role":"user","content":"你好"}]
  }'
```

### `POST /v1/images/generations`

图像生成接口。

```bash
curl https://<你的域名>/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -d '{
    "model": "grok-imagine-1.0",
    "prompt": "一只在太空漂浮的猫",
    "n": 1
  }'
```

### `GET /v1/images/method`

返回当前生图后端方式（用于前端判断是否启用新功能）。

```bash
curl https://<你的域名>/v1/images/method \
  -H "Authorization: Bearer $GROK2API_API_KEY"
```

返回示例：
```json
{ "image_generation_method": "legacy" }
```

<br>

## 可用模型

| 模型名 | 计次 | 可用账号 | 对话 | 图像 | 视频 |
| :----- | :--: | :------- | :--: | :--: | :--: |
| `grok-3` | 1 | Basic/Super | ✅ | ✅ | - |
| `grok-3-fast` | 1 | Basic/Super | ✅ | ✅ | - |
| `grok-4` | 1 | Basic/Super | ✅ | ✅ | - |
| `grok-4-mini` | 1 | Basic/Super | ✅ | ✅ | - |
| `grok-4-fast` | 1 | Basic/Super | ✅ | ✅ | - |
| `grok-4-heavy` | 4 | Super | ✅ | ✅ | - |
| `grok-4.1` | 1 | Basic/Super | ✅ | ✅ | - |
| `grok-4.1.thinking` | 4 | Basic/Super | ✅ | ✅ | - |
| `grok-imagine-1.0` | 4 | Basic/Super | - | ✅ | - |
| `grok-imagine-1.0-edit` | 4 | Basic/Super | - | ✅ | - |
| `grok-imagine-1.0-video` | - | Basic/Super | - | - | ✅ |

<br>

## 配置说明

### 环境变量（wrangler.toml）

| 变量名 | 说明 | 默认值 |
| :----- | :--- | :----- |
| `CACHE_RESET_TZ_OFFSET_MINUTES` | 每日缓存清理时区偏移（分钟） | `480` (UTC+8) |
| `KV_CACHE_MAX_BYTES` | KV 缓存单值最大字节数 | `26214400` (25MB) |
| `KV_CLEANUP_BATCH` | 清理批量 | `200` |
| `BUILD_SHA` | 构建版本号 | `dev` |

### D1 数据库配置

数据库绑定名：`DB`
迁移目录：`migrations/`

### KV 缓存配置

KV 绑定名：`KV_CACHE`
Namespace：`grok2api-cache`

<br>

## 升级/迁移

- **代码更新不会清空数据**：只要继续绑定同一个 D1 数据库和 KV Namespace，账户数据不会丢失
- **缓存策略**：KV 中的缓存对象会按配置的时区每天 0 点过期，升级后仍保持一天一清理
- **不要随意修改绑定 ID**：在 `wrangler.toml` 中保持 `name`、D1/KV 绑定 ID 一致，否则可能创建新资源导致"看起来像丢数据"

<br>

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 类型检查
npm run typecheck
```

<br>

## 注意事项

1. **自动注册功能**：原 Python 版本的自动注册功能（Turnstile Solver、邮箱 Worker 等）已移至 `local/` 目录，该目录已被 Git 排除。如需使用自动注册，请自行在本地部署 Python 环境并参考 `local/` 中的代码。

2. **Token 来源**：本项目不提供自动注册功能，使用者需自行获取 Grok Token（sso 或 ssoSuper）。

3. **额度说明**：
   - Basic 账号：80 次 / 20h
   - Super 账号：无明确额度限制

4. **部署一致性**：管理面板的静态资源（`app/static/`）在 Workers 部署时通过 `assets` 绑定上传，确保前端功能在所有部署方式下行为一致。

<br>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=TQZHR/grok2api&type=Timeline)](https://star-history.com/#TQZHR/grok2api&Timeline)
