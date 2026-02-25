# Grok2API
> [!NOTE]
> 本项目仅供学习与研究，使用者必须遵循 Grok 使用条款与当地法律法规。

## 功能概览

- OpenAI 兼容接口（聊天/生图/编辑）
- D1 持久化（Tokens、API Keys、配置、日志）
- KV 媒体缓存（`/images/*`），按本地午夜自动清理
- 管理后台与移动端适配

## 快速部署（推荐：GitHub Actions）

仓库已内置工作流：`.github/workflows/cloudflare-workers.yml`  
触发：`push main`、`v*` tag、`workflow_dispatch`

### 1) 首次准备 Cloudflare 资源（只做一次）

```bash
pnpm install
pnpm exec wrangler login

# 创建 D1，记录输出中的 database_id
pnpm exec wrangler d1 create grok2api

# 创建 KV，记录输出中的 id
pnpm exec wrangler kv namespace create grok2api-cache
```

### 2) 配置 GitHub Secrets

在仓库 `Settings -> Secrets and variables -> Actions` 新增：

- `CLOUDFLARE_API_TOKEN`（需包含 Workers / D1 / KV 编辑权限）
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_D1_DATABASE_ID`
- `CF_KV_NAMESPACE_ID`

### 3) 触发部署

推送到 `main`（或手动运行工作流）后会自动执行：

1. 安装依赖 + 类型检查
2. 生成 `wrangler.ci.toml`（注入 D1/KV ID 与 `BUILD_SHA`）
3. 应用 D1 migrations
4. 部署 Worker

## 手动部署（Wrangler）

如果不走 GitHub Actions，可本地直接部署：

```bash
pnpm install
pnpm exec wrangler login

# 首次部署时，创建资源并填入 wrangler.toml 占位符
pnpm exec wrangler d1 create grok2api
pnpm exec wrangler kv namespace create grok2api-cache

# 应用迁移并部署
pnpm exec wrangler d1 migrations apply DB --remote
pnpm exec wrangler deploy
```

## 发布后检查

- 健康检查：`GET https://<your-domain>/health`
- 登录页：`https://<your-domain>/login`
- 默认账号密码：`admin / admin`（请首次登录后立即修改）

## 管理员认证（Cookie Session）

- 后台使用 `HttpOnly + Secure + SameSite=Lax` 的会话 Cookie（`grok2api_admin_session`）
- 会话默认 8 小时并在访问后台接口时滑动续期
- 当前未启用显式 CSRF 校验，依赖 `SameSite=Lax` Cookie 防护
- 登录/会话相关接口：
  - `POST /api/v1/admin/login`
  - `GET /api/v1/admin/session`
  - `POST /api/v1/admin/logout`

## 反向代理注意事项（Nginx/网关）

- 对 `/api/` 路径禁用缓存，避免会话校验被缓存污染。
- 透传 `Host`、`X-Forwarded-Host`、`X-Forwarded-Proto`、`X-Forwarded-For`。
- 不要改写或剥离 `Set-Cookie` 响应头。
- 外部访问必须为 HTTPS（管理员 Cookie 启用了 `Secure`）。

## 后台初始化（必须）

登录 `/admin/token` 后至少完成：

1. 添加 Token（`sso` 或 `ssoSuper`）
2. 在设置中确认 `dynamic_statsig`、`cf_clearance` 等关键项
3. 新建 API Key（用于调用 `/v1/*`）

## 常用接口

- `POST /v1/chat/completions`
- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `GET /v1/models`
- `GET /v1/images/method`
- `GET /images/<path>`

示例：

```bash
curl https://<your-domain>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "model": "grok-4",
    "messages": [{"role":"user","content":"你好"}]
  }'
```

## 关键配置（`wrangler.toml`）

- `CACHE_RESET_TZ_OFFSET_MINUTES`：每日清理时区偏移，默认 `480`（UTC+8）
- `KV_CACHE_MAX_BYTES`：KV 单值最大字节数，默认 `26214400`（25MB）
- `KV_CLEANUP_BATCH`：清理批量，默认 `200`
- `BUILD_SHA`：构建版本标识（CI 自动注入）

## 本地开发

```bash
pnpm install
pnpm run dev
pnpm run typecheck
```

## 前端样式约定

- 前端默认使用 Tailwind CSS v4 utility 方案。
- 禁止新增“手写 utility 仿真文件”（如 `legacy-utilities.css` 这一类镜像 Tailwind 的样式层）。
- 通用视觉能力优先沉淀在 `web/src/components/ui/` 与 `web/src/styles/common.css`，页面样式仅保留页面特有或 legacy 脚本绑定所需的最小规则。
- 样式归属清单见 `web/docs/style-ownership.md`。

## 注意事项

1. 不要随意修改 `wrangler.toml` 中 Worker 名称和 D1/KV 绑定 ID，否则会导致新资源被创建，表现为“数据丢失”。
2. KV 单值限制 25MB，大文件（尤其视频 Range 请求）可能绕过 KV 命中。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=smileheart0708/grok2api&type=Timeline)](https://star-history.com/#smileheart0708/grok2api&Timeline)
