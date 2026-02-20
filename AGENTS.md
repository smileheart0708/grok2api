# AGENTS.md - Grok2API 开发指南

## 项目概述

Grok2API 是一个双栈项目，包含：
- **Python FastAPI 后端** (`app/`, `main.py`)：完整功能版本
- **Cloudflare Workers 版本** (`src/`)：轻量边缘部署版本

## 构建/测试/运行命令

### Python FastAPI 后端

```bash
# 环境准备
uv sync

# 启动开发服务
uv run main.py
# 或
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 运行单个测试
uv run pytest tests/test_image_api.py -v
uv run pytest tests/test_image_api.py::test_resolve_aspect_ratio -v

# 运行所有测试
uv run pytest tests/ -v

# 类型检查（项目使用动态类型，无严格 typecheck）
# 代码格式化（如有配置）
uv run ruff format .
uv run ruff check .
```

### Cloudflare Workers

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 类型检查
npm run typecheck

# 部署
npm run deploy

# 数据库迁移
npm run db:migrate
```

### Docker 部署

```bash
# 一键启动
docker compose up -d

# 源码构建启动
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build

# 查看日志
docker compose logs -f grok2api
```

## 代码风格指南

### Python 代码规范

#### 导入规范
```python
# 顺序：标准库 -> 第三方 -> 本地模块
from contextlib import asynccontextmanager
import asyncio
import os

from fastapi import FastAPI, Request
from dotenv import load_dotenv

from app.core.auth import verify_api_key
from app.core.config import get_config
```

#### 类型注解
- 所有函数参数和返回值必须添加类型注解
- 禁止使用 `Any`，除非第三方库限制且无法绕过（需注释说明）
- 使用 `Optional[T]` 或 `T | None` 表示可选值
- 使用 `TypedDict` 或 `dataclass` 定义复杂数据结构

#### 命名约定
- 类名：`PascalCase`（如 `TokenService`, `AppException`）
- 函数/变量：`snake_case`（如 `get_config`, `refresh_interval`）
- 常量：`UPPER_SNAKE_CASE`（如 `MAX_RETRY`, `DEFAULT_PORT`）
- 私有方法/变量：前缀 `_`（如 `_internal_helper`）

#### 错误处理
- 使用自定义异常类（`AppException`, `ValidationException` 等）
- 异常必须记录日志（使用 `logger`）
- API 错误响应遵循 OpenAI 格式（使用 `error_response()`）
- 禁止静默失败，所有错误路径必须明确处理

#### 异步编程
- I/O 操作必须使用异步（`async/await`）
- 使用 `asyncio.create_task()` 处理后台任务
- 使用 `asyncio.gather()` 处理并发
- 资源清理使用 `async with` 或 `try/finally`

### TypeScript 代码规范

#### 导入规范
```typescript
// 顺序：Hono/框架 -> 类型 -> 本地模块
import { Hono } from "hono";
import type { Env } from "./env";
import { openAiRoutes } from "./routes/openai";
```

#### 类型系统
- 启用 `strict: true`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`
- 所有变量、参数、返回值必须有明确类型
- 使用 `interface` 定义对象结构
- 禁止使用 `any`，必要时使用 `unknown` 加类型守卫

#### 命名约定
- 类/接口/类型：`PascalCase`（如 `ImageGenerationRequest`）
- 函数/变量：`camelCase`（如 `getAssets`, `buildSha`）
- 常量：`UPPER_SNAKE_CASE`（如 `MAX_CONCURRENT`）
- 文件命名：`camelCase.ts`（如 `imageExperimental.ts`）

#### 错误处理
- 使用 `try/catch` 包裹异步操作
- 错误必须记录到 `console.error()`
- HTTP 错误返回合适状态码（400/401/403/404/500）

### 通用规范

#### 代码结构
- 模块化：复杂函数拆分为小的、可测试的单元
- 单一职责：每个文件/类专注于一个功能
- 依赖注入：通过参数传递依赖，避免全局状态

#### 日志规范
- Python 使用 `loguru`：`logger.info()`, `logger.error()`
- TypeScript 使用 `console.log()`, `console.error()`
- 日志必须包含上下文信息（如用户 ID、请求 ID）

#### 配置管理
- 敏感配置从环境变量读取
- 默认配置在 `config.defaults.toml` 或 `settings.ts`
- 用户配置在 `data/config.toml`（自动生成）

#### 测试规范
- 测试文件以 `test_` 开头
- 使用 `pytest` 框架（Python）
- 测试用例命名：`test_<function>_<scenario>`
- 使用 `@pytest.mark.parametrize` 进行参数化测试

## 重要文件说明

| 文件 | 说明 |
|------|------|
| `main.py` | Python 应用入口 |
| `src/index.ts` | Workers 应用入口 |
| `app/api/v1/` | API 路由定义 |
| `app/services/` | 业务逻辑层 |
| `app/core/` | 核心组件（配置、异常、存储） |
| `src/routes/` | Workers 路由定义 |
| `src/repo/` | Workers 数据访问层 |
| `tests/` | Python 测试用例 |
| `config.defaults.toml` | 默认配置 |
| `docker-compose.yml` | Docker 部署配置 |

## 开发注意事项

1. **双栈一致性**：新增功能需同时考虑 Python 和 Workers 实现
2. **存储抽象**：使用 `StorageFactory` 抽象存储层（local/redis/mysql/pgsql）
3. **Token 管理**：Token 池、API Key、缓存管理逻辑需保持一致
4. **移动优先**：前端页面需适配移动端（响应式布局）
5. **类型安全**：宁可多写类型定义，不可牺牲类型检查
