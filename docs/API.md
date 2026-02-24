# Grok2API 接口文档

## 概述

本文档将后端 API 接口分为两类：

1. **前端管理 API** - 供 Vue SPA 管理后台使用
2. **AI 请求接口** - OpenAI 兼容的 AI 服务接口

---

## 一、前端管理 API

> 路径前缀: `/api/v1/admin/*`
> 认证方式: Session Cookie (`HttpOnly + Secure + SameSite=Lax`)
> 安全说明: 当前未启用显式 CSRF 校验，依赖 SameSite Cookie 防护

### 1.1 认证接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/admin/login` | 管理员登录 |
| GET | `/api/v1/admin/session` | 验证当前会话 |
| POST | `/api/v1/admin/logout` | 登出 |

#### POST `/api/v1/admin/login`

**请求体:**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**响应:**
```json
{
  "success": true,
  "expires_at": 1234567890000
}
```

### 1.2 配置管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/admin/config` | 获取全部配置 |
| POST | `/api/v1/admin/config` | 更新配置 |
| GET | `/api/v1/admin/storage` | 获取存储类型 |

#### GET `/api/v1/admin/config`

**响应:**
```json
{
  "app": {
    "api_key": "sk-xxx",
    "admin_username": "admin",
    "app_key": "********",
    "app_url": "https://example.com",
    "image_format": "url",
    "video_format": "url"
  },
  "grok": {
    "temporary": false,
    "stream": true,
    "thinking": false,
    "dynamic_statsig": true,
    "filter_tags": [],
    "video_poster_preview": false,
    "timeout": 600,
    "base_proxy_url": "",
    "asset_proxy_url": "",
    "cf_clearance": "",
    "max_retry": 3,
    "retry_status_codes": [401, 429, 403],
    "image_generation_method": "legacy"
  },
  "token": {
    "auto_refresh": true,
    "refresh_interval_hours": 8,
    "fail_threshold": 5,
    "save_delay_ms": 500,
    "reload_interval_sec": 30
  },
  "cache": {
    "enable_auto_clean": true,
    "limit_mb": 1024,
    "keep_base64_cache": false
  },
  "performance": {
    "assets_max_concurrent": 25,
    "media_max_concurrent": 50,
    "usage_max_concurrent": 25,
    "assets_delete_batch_size": 10,
    "admin_assets_batch_size": 10
  }
}
```

### 1.3 Token 管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/admin/tokens` | 获取 Token 列表 |
| POST | `/api/v1/admin/tokens` | 批量更新 Token |
| POST | `/api/v1/admin/tokens/refresh` | 刷新 Token 额度 |
| POST | `/api/v1/admin/tokens/test` | 测试 Token 可用性 |
| GET | `/api/v1/admin/models/chat` | 获取聊天模型列表 |

#### GET `/api/v1/admin/tokens`

**响应:**
```json
{
  "ssoBasic": [
    {
      "token": "sso=xxxxx",
      "status": "active",
      "quota": 100,
      "quota_known": true,
      "heavy_quota": -1,
      "heavy_quota_known": false,
      "token_type": "sso",
      "note": "",
      "fail_count": 0,
      "use_count": 0
    }
  ],
  "ssoSuper": []
}
```

#### POST `/api/v1/admin/tokens/test`

**请求体:**
```json
{
  "token": "xxxxx",
  "token_type": "sso",
  "model": "grok-4-fast"
}
```

**响应:**
```json
{
  "success": true,
  "upstream_status": 200,
  "result": "...",
  "reactivated": false,
  "quota_refresh": {
    "success": true,
    "remaining_queries": 100
  }
}
```

### 1.4 缓存管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/admin/cache` | 获取缓存统计 |
| GET | `/api/v1/admin/cache/local` | 获取本地缓存统计 |
| GET | `/api/v1/admin/cache/list` | 获取缓存文件列表 |
| POST | `/api/v1/admin/cache/clear` | 清除指定类型缓存 |
| POST | `/api/v1/admin/cache/item/delete` | 删除单个缓存文件 |
| POST | `/api/v1/admin/cache/online/clear` | 清除在线缓存 (未实现) |

#### GET `/api/v1/admin/cache/list`

**查询参数:**
- `type`: `image` | `video` (默认 `image`)
- `page`: 页码 (默认 1)
- `page_size`: 每页数量 (默认 1000, 最大 5000)

**响应:**
```json
{
  "status": "success",
  "total": 100,
  "page": 1,
  "page_size": 1000,
  "items": [
    {
      "name": "upload-xxx.jpg",
      "size_bytes": 12345,
      "mtime_ms": 1234567890000,
      "preview_url": "/images/upload-xxx.jpg"
    }
  ]
}
```

#### POST `/api/v1/admin/cache/clear`

**请求体:**
```json
{
  "type": "image"
}
```

### 1.5 API Keys 管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/admin/keys` | 获取 API Key 列表 |
| POST | `/api/v1/admin/keys` | 创建 API Key |
| POST | `/api/v1/admin/keys/update` | 更新 API Key |
| POST | `/api/v1/admin/keys/delete` | 删除 API Key |

#### GET `/api/v1/admin/keys`

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "key": "sk-xxxxxxxxxxxx",
      "name": "my-key",
      "is_active": true,
      "display_key": "sk-xxxx...xxxx",
      "chat_limit": -1,
      "heavy_limit": -1,
      "image_limit": -1,
      "video_limit": -1,
      "usage_today": {
        "chat_used": 10,
        "heavy_used": 0,
        "image_used": 5,
        "video_used": 0
      },
      "remaining_today": {
        "chat": null,
        "heavy": null,
        "image": null,
        "video": null
      }
    }
  ]
}
```

#### POST `/api/v1/admin/keys`

**请求体:**
```json
{
  "name": "my-api-key",
  "key": "sk-custom-key",
  "is_active": true,
  "limits": {
    "chat_per_day": 100,
    "heavy_per_day": 50,
    "image_per_day": 20,
    "video_per_day": 10
  }
}
```

### 1.6 监控与日志

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/admin/metrics` | 获取系统指标 |
| GET | `/api/v1/admin/logs/files` | 获取日志文件列表 |
| GET | `/api/v1/admin/logs/tail` | 获取最近日志 |

#### GET `/api/v1/admin/metrics`

**响应:**
```json
{
  "tokens": {
    "total": 10,
    "active": 8,
    "cooling": 1,
    "expired": 1,
    "disabled": 0,
    "chat_quota": 500,
    "image_quota": 250,
    "total_calls": 1234
  },
  "cache": {
    "local_image": { "count": 100, "size_bytes": 12345678, "size_mb": 11.8 },
    "local_video": { "count": 10, "size_bytes": 1234567, "size_mb": 1.2 }
  },
  "request_stats": {
    "total_requests": 1234,
    "success_rate": 0.95,
    "avg_duration_ms": 1234
  }
}
```

#### GET `/api/v1/admin/logs/tail`

**查询参数:**
- `file`: 日志文件名 (默认 `request_logs`)
- `lines`: 行数 (默认 500, 范围 50-5000)

### 1.7 WebSocket 接口

#### GET `/api/v1/admin/imagine/ws`

图片生成 WebSocket 接口，用于管理后台的实时图片生成。

**认证:** 通过 `?api_key=` 查询参数或无 API Key 时允许访问

**消息格式:**

客户端发送:
```json
{ "type": "start", "prompt": "a cat", "aspect_ratio": "2:3" }
{ "type": "stop" }
{ "type": "ping" }
```

服务端响应:
```json
{ "type": "status", "status": "running", "prompt": "a cat", "aspect_ratio": "2:3", "run_id": "xxx" }
{ "type": "image", "url": "/images/xxx", "sequence": 1, "created_at": 1234567890, "elapsed_ms": 5000, "aspect_ratio": "2:3", "run_id": "xxx" }
{ "type": "error", "message": "error message", "code": "error_code" }
{ "type": "pong" }
```

---

## 二、AI 请求接口 (OpenAI 兼容)

> 路径前缀: `/v1/*`
> 认证方式: `Authorization: Bearer <api_key>` 请求头
> CORS: 允许所有来源

### 2.1 模型接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/v1/models` | 获取可用模型列表 |
| GET | `/v1/models/:modelId` | 获取单个模型信息 |
| GET | `/v1/images/method` | 获取图片生成方法 |

#### GET `/v1/models`

**响应:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "grok-4-fast",
      "object": "model",
      "created": 1234567890,
      "owned_by": "x-ai",
      "display_name": "Grok 4 Fast",
      "description": "Fast model for quick responses"
    }
  ]
}
```

### 2.2 聊天补全

#### POST `/v1/chat/completions`

**请求体:**
```json
{
  "model": "grok-4-fast",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": true,
  "video_config": {
    "aspect_ratio": "16:9",
    "video_length": 10,
    "resolution": "720p",
    "preset": "standard"
  }
}
```

**支持的视频模型配置 (`video_config`):**
- `aspect_ratio`: 视频宽高比
- `video_length`: 视频时长 (秒)
- `resolution`: 分辨率 (`720p`, `1080p`)
- `preset`: 预设 (`standard`, `high`)

**流式响应 (SSE):**
```
data: {"id":"chat-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"},"index":0}]}

data: [DONE]
```

**非流式响应:**
```json
{
  "id": "chat-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "grok-4-fast",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello!" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 5,
    "total_tokens": 15
  }
}
```

### 2.3 图片生成

#### POST `/v1/images/generations`

**请求体:**
```json
{
  "prompt": "a beautiful sunset",
  "model": "grok-2-image",
  "n": 2,
  "size": "1024x1024",
  "concurrency": 3,
  "stream": false,
  "response_format": "url"
}
```

**参数说明:**
- `prompt`: 图片描述 (必填)
- `model`: 模型ID (默认 `grok-2-image`)
- `n`: 生成数量 (默认 1, 最大 10)
- `size`: 图片尺寸 (支持 `1024x1024`, `1792x1024`, `1024x1792`)
- `concurrency`: 并发数 (默认 3)
- `stream`: 是否流式返回 (默认 false)
- `response_format`: `url` | `b64_json`

**响应:**
```json
{
  "created": 1234567890,
  "data": [
    { "url": "/images/xxx" },
    { "url": "/images/yyy" }
  ]
}
```

**流式响应 (SSE):**
```
event: image
data: {"url":"/images/xxx","index":0}

event: done
data: {}
```

### 2.4 图片编辑

#### POST `/v1/images/edits`

**请求方式:** `multipart/form-data`

**表单字段:**
- `prompt`: 编辑描述 (必填)
- `model`: 模型ID (默认 `grok-2-image-edit`)
- `n`: 生成数量 (默认 1)
- `stream`: 是否流式返回
- `response_format`: `url` | `b64_json`
- `image`: 图片文件 (支持多个, 最大 16 张)

**响应格式:** 同 `/v1/images/generations`

### 2.5 文件上传

#### POST `/v1/uploads/image`

**请求方式:** `multipart/form-data`

**表单字段:**
- `file`: 图片文件 (必填, 最大 25MB)

**响应:**
```json
{
  "url": "/images/upload-xxx.jpg",
  "name": "upload-xxx.jpg",
  "size_bytes": 12345
}
```

---

## 三、媒体资源接口

### GET `/images/:imgPath`

获取缓存的图片或视频资源。

**路径编码方式:**

1. **新编码 - 路径编码:** `p_<base64url(pathname)>`
   - 示例: `p_L3VzZXJzL3h4eC9nZW5lcmF0ZWQveXl5L2ltYWdlLmpwZw==`

2. **新编码 - URL编码:** `u_<base64url(full_url)>`
   - 示例: `u_aHR0cHM6Ly9hc3NldHMuZ3Jvay5jb20veHh4L2ltYWdlLmpwZw==`

3. **旧编码:** `users-<uuid>-generated-<uuid>-image.jpg`

**支持的格式:**
- 图片: jpg, jpeg, png, webp, gif
- 视频: mp4, webm, mov, avi

**特性:**
- 自动缓存到 KV (最大 25MB)
- 支持 Range 请求 (视频)
- CORS 允许所有来源

---

## 四、系统接口

### GET `/health`

健康检查接口。

**响应:**
```json
{
  "status": "healthy",
  "service": "Grok2API",
  "runtime": "cloudflare-workers",
  "build": { "sha": "abc123" },
  "bindings": {
    "db": true,
    "kv_cache": true,
    "assets": true
  }
}
```

### 兼容性重定向

| 路径 | 重定向到 |
|------|----------|
| `/manage` | `/admin/token` (302) |
| `/v1/files/image/:path` | `/images/:path` (302) |
| `/v1/files/video/:path` | `/images/:path` (302) |

### 已禁用接口

| 路径 | 状态 |
|------|------|
| `/_worker.js` | 404 |
| `/admin/chat` | 404 |

---

## 五、错误响应格式

### OpenAI 兼容错误格式

```json
{
  "error": {
    "message": "错误信息",
    "type": "invalid_request_error",
    "code": "error_code"
  }
}
```

### 管理接口错误格式

```json
{
  "status": "error",
  "error": "错误信息"
}
```

或

```json
{
  "error": "错误信息",
  "code": "ERROR_CODE"
}
```

---

## 六、认证说明

### AI 接口认证

1. **全局 API Key:** 设置中的 `grok.api_key`
2. **独立 API Key:** 通过管理后台创建的 API Key

认证优先级: 请求头 `Authorization: Bearer <key>`

### 管理接口认证

1. **登录:** 用户名 + 密码
2. **会话:** Cookie 中的 session token
3. **防护:** 当前依赖 SameSite=Lax Cookie 防护跨站请求
