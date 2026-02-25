import type {
  Env,
  TokenUsageRefreshQueueMessage,
  TokenUsageRefreshSource,
} from "../env";
import { dbAll, dbFirst } from "../db";
import {
  getSettings,
  normalizeCfCookie,
  type SettingsBundle,
} from "../settings";
import { checkRateLimits } from "../grok/rateLimits";
import {
  getModelEffortTier,
  listChatModelQuotaTargets,
  toRateLimitModel,
} from "../grok/models";
import { parseQuotaSnapshot } from "../grok/quota-parser";
import { clearTokenInflightAfterRefresh, updateTokenLimits } from "../repo/tokens";
import {
  clearQuotaInflightAfterRefresh,
  cleanupTokenQuotaArtifacts,
  saveTokenQuotaSnapshot,
  tryAcquireQuotaRefreshWindowLock,
  type TokenQuotaSource,
} from "../repo/tokenQuotas";
import { getRefreshProgress, setRefreshProgress } from "../repo/refreshProgress";
import { nowMs } from "../utils/time";

const TOKEN_REFRESH_DELAY_SECONDS = 10;
const TOKEN_REFRESH_DEDUP_WINDOW_MS = 10 * 1000;
const TOKEN_REFRESH_RETRY_DELAY_SECONDS = 20;
const TOKEN_QUOTA_AUDIT_RETENTION_DAYS = 7;
const TOKEN_QUOTA_WINDOW_RETENTION_HOURS = 24;

interface RefreshQuotaResult {
  success: boolean;
  model: string;
  rate_limit_model: string;
  remaining_queries: number | null;
  total_queries: number | null;
  remaining_tokens: number | null;
  total_tokens: number | null;
  low_effort_cost: number | null;
  high_effort_cost: number | null;
  window_size_seconds: number | null;
  raw_response: Record<string, unknown> | null;
  error: string | null;
}

function logTokenRefreshWarn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(...args);
}

function buildTokenCookie(token: string, cf: string): string {
  return cf ? `sso-rw=${token};sso=${token};${cf}` : `sso-rw=${token};sso=${token}`;
}

function isTokenRefreshSource(value: unknown): value is TokenUsageRefreshSource {
  return value === "chat_completions" || value === "image_generations" || value === "image_edits";
}

function normalizeRefreshMessage(raw: unknown): TokenUsageRefreshQueueMessage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const token = typeof rec["token"] === "string" ? rec["token"].trim() : "";
  const source = rec["source"];
  const model = typeof rec["model"] === "string" ? rec["model"].trim() : "";
  const rateLimitModelRaw =
    typeof rec["rate_limit_model"] === "string" ? rec["rate_limit_model"].trim() : "";
  const requestedAtRaw = rec["requested_at"];

  if (!token || !model || !isTokenRefreshSource(source)) {
    return null;
  }

  const requestedAt =
    typeof requestedAtRaw === "number" && Number.isFinite(requestedAtRaw) && requestedAtRaw > 0
      ? Math.floor(requestedAtRaw)
      : nowMs();

  return {
    token,
    source,
    model,
    rate_limit_model: rateLimitModelRaw || toRateLimitModel(model),
    requested_at: requestedAt,
  };
}

function toLegacyTokenLimitPatch(args: {
  model: string;
  rateLimitModel: string;
  tokenType: "sso" | "ssoSuper";
  remainingQueries: number | null;
}): { remaining_queries?: number; heavy_remaining_queries?: number } {
  const remaining = args.remainingQueries;
  if (remaining === null) return {};
  if (
    args.tokenType === "ssoSuper" &&
    (args.model === "grok-4-heavy" || args.rateLimitModel === "grok-4-heavy")
  ) {
    return { heavy_remaining_queries: remaining };
  }
  return { remaining_queries: remaining };
}

async function persistQuotaSnapshot(args: {
  env: Env;
  token: string;
  tokenType: "sso" | "ssoSuper";
  model: string;
  source: TokenQuotaSource;
  payload: Record<string, unknown> | null;
  success: boolean;
  error: string | null;
  atMs: number;
}): Promise<RefreshQuotaResult> {
  const rateLimitModel = toRateLimitModel(args.model);
  const snapshot = parseQuotaSnapshot(args.payload, getModelEffortTier(args.model));
  const canUseQuota =
    snapshot.remaining_queries !== null || snapshot.remaining_tokens !== null;
  const success = args.success && canUseQuota;
  const errorMessage = success ? null : args.error ?? "quota_refresh_failed";

  await saveTokenQuotaSnapshot(args.env.DB, {
    token: args.token,
    rate_limit_model: rateLimitModel,
    remaining_tokens: snapshot.remaining_tokens,
    total_tokens: snapshot.total_tokens,
    remaining_queries: snapshot.remaining_queries,
    total_queries: snapshot.total_queries,
    low_effort_cost: snapshot.low_effort_cost,
    high_effort_cost: snapshot.high_effort_cost,
    window_size_seconds: snapshot.window_size_seconds,
    metric_kind: snapshot.metric_kind,
    source: args.source,
    refreshed_at: args.atMs,
    success,
    last_error: errorMessage ?? "",
    raw_payload: args.payload,
  });

  if (success) {
    await clearQuotaInflightAfterRefresh(args.env.DB, args.token, rateLimitModel);
    const legacyPatch = toLegacyTokenLimitPatch({
      model: args.model,
      rateLimitModel,
      tokenType: args.tokenType,
      remainingQueries: snapshot.remaining_queries,
    });
    await updateTokenLimits(args.env.DB, args.token, legacyPatch);
  }

  return {
    success,
    model: args.model,
    rate_limit_model: rateLimitModel,
    remaining_queries: snapshot.remaining_queries,
    total_queries: snapshot.total_queries,
    remaining_tokens: snapshot.remaining_tokens,
    total_tokens: snapshot.total_tokens,
    low_effort_cost: snapshot.low_effort_cost,
    high_effort_cost: snapshot.high_effort_cost,
    window_size_seconds: snapshot.window_size_seconds,
    raw_response: args.payload,
    error: errorMessage,
  };
}

export async function refreshTokenQuotaForModel(args: {
  env: Env;
  token: string;
  tokenType: "sso" | "ssoSuper";
  model: string;
  source: TokenQuotaSource;
  settings?: SettingsBundle;
}): Promise<RefreshQuotaResult> {
  const settings = args.settings ?? (await getSettings(args.env));
  const now = nowMs();
  const cf = normalizeCfCookie(settings.grok.cf_clearance ?? "");
  const cookie = buildTokenCookie(args.token, cf);

  try {
    const payload = await checkRateLimits(cookie, settings.grok, args.model);
    return persistQuotaSnapshot({
      env: args.env,
      token: args.token,
      tokenType: args.tokenType,
      model: args.model,
      source: args.source,
      payload,
      success: payload !== null,
      error: payload ? null : "rate_limit_api_unavailable",
      atMs: now,
    });
  } catch (errorValue) {
    return persistQuotaSnapshot({
      env: args.env,
      token: args.token,
      tokenType: args.tokenType,
      model: args.model,
      source: args.source,
      payload: null,
      success: false,
      error: errorValue instanceof Error ? errorValue.message : String(errorValue),
      atMs: now,
    });
  }
}

// Legacy helper for existing image/video selection path.
export async function refreshTokenQuota(
  env: Env,
  token: string,
  tokenType: "sso" | "ssoSuper",
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<boolean> {
  const result = await refreshTokenQuotaForModel({
    env,
    token,
    tokenType,
    model: "grok-4-fast",
    source: "auto_refresh",
    settings,
  });
  return result.success;
}

async function tryAcquireRefreshWindowLock(args: {
  env: Env;
  token: string;
  model: string;
  rateLimitModel: string;
  atMs: number;
}): Promise<boolean> {
  return tryAcquireQuotaRefreshWindowLock(
    args.env.DB,
    args.token,
    args.rateLimitModel,
    args.atMs,
    TOKEN_REFRESH_DEDUP_WINDOW_MS,
  );
}

export async function enqueueDelayedTokenRefresh(args: {
  env: Env;
  message: TokenUsageRefreshQueueMessage;
}): Promise<boolean> {
  const queue = args.env.TOKEN_USAGE_REFRESH_QUEUE;
  if (!queue) return false;

  const normalized = normalizeRefreshMessage(args.message);
  if (!normalized) return false;
  const rateLimitModel = normalized.rate_limit_model ?? toRateLimitModel(normalized.model);

  const locked = await tryAcquireRefreshWindowLock({
    env: args.env,
    token: normalized.token,
    model: normalized.model,
    rateLimitModel,
    atMs: nowMs(),
  });
  if (!locked) return false;

  await queue.send(
    {
      ...normalized,
      rate_limit_model: rateLimitModel,
    },
    {
      contentType: "json",
      delaySeconds: TOKEN_REFRESH_DELAY_SECONDS,
    },
  );
  return true;
}

export function scheduleDelayedTokenRefresh(args: {
  env: Env;
  executionCtx: ExecutionContext;
  token: string;
  source: TokenUsageRefreshSource;
  model: string;
  requestedAt?: number;
}): void {
  const token = args.token.trim();
  const model = args.model.trim();
  if (!token || !model) return;

  const requestedAt =
    typeof args.requestedAt === "number" && Number.isFinite(args.requestedAt) && args.requestedAt > 0
      ? Math.floor(args.requestedAt)
      : nowMs();

  args.executionCtx.waitUntil(
    enqueueDelayedTokenRefresh({
      env: args.env,
      message: {
        token,
        source: args.source,
        model,
        rate_limit_model: toRateLimitModel(model),
        requested_at: requestedAt,
      },
    }).catch((error) => {
      logTokenRefreshWarn("token refresh queue enqueue failed:", {
        token_suffix: token.slice(-6),
        source: args.source,
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
}

async function getRefreshableTokenType(
  env: Env,
  token: string,
): Promise<"sso" | "ssoSuper" | null> {
  const row = await dbFirst<{ token_type: string }>(
    env.DB,
    "SELECT token_type FROM tokens WHERE token = ? AND status != 'expired' LIMIT 1",
    [token],
  );
  if (!row) return null;
  if (row.token_type === "sso" || row.token_type === "ssoSuper") return row.token_type;
  return null;
}

export async function consumeTokenRefreshQueueBatch(
  batch: MessageBatch<TokenUsageRefreshQueueMessage>,
  env: Env,
): Promise<void> {
  if (batch.messages.length === 0) return;

  const uniqueMessages = new Map<string, Message<TokenUsageRefreshQueueMessage>>();
  const payloadByKey = new Map<string, TokenUsageRefreshQueueMessage>();

  for (const message of batch.messages) {
    const payload = normalizeRefreshMessage(message.body);
    if (!payload) {
      message.ack();
      continue;
    }
    const rateLimitModel = payload.rate_limit_model ?? toRateLimitModel(payload.model);
    const key = `${payload.token}:${rateLimitModel}`;
    if (uniqueMessages.has(key)) {
      message.ack();
      continue;
    }
    uniqueMessages.set(key, message);
    payloadByKey.set(key, { ...payload, rate_limit_model: rateLimitModel });
  }

  if (uniqueMessages.size === 0) return;
  const settings = await getSettings(env);

  for (const [key, message] of uniqueMessages.entries()) {
    const payload = payloadByKey.get(key);
    if (!payload) {
      message.ack();
      continue;
    }

    try {
      const tokenType = await getRefreshableTokenType(env, payload.token);
      if (!tokenType) {
        message.ack();
        continue;
      }

      const refreshed = await refreshTokenQuotaForModel({
        env,
        token: payload.token,
        tokenType,
        model: payload.model,
        source: "queue",
        settings,
      });
      if (refreshed.success) {
        await clearTokenInflightAfterRefresh(env.DB, payload.token);
        message.ack();
      } else {
        message.retry({ delaySeconds: TOKEN_REFRESH_RETRY_DELAY_SECONDS });
      }
    } catch (error) {
      logTokenRefreshWarn("token refresh queue consume failed:", {
        token_suffix: payload.token.slice(-6),
        source: payload.source,
        model: payload.model,
        error: error instanceof Error ? error.message : String(error),
      });
      message.retry({ delaySeconds: TOKEN_REFRESH_RETRY_DELAY_SECONDS });
    }
  }
}

export async function runTokenAutoRefresh(env: Env): Promise<void> {
  const settings = await getSettings(env);

  if (!settings.token.auto_refresh) {
    return;
  }

  const progress = await getRefreshProgress(env.DB);
  if (progress.running) {
    return;
  }

  const intervalMs = Math.max(1, settings.token.refresh_interval_hours) * 60 * 60 * 1000;
  const now = nowMs();
  if (progress.updated_at > 0 && now - progress.updated_at < intervalMs) {
    return;
  }

  const rows = await dbAll<{ token: string; token_type: "sso" | "ssoSuper" }>(
    env.DB,
    "SELECT token, token_type FROM tokens WHERE status != 'expired'",
  );
  const targets = listChatModelQuotaTargets();

  if (rows.length === 0 || targets.length === 0) {
    return;
  }

  const total = rows.length * targets.length;
  await setRefreshProgress(env.DB, {
    running: true,
    total,
    current: 0,
    success: 0,
    failed: 0,
  });

  let success = 0;
  let failed = 0;
  let current = 0;

  for (const row of rows) {
    for (const target of targets) {
      const result = await refreshTokenQuotaForModel({
        env,
        token: row.token,
        tokenType: row.token_type,
        model: target.model,
        source: "auto_refresh",
        settings,
      });
      if (result.success) {
        success += 1;
      } else {
        failed += 1;
      }
      current += 1;
      if (current % 5 === 0 || current === total) {
        await setRefreshProgress(env.DB, {
          current,
          success,
          failed,
        });
      }
      await new Promise((res) => setTimeout(res, 25));
    }
  }

  await setRefreshProgress(env.DB, {
    running: false,
    current: total,
    success,
    failed,
  });
}

export async function cleanupStaleTokenQuotaArtifacts(env: Env): Promise<void> {
  await cleanupTokenQuotaArtifacts({
    db: env.DB,
    auditRetentionDays: TOKEN_QUOTA_AUDIT_RETENTION_DAYS,
    windowRetentionHours: TOKEN_QUOTA_WINDOW_RETENTION_HOURS,
  });
}
