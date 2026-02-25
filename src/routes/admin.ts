import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../env";
import { requireAdminAuth } from "../auth";
import {
  getSettings,
  saveSettings,
  normalizeCfCookie,
  normalizeImageGenerationMethod,
} from "../settings";
import type {
  CacheSettings,
  GlobalSettings,
  GrokSettings,
  PerformanceSettings,
  TokenSettings,
} from "../settings";
import {
  addApiKey,
  deleteApiKey,
  listApiKeys,
  validateApiKey,
  updateApiKeyLimits,
  updateApiKeyName,
  updateApiKeyStatus,
} from "../repo/apiKeys";
import { displayKey } from "../utils/crypto";
import { createAdminSession, deleteAdminSession } from "../repo/adminSessions";
import {
  clearAdminSessionCookie,
  getAdminSessionCookie,
  setAdminSessionCookie,
} from "../admin-session-cookie";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  applyCooldown,
  listTokens,
  reactivateToken,
  recordTokenFailure,
  selectBestToken,
  updateTokenLimits,
} from "../repo/tokens";
import { generateImagineWs, resolveAspectRatio } from "../grok/imagineExperimental";
import { checkRateLimits } from "../grok/rateLimits";
import { buildConversationPayload, sendConversationRequest } from "../grok/conversation";
import { parseOpenAiFromGrokNdjson } from "../grok/processor";
import { MODEL_CONFIG } from "../grok/models";
import { getRequestLogs, getRequestStats } from "../repo/logs";
import {
  deleteCacheRows,
  listCacheRowsByType,
  listOldestRows,
  type CacheType,
} from "../repo/cache";
import { dbAll, dbFirst, dbRun } from "../db";
import { nowMs } from "../utils/time";
import { listLastUsedByKey, listUsageForDay, localDayString } from "../repo/apiKeyUsage";
import type { ApiKeyUsageRow } from "../repo/apiKeyUsage";

function jsonError(message: string, code: string): Record<string, unknown> {
  return { error: message, code };
}

const PASSWORD_MASK = "********";

async function verifyAdminPasswordFromSettings(args: {
  env: Env;
  username: string;
  password: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
}): Promise<boolean> {
  const { env, username, password, settings } = args;
  if (username !== settings.global.admin_username) return false;

  const hash = String(settings.global.admin_password_hash ?? "").trim();
  const salt = String(settings.global.admin_password_salt ?? "").trim();
  const iter = Math.floor(Number(settings.global.admin_password_iter ?? 0));
  if (hash && salt && Number.isFinite(iter) && iter > 0) {
    return verifyPassword({ password, hash, salt, iter });
  }

  const plain = String(settings.global.admin_password ?? "").trim();
  if (!plain || plain !== password) return false;

  const hashed = await hashPassword(password);
  await saveSettings(env, {
    global_config: {
      admin_password: "",
      admin_password_hash: hashed.hash,
      admin_password_salt: hashed.salt,
      admin_password_iter: hashed.iter,
    },
  });
  return true;
}

function validateTokenType(token_type: string): "sso" | "ssoSuper" {
  if (token_type !== "sso" && token_type !== "ssoSuper") throw new Error("无效的Token类型");
  return token_type;
}

function normalizeSsoToken(raw: string): string {
  const t = (raw || "").trim();
  return t.startsWith("sso=") ? t.slice(4).trim() : t;
}

async function clearKvCacheByType(
  env: Env,
  type: CacheType | null,
  batch = 200,
  maxLoops = 20,
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < maxLoops; i++) {
    const rows = await listOldestRows(env.DB, type, null, batch);
    if (!rows.length) break;
    const keys = rows.map((r) => r.key);
    await Promise.all(keys.map((k) => env.KV_CACHE.delete(k)));
    await deleteCacheRows(env.DB, keys);
    deleted += keys.length;
    if (keys.length < batch) break;
  }
  return deleted;
}

function base64UrlEncodeString(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeAssetPath(raw: string): string {
  try {
    const u = new URL(raw);
    return `u_${base64UrlEncodeString(u.toString())}`;
  } catch {
    const p = raw.startsWith("/") ? raw : `/${raw}`;
    return `p_${base64UrlEncodeString(p)}`;
  }
}

interface ImagineWsControlMessage {
  type?: unknown;
  prompt?: unknown;
  aspect_ratio?: unknown;
}

function parseWsMessageData(data: unknown): ImagineWsControlMessage | null {
  let raw = "";
  if (typeof data === "string") raw = data;
  else if (data instanceof ArrayBuffer) raw = new TextDecoder().decode(data);
  else if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    raw = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ImagineWsControlMessage;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function wsSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseImagineWsFailureStatus(message: string): number {
  const matched = message.match(/Imagine websocket connect failed:\s*(\d{3})\b/i);
  if (matched) {
    const status = Number(matched[1]);
    if (Number.isFinite(status) && status >= 100 && status <= 599) return status;
  }
  return 500;
}

function parseFiniteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

interface AdminConfigAppInput {
  api_key?: unknown;
  admin_username?: unknown;
  app_key?: unknown;
  app_url?: unknown;
  image_format?: unknown;
}

interface AdminConfigGrokInput {
  base_proxy_url?: unknown;
  asset_proxy_url?: unknown;
  cf_clearance?: unknown;
  filter_tags?: unknown;
  dynamic_statsig?: unknown;
  thinking?: unknown;
  temporary?: unknown;
  video_poster_preview?: unknown;
  retry_status_codes?: unknown;
  timeout?: unknown;
  image_generation_method?: unknown;
}

interface AdminConfigTokenInput {
  auto_refresh?: unknown;
  refresh_interval_hours?: unknown;
  fail_threshold?: unknown;
  save_delay_ms?: unknown;
  reload_interval_sec?: unknown;
}

interface AdminConfigCacheInput {
  enable_auto_clean?: unknown;
  limit_mb?: unknown;
  keep_base64_cache?: unknown;
}

interface AdminConfigPerformanceInput {
  assets_max_concurrent?: unknown;
  media_max_concurrent?: unknown;
  usage_max_concurrent?: unknown;
  assets_delete_batch_size?: unknown;
  admin_assets_batch_size?: unknown;
}

interface AdminConfigInput {
  app?: AdminConfigAppInput;
  grok?: AdminConfigGrokInput;
  token?: AdminConfigTokenInput;
  cache?: AdminConfigCacheInput;
  performance?: AdminConfigPerformanceInput;
}

interface AdminTokenPoolItemInput {
  token?: unknown;
  status?: unknown;
  quota?: unknown;
  heavy_quota?: unknown;
  note?: unknown;
}

interface AdminTokensRefreshBody {
  token?: unknown;
  tokens?: unknown;
}

interface AdminTokenRateLimitTestBody {
  token?: unknown;
  token_type?: unknown;
  model?: unknown;
}

interface AdminTokenTestBody {
  token?: unknown;
  token_type?: unknown;
  model?: unknown;
}

interface AdminCacheBody {
  type?: unknown;
  name?: unknown;
}

interface AdminApiKeyLimitsInput {
  chat_per_day?: unknown;
  chat_limit?: unknown;
  heavy_per_day?: unknown;
  heavy_limit?: unknown;
  image_per_day?: unknown;
  image_limit?: unknown;
  video_per_day?: unknown;
  video_limit?: unknown;
}

interface AdminApiKeyCreateBody {
  name?: unknown;
  key?: unknown;
  limits?: unknown;
  is_active?: unknown;
}

interface AdminApiKeyUpdateBody {
  key?: unknown;
  name?: unknown;
  is_active?: unknown;
  limits?: unknown;
}

interface AdminApiKeyDeleteBody {
  key?: unknown;
}

function getRemainingTokens(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  const value = payload["remainingTokens"];
  return typeof value === "number" ? value : null;
}

function buildTokenCookie(token: string, cf: string): string {
  return cf ? `sso-rw=${token};sso=${token};${cf}` : `sso-rw=${token};sso=${token}`;
}

function isChatModel(modelId: string): boolean {
  const cfg = MODEL_CONFIG[modelId];
  if (!cfg) return false;
  return !cfg.is_image_model && !cfg.is_video_model;
}

function normalizeUpstreamResultText(raw: string): unknown {
  const text = raw.trim();
  if (!text) return "";
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // ignore
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";

  const parsed: unknown[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line) as unknown);
    } catch {
      return text;
    }
  }
  return parsed.length ? parsed : text;
}

async function parseUpstreamResult(upstream: Response): Promise<unknown> {
  const raw = await upstream.text().catch(() => "");
  if (!raw) return "";
  return normalizeUpstreamResultText(raw);
}

interface TokenQuotaRefreshResult {
  success: boolean;
  remaining_queries?: number;
  heavy_remaining_queries?: number;
  error?: string;
}

async function refreshTokenQuotaForAdminTest(args: {
  env: Env;
  settings: Awaited<ReturnType<typeof getSettings>>;
  token: string;
  tokenType: "sso" | "ssoSuper";
}): Promise<TokenQuotaRefreshResult> {
  const { env, settings, token, tokenType } = args;
  try {
    const cf = normalizeCfCookie(settings.grok.cf_clearance ?? "");
    const cookie = buildTokenCookie(token, cf);
    const ratePayload = await checkRateLimits(cookie, settings.grok, "grok-4-fast");
    const remaining = getRemainingTokens(ratePayload);
    if (typeof remaining !== "number") {
      return { success: false, error: "刷新失败：无法读取 chat 剩余额度" };
    }

    let heavyRemaining: number | undefined;
    if (tokenType === "ssoSuper") {
      const heavyPayload = await checkRateLimits(cookie, settings.grok, "grok-4-heavy");
      const heavy = getRemainingTokens(heavyPayload);
      if (typeof heavy === "number") heavyRemaining = heavy;
    }

    await updateTokenLimits(env.DB, token, {
      remaining_queries: remaining,
      ...(typeof heavyRemaining === "number" ? { heavy_remaining_queries: heavyRemaining } : {}),
    });

    return {
      success: true,
      remaining_queries: remaining,
      ...(typeof heavyRemaining === "number" ? { heavy_remaining_queries: heavyRemaining } : {}),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function verifyWsApiKeyForImagine(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const settings = await getSettings(c.env);
  const globalKey = String(settings.grok.api_key ?? "").trim();
  const token = String(c.req.query("api_key") ?? "").trim();

  if (token) {
    if (globalKey && token === globalKey) return true;
    const keyInfo = await validateApiKey(c.env.DB, token);
    return Boolean(keyInfo);
  }

  if (globalKey) return false;
  const row = await dbFirst<{ c: number }>(
    c.env.DB,
    "SELECT COUNT(1) as c FROM api_keys WHERE is_active = 1",
  );
  return (row?.c ?? 0) === 0;
}

export const adminRoutes = new Hono<{ Bindings: Env }>();

// ============================================================================
// Legacy-compatible Admin API (/api/v1/admin/*)
// Used by the Vue SPA admin pages.
// ============================================================================

function legacyOk(data: Record<string, unknown> = {}): Record<string, unknown> {
  return { status: "success", ...data };
}

function legacyErr(message: string): Record<string, unknown> {
  return { status: "error", error: message };
}

function toPoolName(tokenType: "sso" | "ssoSuper"): "ssoBasic" | "ssoSuper" {
  return tokenType === "ssoSuper" ? "ssoSuper" : "ssoBasic";
}

function poolToTokenType(pool: string): "sso" | "ssoSuper" | null {
  if (pool === "ssoSuper") return "ssoSuper";
  if (pool === "ssoBasic") return "sso";
  return null;
}

async function getKvStats(db: Env["DB"]): Promise<{
  image: { count: number; size_bytes: number; size_mb: number };
  video: { count: number; size_bytes: number; size_mb: number };
}> {
  const rows = await dbAll<{ type: CacheType; count: number; bytes: number }>(
    db,
    "SELECT type as type, COUNT(1) as count, COALESCE(SUM(size),0) as bytes FROM kv_cache GROUP BY type",
  );
  let imageCount = 0;
  let videoCount = 0;
  let imageBytes = 0;
  let videoBytes = 0;
  for (const r of rows) {
    if (r.type === "image") {
      imageCount = r.count;
      imageBytes = r.bytes;
    }
    if (r.type === "video") {
      videoCount = r.count;
      videoBytes = r.bytes;
    }
  }
  const toMb = (b: number) => Math.round((b / (1024 * 1024)) * 10) / 10;
  return {
    image: { count: imageCount, size_bytes: imageBytes, size_mb: toMb(imageBytes) },
    video: { count: videoCount, size_bytes: videoBytes, size_mb: toMb(videoBytes) },
  };
}

adminRoutes.post("/api/v1/admin/login", async (c) => {
  try {
    const body = (await c.req.json()) as { username?: string; password?: string };
    const settings = await getSettings(c.env);
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "").trim();

    const ok = await verifyAdminPasswordFromSettings({ env: c.env, username, password, settings });
    if (!ok) {
      clearAdminSessionCookie(c);
      return c.json(legacyErr("Invalid username or password"), 401);
    }

    const session = await createAdminSession(c.env.DB);
    setAdminSessionCookie(c, session.token);
    return c.json({ success: true, expires_at: session.expiresAt });
  } catch (e) {
    return c.json(legacyErr(`Login error: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.get("/api/v1/admin/session", requireAdminAuth, async (c) => {
  return c.json({ success: true });
});

adminRoutes.post("/api/v1/admin/logout", async (c) => {
  try {
    const token = getAdminSessionCookie(c);
    if (token) {
      await deleteAdminSession(c.env.DB, token);
    }
    clearAdminSessionCookie(c);
    return c.json({ success: true });
  } catch (e) {
    clearAdminSessionCookie(c);
    return c.json(jsonError(`Logout failed: ${e instanceof Error ? e.message : String(e)}`, "LOGOUT_ERROR"), 500);
  }
});

adminRoutes.get("/api/v1/admin/storage", requireAdminAuth, async (c) => {
  return c.json({ type: "d1" });
});

adminRoutes.get("/api/v1/admin/config", requireAdminAuth, async (c) => {
  try {
    const settings = await getSettings(c.env);
    const filterTags = String(settings.grok.filtered_tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return c.json({
      app: {
        api_key: settings.grok.api_key ?? "",
        admin_username: settings.global.admin_username ?? "admin",
        app_key: settings.global.admin_password ?? "",
        app_url: settings.global.base_url ?? "",
        image_format: settings.global.image_mode ?? "url",
        video_format: "url",
      },
      grok: {
        temporary: Boolean(settings.grok.temporary),
        stream: true,
        thinking: Boolean(settings.grok.show_thinking),
        dynamic_statsig: Boolean(settings.grok.dynamic_statsig),
        filter_tags: filterTags,
        video_poster_preview: Boolean(settings.grok.video_poster_preview),
        timeout: Number(settings.grok.stream_total_timeout ?? 600),
        base_proxy_url: String(settings.grok.proxy_url ?? ""),
        asset_proxy_url: String(settings.grok.cache_proxy_url ?? ""),
        cf_clearance: String(settings.grok.cf_clearance ?? ""),
        max_retry: 3,
        retry_status_codes: Array.isArray(settings.grok.retry_status_codes) ? settings.grok.retry_status_codes : [401, 429, 403],
        image_generation_method: normalizeImageGenerationMethod(
          settings.grok.image_generation_method,
        ),
      },
      token: {
        auto_refresh: Boolean(settings.token.auto_refresh),
        refresh_interval_hours: Number(settings.token.refresh_interval_hours ?? 8),
        fail_threshold: Number(settings.token.fail_threshold ?? 5),
        save_delay_ms: Number(settings.token.save_delay_ms ?? 500),
        reload_interval_sec: Number(settings.token.reload_interval_sec ?? 30),
      },
      cache: {
        enable_auto_clean: Boolean(settings.cache.enable_auto_clean),
        limit_mb: Number(settings.cache.limit_mb ?? 1024),
        keep_base64_cache: Boolean(settings.cache.keep_base64_cache),
      },
      performance: {
        assets_max_concurrent: Number(settings.performance.assets_max_concurrent ?? 25),
        media_max_concurrent: Number(settings.performance.media_max_concurrent ?? 50),
        usage_max_concurrent: Number(settings.performance.usage_max_concurrent ?? 25),
        assets_delete_batch_size: Number(settings.performance.assets_delete_batch_size ?? 10),
        admin_assets_batch_size: Number(settings.performance.admin_assets_batch_size ?? 10),
      },
    });
  } catch (e) {
    return c.json(legacyErr(`Get config failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.post("/api/v1/admin/config", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as AdminConfigInput;
    const appCfg = body.app;
    const grokCfg = body.grok;
    const tokenCfg = body.token;
    const cacheCfg = body.cache;
    const performanceCfg = body.performance;

    const global_config: GlobalSettings = {};
    const grok_config: GrokSettings = {};
    const token_config: TokenSettings = {};
    const cache_config: CacheSettings = {};
    const performance_config: PerformanceSettings = {};

    if (appCfg) {
      if (typeof appCfg.api_key === "string") grok_config.api_key = appCfg.api_key.trim();
      if (typeof appCfg.admin_username === "string") global_config.admin_username = appCfg.admin_username.trim() || "admin";
      if (typeof appCfg.app_key === "string") {
        const password = appCfg.app_key.trim();
        if (password && password !== PASSWORD_MASK) {
          const hashed = await hashPassword(password);
          global_config.admin_password = "";
          global_config.admin_password_hash = hashed.hash;
          global_config.admin_password_salt = hashed.salt;
          global_config.admin_password_iter = hashed.iter;
        }
      }
      if (typeof appCfg.app_url === "string") global_config.base_url = appCfg.app_url.trim();
      if (appCfg.image_format === "url" || appCfg.image_format === "base64" || appCfg.image_format === "b64_json")
        global_config.image_mode = appCfg.image_format;
    }

    if (grokCfg) {
      if (typeof grokCfg.base_proxy_url === "string") grok_config.proxy_url = grokCfg.base_proxy_url.trim();
      if (typeof grokCfg.asset_proxy_url === "string") grok_config.cache_proxy_url = grokCfg.asset_proxy_url.trim();
      if (typeof grokCfg.cf_clearance === "string") grok_config.cf_clearance = grokCfg.cf_clearance.trim();
      if (typeof grokCfg.filter_tags === "string") {
        grok_config.filtered_tags = grokCfg.filter_tags;
      } else if (Array.isArray(grokCfg.filter_tags)) {
        grok_config.filtered_tags = grokCfg.filter_tags
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .join(",");
      }
      if (typeof grokCfg.dynamic_statsig === "boolean") grok_config.dynamic_statsig = grokCfg.dynamic_statsig;
      if (typeof grokCfg.thinking === "boolean") grok_config.show_thinking = grokCfg.thinking;
      if (typeof grokCfg.temporary === "boolean") grok_config.temporary = grokCfg.temporary;
      if (typeof grokCfg.video_poster_preview === "boolean") grok_config.video_poster_preview = grokCfg.video_poster_preview;
      if (Array.isArray(grokCfg.retry_status_codes))
        grok_config.retry_status_codes = grokCfg.retry_status_codes
          .map((x) => Number(x))
          .filter((n): n is number => Number.isFinite(n));
      if (Number.isFinite(Number(grokCfg.timeout)))
        grok_config.stream_total_timeout = Math.max(1, Math.floor(Number(grokCfg.timeout)));
      if (typeof grokCfg.image_generation_method === "string" && grokCfg.image_generation_method.trim()) {
        grok_config.image_generation_method = normalizeImageGenerationMethod(
          grokCfg.image_generation_method,
        );
      }
    }

    if (tokenCfg) {
      if (typeof tokenCfg.auto_refresh === "boolean") token_config.auto_refresh = tokenCfg.auto_refresh;
      if (Number.isFinite(Number(tokenCfg.refresh_interval_hours)))
        token_config.refresh_interval_hours = Math.max(1, Number(tokenCfg.refresh_interval_hours));
      if (Number.isFinite(Number(tokenCfg.fail_threshold)))
        token_config.fail_threshold = Math.max(1, Math.floor(Number(tokenCfg.fail_threshold)));
      if (Number.isFinite(Number(tokenCfg.save_delay_ms)))
        token_config.save_delay_ms = Math.max(0, Math.floor(Number(tokenCfg.save_delay_ms)));
      if (Number.isFinite(Number(tokenCfg.reload_interval_sec)))
        token_config.reload_interval_sec = Math.max(0, Math.floor(Number(tokenCfg.reload_interval_sec)));
    }

    if (cacheCfg) {
      if (typeof cacheCfg.enable_auto_clean === "boolean") cache_config.enable_auto_clean = cacheCfg.enable_auto_clean;
      if (Number.isFinite(Number(cacheCfg.limit_mb))) cache_config.limit_mb = Math.max(1, Math.floor(Number(cacheCfg.limit_mb)));
      if (typeof cacheCfg.keep_base64_cache === "boolean") cache_config.keep_base64_cache = cacheCfg.keep_base64_cache;
    }

    if (performanceCfg) {
      const assetsMaxConcurrent = parseFiniteNumber(performanceCfg.assets_max_concurrent);
      if (assetsMaxConcurrent !== null) performance_config.assets_max_concurrent = Math.max(1, Math.floor(assetsMaxConcurrent));
      const mediaMaxConcurrent = parseFiniteNumber(performanceCfg.media_max_concurrent);
      if (mediaMaxConcurrent !== null) performance_config.media_max_concurrent = Math.max(1, Math.floor(mediaMaxConcurrent));
      const usageMaxConcurrent = parseFiniteNumber(performanceCfg.usage_max_concurrent);
      if (usageMaxConcurrent !== null) performance_config.usage_max_concurrent = Math.max(1, Math.floor(usageMaxConcurrent));
      const assetsDeleteBatchSize = parseFiniteNumber(performanceCfg.assets_delete_batch_size);
      if (assetsDeleteBatchSize !== null) performance_config.assets_delete_batch_size = Math.max(1, Math.floor(assetsDeleteBatchSize));
      const adminAssetsBatchSize = parseFiniteNumber(performanceCfg.admin_assets_batch_size);
      if (adminAssetsBatchSize !== null) performance_config.admin_assets_batch_size = Math.max(1, Math.floor(adminAssetsBatchSize));
    }

    await saveSettings(c.env, { global_config, grok_config, token_config, cache_config, performance_config });
    return c.json(legacyOk({ message: "配置已更新" }));
  } catch (e) {
    return c.json(legacyErr(`Update config failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.get("/api/v1/admin/imagine/ws", async (c) => {
  const upgrade = c.req.header("upgrade") ?? c.req.header("Upgrade");
  if (String(upgrade ?? "").toLowerCase() !== "websocket") {
    return c.text("Expected websocket upgrade", 426);
  }

  const wsPair = new WebSocketPair();
  const client = wsPair[0];
  const server = wsPair[1];
  server.accept();

  const authed = await verifyWsApiKeyForImagine(c);
  if (!authed) {
    try {
      server.close(1008, "Auth failed");
    } catch {
      // ignore close failure
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  const settings = await getSettings(c.env);
  const cf = normalizeCfCookie(settings.grok.cf_clearance ?? "");

  let socketClosed = false;
  let runToken = 0;
  let currentRunId = "";
  let sequence = 0;
  let running = false;

  const send = (payload: Record<string, unknown>): boolean => {
    if (socketClosed) return false;
    try {
      server.send(JSON.stringify(payload));
      return true;
    } catch {
      socketClosed = true;
      return false;
    }
  };

  const stopRun = (sendStatus: boolean): void => {
    if (!running) return;
    running = false;
    runToken += 1;
    if (sendStatus && currentRunId) {
      send({ type: "status", status: "stopped", run_id: currentRunId });
    }
  };

  const startRun = (prompt: string, aspectRatio: string): void => {
    runToken += 1;
    const localToken = runToken;
    running = true;
    currentRunId = crypto.randomUUID().replaceAll("-", "");
    const runId = currentRunId;
    sequence = 0;

    send({
      type: "status",
      status: "running",
      prompt,
      aspect_ratio: aspectRatio,
      run_id: runId,
    });

    void (async () => {
      while (!socketClosed && localToken === runToken) {
        let chosen: { token: string; token_type: "sso" | "ssoSuper" } | null = null;
        try {
          chosen = await selectBestToken(c.env.DB, "grok-imagine-1.0");
          if (!chosen) {
            send({
              type: "error",
              message: "No available tokens. Please try again later.",
              code: "rate_limit_exceeded",
            });
            await wsSleep(2000);
            continue;
          }

          const cookie = cf
            ? `sso-rw=${chosen.token};sso=${chosen.token};${cf}`
            : `sso-rw=${chosen.token};sso=${chosen.token}`;
          const startAt = Date.now();
          const urls = await generateImagineWs({
            prompt,
            n: 6,
            cookie,
            settings: settings.grok,
            aspectRatio,
          });
          if (socketClosed || localToken !== runToken) break;

          const elapsedMs = Date.now() - startAt;
          let sentAny = false;
          for (const rawUrl of urls) {
            const raw = String(rawUrl ?? "").trim();
            if (!raw) continue;
            sentAny = true;
            sequence += 1;
            const encoded = encodeAssetPath(raw);
            const url = `/images/${encodeURIComponent(encoded)}`;
            const ok = send({
              type: "image",
              url,
              sequence,
              created_at: Date.now(),
              elapsed_ms: elapsedMs,
              aspect_ratio: aspectRatio,
              run_id: runId,
            });
            if (!ok) {
              socketClosed = true;
              break;
            }
          }

          if (!sentAny) {
            send({
              type: "error",
              message: "Image generation returned empty data.",
              code: "empty_image",
            });
          }
        } catch (e) {
          if (socketClosed || localToken !== runToken) break;
          const message = e instanceof Error ? e.message : String(e);
          if (chosen?.token) {
            const status = parseImagineWsFailureStatus(message);
            const trimmed = message.slice(0, 200);
            try {
              await recordTokenFailure(c.env.DB, chosen.token, status, trimmed);
              await applyCooldown(c.env.DB, chosen.token, status);
            } catch {
              // ignore token cooldown failures
            }
          }
          send({
            type: "error",
            message: message || "Internal error",
            code: "internal_error",
          });
          await wsSleep(1500);
        }
      }

      if (!socketClosed && localToken === runToken) {
        running = false;
        send({ type: "status", status: "stopped", run_id: runId });
      }
    })();
  };

  server.addEventListener("message", (event) => {
    const payload = parseWsMessageData(event.data);
    if (!payload) {
      send({
        type: "error",
        message: "Invalid message format.",
        code: "invalid_payload",
      });
      return;
    }

    const msgType = String(payload.type ?? "").trim();
    if (msgType === "start") {
      const prompt = String(payload.prompt ?? "").trim();
      if (!prompt) {
        send({
          type: "error",
          message: "Prompt cannot be empty.",
          code: "empty_prompt",
        });
        return;
      }
      const ratio = resolveAspectRatio(String(payload.aspect_ratio ?? "2:3").trim());
      stopRun(false);
      startRun(prompt, ratio);
      return;
    }

    if (msgType === "stop") {
      stopRun(true);
      return;
    }

    if (msgType === "ping") {
      send({ type: "pong" });
      return;
    }

    send({
      type: "error",
      message: "Unknown command.",
      code: "unknown_command",
    });
  });

  server.addEventListener("close", () => {
    socketClosed = true;
    runToken += 1;
    running = false;
  });
  server.addEventListener("error", () => {
    socketClosed = true;
    runToken += 1;
    running = false;
  });

  return new Response(null, { status: 101, webSocket: client });
});

adminRoutes.get("/api/v1/admin/models/chat", requireAdminAuth, async (c) => {
  const ts = Math.floor(Date.now() / 1000);
  const data = Object.entries(MODEL_CONFIG)
    .filter(([id]) => isChatModel(id))
    .map(([id, cfg]) => ({
      id,
      object: "model",
      created: ts,
      owned_by: "x-ai",
      display_name: cfg.display_name,
      description: cfg.description,
    }));
  return c.json({ object: "list", data });
});

adminRoutes.get("/api/v1/admin/tokens", requireAdminAuth, async (c) => {
  try {
    const rows = await listTokens(c.env.DB);
    const now = nowMs();

    const out: Record<"ssoBasic" | "ssoSuper", Array<Record<string, unknown>>> = {
      ssoBasic: [],
      ssoSuper: [],
    };
    for (const r of rows) {
      const pool = toPoolName(r.token_type);
      const isCooling = Boolean(r.cooldown_until && r.cooldown_until > now);
      const status = r.status === "expired" ? "invalid" : isCooling ? "cooling" : "active";
      const quotaKnown = Number.isFinite(r.remaining_queries) && r.remaining_queries >= 0;
      const quota = quotaKnown ? r.remaining_queries : -1;
      const heavyQuotaKnown =
        r.token_type === "ssoSuper" && Number.isFinite(r.heavy_remaining_queries) && r.heavy_remaining_queries >= 0;
      const heavyQuota = heavyQuotaKnown ? r.heavy_remaining_queries : -1;
      out[pool].push({
        token: `sso=${r.token}`,
        status,
        quota,
        quota_known: quotaKnown,
        heavy_quota: heavyQuota,
        heavy_quota_known: heavyQuotaKnown,
        token_type: r.token_type,
        note: r.note ?? "",
        fail_count: r.failed_count ?? 0,
        use_count: 0,
      });
    }
    return c.json(out);
  } catch (e) {
    return c.json(legacyErr(`Get tokens failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.post("/api/v1/admin/tokens", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object") return c.json(legacyErr("Invalid payload"), 400);

    const rows = await listTokens(c.env.DB);
    const byType: Record<"sso" | "ssoSuper", Set<string>> = { sso: new Set(), ssoSuper: new Set() };
    for (const r of rows) byType[r.token_type].add(r.token);
    const existingAll = new Set<string>(rows.map((r) => r.token));
    const newlyAdded: string[] = [];

    const now = nowMs();
    const desiredByType: Record<"sso" | "ssoSuper", Set<string>> = { sso: new Set(), ssoSuper: new Set() };
    const stmts: D1PreparedStatement[] = [];

    for (const [pool, items] of Object.entries(body)) {
      const tokenType = poolToTokenType(pool);
      if (!tokenType) continue;
      const arr = Array.isArray(items) ? items : [];
      for (const it of arr) {
        const item =
          it && typeof it === "object" && !Array.isArray(it)
            ? (it as AdminTokenPoolItemInput)
            : null;
        const tokenRaw = typeof it === "string" ? it : item?.token;
        const token = normalizeSsoToken(String(tokenRaw ?? ""));
        if (!token) continue;
        desiredByType[tokenType].add(token);
        if (!existingAll.has(token)) {
          existingAll.add(token);
          newlyAdded.push(token);
        }

        const statusRaw = typeof it === "string" ? "active" : String(item?.status ?? "active");
        const quotaRaw = typeof it === "string" ? 0 : Number(item?.quota ?? 0);
        const quota = Number.isFinite(quotaRaw) && quotaRaw >= 0 ? Math.floor(quotaRaw) : -1;
        const heavyQuotaRaw =
          typeof it === "string"
            ? -1
            : Number(item?.heavy_quota ?? (tokenType === "ssoSuper" ? quota : -1));
        const heavyQuota = Number.isFinite(heavyQuotaRaw) && heavyQuotaRaw >= 0 ? Math.floor(heavyQuotaRaw) : -1;
        const note = typeof it === "string" ? "" : String(item?.note ?? "");

        const status = statusRaw === "invalid" ? "expired" : "active";
        const cooldownUntil = statusRaw === "cooling" ? now + 60 * 60 * 1000 : null;

        const remaining = quota >= 0 ? quota : -1;
        const heavy = tokenType === "ssoSuper" ? heavyQuota : -1;

        stmts.push(
          c.env.DB.prepare(
            "INSERT INTO tokens(token, token_type, created_time, remaining_queries, heavy_remaining_queries, status, failed_count, cooldown_until, last_failure_time, last_failure_reason, tags, note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET token_type=excluded.token_type, remaining_queries=excluded.remaining_queries, heavy_remaining_queries=excluded.heavy_remaining_queries, status=excluded.status, cooldown_until=excluded.cooldown_until, note=excluded.note",
          ).bind(token, tokenType, now, remaining, heavy, status, 0, cooldownUntil, null, null, "[]", note),
        );
      }
    }

    // Delete tokens removed from the posted pools
    for (const tokenType of ["sso", "ssoSuper"] as const) {
      const existing = byType[tokenType];
      const desired = desiredByType[tokenType];
      const toDel: string[] = [];
      for (const t of existing) if (!desired.has(t)) toDel.push(t);
      if (toDel.length) {
        const placeholders = toDel.map(() => "?").join(",");
        stmts.push(c.env.DB.prepare(`DELETE FROM tokens WHERE token_type = ? AND token IN (${placeholders})`).bind(tokenType, ...toDel));
      }
    }

    if (stmts.length) await c.env.DB.batch(stmts);
    return c.json(legacyOk({ message: "Token 已更新" }));
  } catch (e) {
    return c.json(legacyErr(`Update tokens failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.post("/api/v1/admin/tokens/refresh", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as AdminTokensRefreshBody;
    const tokens: string[] = [];
    if (typeof body.token === "string") tokens.push(body.token);
    if (Array.isArray(body.tokens)) tokens.push(...body.tokens.filter((x): x is string => typeof x === "string"));
    const unique = [...new Set(tokens.map((t) => normalizeSsoToken(t)).filter(Boolean))];
    if (!unique.length) return c.json(legacyErr("No tokens provided"), 400);

    const settings = await getSettings(c.env);

    const placeholders = unique.map(() => "?").join(",");
    const typeRows = placeholders
      ? await dbAll<{ token: string; token_type: string }>(
          c.env.DB,
          `SELECT token, token_type FROM tokens WHERE token IN (${placeholders})`,
          unique,
        )
      : [];
    const tokenTypeByToken = new Map(typeRows.map((r) => [r.token, r.token_type]));

    const results: Record<string, boolean> = {};
    for (const t of unique) {
      try {
        const tokenType = tokenTypeByToken.get(t) === "ssoSuper" ? "ssoSuper" : "sso";
        const refreshed = await refreshTokenQuotaForAdminTest({
          env: c.env,
          settings,
          token: t,
          tokenType,
        });
        results[`sso=${t}`] = refreshed.success;
      } catch {
        results[`sso=${t}`] = false;
      }
      await new Promise((res) => setTimeout(res, 50));
    }

    return c.json(legacyOk({ results }));
  } catch (e) {
    return c.json(legacyErr(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.post("/api/v1/admin/tokens/rate-limit-test", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as AdminTokenRateLimitTestBody;
    const token_type = validateTokenType(String(body.token_type ?? ""));
    const token = normalizeSsoToken(String(body.token ?? ""));
    const model = String(body.model ?? "").trim();

    if (!token) return c.json(legacyErr("Token 不能为空"), 400);
    if (!model) return c.json(legacyErr("模型不能为空"), 400);

    const tokenRow = await dbFirst<{ status: string }>(
      c.env.DB,
      "SELECT status FROM tokens WHERE token = ? AND token_type = ?",
      [token, token_type],
    );
    if (!tokenRow) return c.json(legacyErr("Token 不存在"), 404);

    const settings = await getSettings(c.env);
    const cf = normalizeCfCookie(settings.grok.cf_clearance ?? "");
    const cookie = buildTokenCookie(token, cf);

    const ratePayload = await checkRateLimits(cookie, settings.grok, model);
    const remaining = getRemainingTokens(ratePayload);

    return c.json(legacyOk({
      model,
      remaining_queries: typeof remaining === "number" ? remaining : null,
      raw_response: ratePayload,
    }));
  } catch (e) {
    return c.json(legacyErr(`查询失败：${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.post("/api/v1/admin/tokens/test", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as AdminTokenTestBody;
    const token_type = validateTokenType(String(body.token_type ?? ""));
    const token = normalizeSsoToken(String(body.token ?? ""));
    const model = String(body.model ?? "").trim();

    if (!token) return c.json(legacyErr("Token 不能为空"), 400);
    if (!model) return c.json(legacyErr("测试模型不能为空"), 400);
    if (!isChatModel(model)) return c.json(legacyErr("测试模型必须为聊天模型"), 400);

    const tokenRow = await dbFirst<{ status: string }>(
      c.env.DB,
      "SELECT status FROM tokens WHERE token = ? AND token_type = ?",
      [token, token_type],
    );
    if (!tokenRow) return c.json(legacyErr("Token 不存在"), 404);

    const settings = await getSettings(c.env);
    const cf = normalizeCfCookie(settings.grok.cf_clearance ?? "");
    const cookie = buildTokenCookie(token, cf);

    const { payload, referer } = buildConversationPayload({
      requestModel: model,
      content: "hi",
      imgIds: [],
      imgUris: [],
      settings: settings.grok,
    });

    const upstream = await sendConversationRequest({
      payload,
      cookie,
      settings: settings.grok,
      ...(referer ? { referer } : {}),
    });
    const upstreamStatus = upstream.status;
    let result: unknown = "";
    let converted = false;
    if (upstreamStatus === 200) {
      const upstreamClone = upstream.clone();
      try {
        const origin = new URL(c.req.url).origin;
        result = await parseOpenAiFromGrokNdjson(upstream, {
          cookie,
          settings: settings.grok,
          global: settings.global,
          origin,
          requestedModel: model,
        });
        converted = true;
      } catch {
        result = await parseUpstreamResult(upstreamClone);
      }
    } else {
      result = await parseUpstreamResult(upstream);
    }

    let reactivated = false;
    let quotaRefresh: TokenQuotaRefreshResult = {
      success: false,
      error: "未触发用量刷新",
    };

    if (upstreamStatus === 200) {
      if (tokenRow.status === "expired") {
        reactivated = await reactivateToken(c.env.DB, token, token_type);
      }
      quotaRefresh = await refreshTokenQuotaForAdminTest({
        env: c.env,
        settings,
        token,
        tokenType: token_type,
      });
    }

    return c.json({
      success: upstreamStatus === 200 && converted,
      upstream_status: upstreamStatus,
      result,
      reactivated,
      quota_refresh: quotaRefresh,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json(
      {
        success: false,
        upstream_status: 500,
        result: { error: message },
        reactivated: false,
        quota_refresh: { success: false, error: "未触发用量刷新" },
      },
      500,
    );
  }
});

adminRoutes.get("/api/v1/admin/cache/local", requireAdminAuth, async (c) => {
  try {
    const stats = await getKvStats(c.env.DB);
    return c.json({ local_image: stats.image, local_video: stats.video });
  } catch (e) {
    return c.json(legacyErr(`Get cache stats failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.get("/api/v1/admin/cache", requireAdminAuth, async (c) => {
  try {
    const stats = await getKvStats(c.env.DB);
    return c.json({
      local_image: stats.image,
      local_video: stats.video,
      online: { count: 0, status: "not_loaded", token: null, last_asset_clear_at: null },
      online_accounts: [],
      online_scope: "none",
      online_details: [],
    });
  } catch (e) {
    return c.json(legacyErr(`Get cache failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.post("/api/v1/admin/cache/clear", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as AdminCacheBody;
    const t = String(body?.type ?? "image").toLowerCase();
    const type: CacheType = t === "video" ? "video" : "image";
    const deleted = await clearKvCacheByType(c.env, type);
    return c.json(legacyOk({ result: { deleted } }));
  } catch (e) {
    return c.json(legacyErr(`Clear cache failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.get("/api/v1/admin/cache/list", requireAdminAuth, async (c) => {
  try {
    const t = String(c.req.query("type") ?? "image").toLowerCase();
    const type: CacheType = t === "video" ? "video" : "image";
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const pageSize = Math.max(1, Math.min(5000, Number(c.req.query("page_size") ?? 1000)));
    const offset = (page - 1) * pageSize;

    const { total, items } = await listCacheRowsByType(c.env.DB, type, pageSize, offset);
    const mapped = items.map((it) => {
      const name = it.key.startsWith(`${type}/`) ? it.key.slice(type.length + 1) : it.key;
      return {
        name,
        size_bytes: it.size,
        mtime_ms: it.last_access_at || it.created_at,
        preview_url: type === "image" ? `/images/${encodeURIComponent(name)}` : "",
      };
    });

    return c.json(legacyOk({ total, page, page_size: pageSize, items: mapped }));
  } catch (e) {
    return c.json(legacyErr(`List cache failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.post("/api/v1/admin/cache/item/delete", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as AdminCacheBody;
    const t = String(body?.type ?? "image").toLowerCase();
    const type: CacheType = t === "video" ? "video" : "image";
    const name = String(body?.name ?? "").trim();
    if (!name) return c.json(legacyErr("Missing file name"), 400);
    const key = name.startsWith(`${type}/`) ? name : `${type}/${name}`;
    await c.env.KV_CACHE.delete(key);
    await dbRun(c.env.DB, "DELETE FROM kv_cache WHERE key = ?", [key]);
    return c.json(legacyOk({ result: { deleted: true } }));
  } catch (e) {
    return c.json(legacyErr(`Delete failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.post("/api/v1/admin/cache/online/clear", requireAdminAuth, async (c) => {
  return c.json(legacyErr("Online assets clear is not supported on Cloudflare Workers"), 501);
});

adminRoutes.get("/api/v1/admin/metrics", requireAdminAuth, async (c) => {
  try {
    const now = nowMs();
    const rows = await listTokens(c.env.DB);
    let total = 0;
    let active = 0;
    let cooling = 0;
    let expired = 0;
    let chatQuota = 0;
    for (const t of rows) {
      total += 1;
      if (t.status === "expired") {
        expired += 1;
        continue;
      }
      if (t.cooldown_until && t.cooldown_until > now) {
        cooling += 1;
        continue;
      }
      active += 1;
      if (t.remaining_queries > 0) chatQuota += t.remaining_queries;
    }

    const stats = await getKvStats(c.env.DB);
    const reqStats = await getRequestStats(c.env.DB);
    const totalCallsRow = await dbFirst<{ c: number }>(c.env.DB, "SELECT COUNT(1) as c FROM request_logs");
    const totalCalls = totalCallsRow?.c ?? 0;

    return c.json({
      tokens: {
        total,
        active,
        cooling,
        expired,
        disabled: 0,
        chat_quota: chatQuota,
        image_quota: Math.floor(chatQuota / 2),
        total_calls: totalCalls,
      },
      cache: { local_image: stats.image, local_video: stats.video },
      request_stats: reqStats,
    });
  } catch (e) {
    return c.json(legacyErr(`Get metrics failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

adminRoutes.get("/api/v1/admin/logs/files", requireAdminAuth, async (c) => {
  const now = nowMs();
  return c.json({ files: [{ name: "request_logs", size_bytes: 0, mtime_ms: now }] });
});

adminRoutes.get("/api/v1/admin/logs/tail", requireAdminAuth, async (c) => {
  try {
    const file = String(c.req.query("file") ?? "request_logs");
    const limit = Math.max(50, Math.min(5000, Number(c.req.query("lines") ?? 500)));
    const rows = await getRequestLogs(c.env.DB, limit);
    const lines = rows.map((r) => `${r.time} | ${r.status} | ${r.model} | ${r.ip} | ${r.key_name} | ${r.error}`.trim());
    return c.json({ file, lines });
  } catch (e) {
    return c.json(legacyErr(`Tail failed: ${e instanceof Error ? e.message : String(e)}`), 500);
  }
});

// === API Keys (admin UI) ===
function randomKeyName(): string {
  return `key-${crypto.randomUUID().slice(0, 8)}`;
}

adminRoutes.get("/api/v1/admin/keys", requireAdminAuth, async (c) => {
  try {
    const keys = await listApiKeys(c.env.DB);
    const tz = Math.max(-720, Math.min(840, Number(c.env.CACHE_RESET_TZ_OFFSET_MINUTES ?? 480)));
    const day = localDayString(nowMs(), tz);
    const usageRows = await listUsageForDay(c.env.DB, day);
    const usageMap = new Map(usageRows.map((r) => [r.key, r]));
    const lastUsedRows = await listLastUsedByKey(c.env.DB);
    const lastUsedMap = new Map(lastUsedRows.map((r) => [r.key, Number(r.last_used_at)]));

    const data = keys.map((k) => {
      const used: Pick<ApiKeyUsageRow, "chat_used" | "heavy_used" | "image_used" | "video_used"> =
        usageMap.get(k.key) ?? { chat_used: 0, heavy_used: 0, image_used: 0, video_used: 0 };
      const lastUsedAtRaw = lastUsedMap.get(k.key);
      const lastUsedAt =
        typeof lastUsedAtRaw === "number" && Number.isFinite(lastUsedAtRaw) && lastUsedAtRaw > 0
          ? Math.floor(lastUsedAtRaw)
          : null;
      const remaining = {
        chat: k.chat_limit < 0 ? null : Math.max(0, k.chat_limit - Number(used.chat_used ?? 0)),
        heavy: k.heavy_limit < 0 ? null : Math.max(0, k.heavy_limit - Number(used.heavy_used ?? 0)),
        image: k.image_limit < 0 ? null : Math.max(0, k.image_limit - Number(used.image_used ?? 0)),
        video: k.video_limit < 0 ? null : Math.max(0, k.video_limit - Number(used.video_used ?? 0)),
      };
      return {
        ...k,
        is_active: Boolean(k.is_active),
        display_key: displayKey(k.key),
        last_used_at: lastUsedAt,
        usage_today: {
          chat_used: Number(used.chat_used ?? 0),
          heavy_used: Number(used.heavy_used ?? 0),
          image_used: Number(used.image_used ?? 0),
          video_used: Number(used.video_used ?? 0),
        },
        remaining_today: remaining,
      };
    });

    return c.json({ success: true, data });
  } catch (e) {
    return c.json(jsonError(`获取失败: ${e instanceof Error ? e.message : String(e)}`, "ADMIN_KEYS_LIST_ERROR"), 500);
  }
});

adminRoutes.post("/api/v1/admin/keys", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as AdminApiKeyCreateBody;
    const name = String(body?.name ?? "").trim() || randomKeyName();
    const key = String(body?.key ?? "").trim();
    const limits =
      body.limits && typeof body.limits === "object" && !Array.isArray(body.limits)
        ? (body.limits as AdminApiKeyLimitsInput)
        : {};

    const chatLimit = parseOptionalNumber(limits.chat_per_day ?? limits.chat_limit);
    const heavyLimit = parseOptionalNumber(limits.heavy_per_day ?? limits.heavy_limit);
    const imageLimit = parseOptionalNumber(limits.image_per_day ?? limits.image_limit);
    const videoLimit = parseOptionalNumber(limits.video_per_day ?? limits.video_limit);

    const row = await addApiKey(c.env.DB, name, {
      ...(key ? { key } : {}),
      limits: {
        ...(chatLimit !== undefined ? { chat_limit: chatLimit } : {}),
        ...(heavyLimit !== undefined ? { heavy_limit: heavyLimit } : {}),
        ...(imageLimit !== undefined ? { image_limit: imageLimit } : {}),
        ...(videoLimit !== undefined ? { video_limit: videoLimit } : {}),
      },
    });

    const isActive = body?.is_active !== undefined ? Boolean(body.is_active) : true;
    if (!isActive) await updateApiKeyStatus(c.env.DB, row.key, false);

    return c.json({ success: true, data: { ...row, is_active: isActive, display_key: displayKey(row.key) } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE|constraint/i.test(msg)) return c.json(jsonError("Key 已存在", "KEY_EXISTS"), 400);
    return c.json(jsonError(`创建失败: ${msg}`, "ADMIN_KEYS_CREATE_ERROR"), 500);
  }
});

adminRoutes.post("/api/v1/admin/keys/update", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as AdminApiKeyUpdateBody;
    const key = String(body?.key ?? "").trim();
    if (!key) return c.json(jsonError("Missing key", "MISSING_KEY"), 400);
    const existed = await dbFirst<{ key: string }>(c.env.DB, "SELECT key FROM api_keys WHERE key = ?", [key]);
    if (!existed) return c.json(jsonError("Key not found", "NOT_FOUND"), 404);

    if (body?.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (name) await updateApiKeyName(c.env.DB, key, name);
    }

    if (body?.is_active !== undefined) {
      await updateApiKeyStatus(c.env.DB, key, Boolean(body.is_active));
    }

    if (body?.limits && typeof body.limits === "object" && !Array.isArray(body.limits)) {
      const limits = body.limits as AdminApiKeyLimitsInput;
      const chatLimit = parseOptionalNumber(limits.chat_per_day ?? limits.chat_limit);
      const heavyLimit = parseOptionalNumber(limits.heavy_per_day ?? limits.heavy_limit);
      const imageLimit = parseOptionalNumber(limits.image_per_day ?? limits.image_limit);
      const videoLimit = parseOptionalNumber(limits.video_per_day ?? limits.video_limit);
      await updateApiKeyLimits(c.env.DB, key, {
        ...(chatLimit !== undefined ? { chat_limit: chatLimit } : {}),
        ...(heavyLimit !== undefined ? { heavy_limit: heavyLimit } : {}),
        ...(imageLimit !== undefined ? { image_limit: imageLimit } : {}),
        ...(videoLimit !== undefined ? { video_limit: videoLimit } : {}),
      });
    }

    return c.json({ success: true });
  } catch (e) {
    return c.json(jsonError(`更新失败: ${e instanceof Error ? e.message : String(e)}`, "ADMIN_KEYS_UPDATE_ERROR"), 500);
  }
});

adminRoutes.post("/api/v1/admin/keys/delete", requireAdminAuth, async (c) => {
  try {
    const body = (await c.req.json()) as AdminApiKeyDeleteBody;
    const key = String(body?.key ?? "").trim();
    if (!key) return c.json(jsonError("Missing key", "MISSING_KEY"), 400);
    const ok = await deleteApiKey(c.env.DB, key);
    return c.json(ok ? { success: true } : jsonError("Key not found", "NOT_FOUND"), ok ? 200 : 404);
  } catch (e) {
    return c.json(jsonError(`删除失败: ${e instanceof Error ? e.message : String(e)}`, "ADMIN_KEYS_DELETE_ERROR"), 500);
  }
});
