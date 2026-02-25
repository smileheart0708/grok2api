import type {
  Env,
  TokenUsageRefreshQueueMessage,
  TokenUsageRefreshSource,
} from "../env";
import { dbAll, dbFirst } from "../db";
import { getSettings, normalizeCfCookie } from "../settings";
import { checkRateLimits } from "../grok/rateLimits";
import { updateTokenLimits } from "../repo/tokens";
import { getRefreshProgress, setRefreshProgress } from "../repo/refreshProgress";
import { nowMs } from "../utils/time";

const TOKEN_REFRESH_DELAY_SECONDS = 10;
const TOKEN_REFRESH_DEDUP_WINDOW_MS = 10 * 1000;
const TOKEN_REFRESH_RETRY_DELAY_SECONDS = 20;

function logTokenRefreshWarn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(...args);
}

function buildTokenCookie(token: string, cf: string): string {
  return cf ? `sso-rw=${token};sso=${token};${cf}` : `sso-rw=${token};sso=${token}`;
}

function getRemainingTokens(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  const value = payload["remainingTokens"];
  return typeof value === "number" ? value : null;
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
  const requestedAtRaw = rec["requested_at"];

  if (!token || !model || !isTokenRefreshSource(source)) {
    return null;
  }

  const requestedAt =
    typeof requestedAtRaw === "number" && Number.isFinite(requestedAtRaw) && requestedAtRaw > 0
      ? Math.floor(requestedAtRaw)
      : nowMs();

  return { token, source, model, requested_at: requestedAt };
}

export async function refreshTokenQuota(
  env: Env,
  token: string,
  tokenType: "sso" | "ssoSuper",
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<boolean> {
  try {
    const cf = normalizeCfCookie(settings.grok.cf_clearance ?? "");
    const cookie = buildTokenCookie(token, cf);

    const ratePayload = await checkRateLimits(cookie, settings.grok, "grok-4-fast");
    const remaining = getRemainingTokens(ratePayload);
    if (typeof remaining !== "number") {
      return false;
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

    return true;
  } catch {
    return false;
  }
}

async function tryAcquireRefreshWindowLock(env: Env, token: string, atMs: number): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT INTO token_usage_refresh_window(token, last_enqueued_at)
     VALUES(?, ?)
     ON CONFLICT(token) DO UPDATE
     SET last_enqueued_at = excluded.last_enqueued_at
     WHERE token_usage_refresh_window.last_enqueued_at <= ?`,
  )
    .bind(token, atMs, atMs - TOKEN_REFRESH_DEDUP_WINDOW_MS)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function enqueueDelayedTokenRefresh(args: {
  env: Env;
  message: TokenUsageRefreshQueueMessage;
}): Promise<boolean> {
  const queue = args.env.TOKEN_USAGE_REFRESH_QUEUE;
  if (!queue) return false;

  const normalized = normalizeRefreshMessage(args.message);
  if (!normalized) return false;

  const locked = await tryAcquireRefreshWindowLock(args.env, normalized.token, nowMs());
  if (!locked) return false;

  await queue.send(normalized, {
    contentType: "json",
    delaySeconds: TOKEN_REFRESH_DELAY_SECONDS,
  });
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
  const payloadByToken = new Map<string, TokenUsageRefreshQueueMessage>();

  for (const message of batch.messages) {
    const payload = normalizeRefreshMessage(message.body);
    if (!payload) {
      message.ack();
      continue;
    }
    if (uniqueMessages.has(payload.token)) {
      message.ack();
      continue;
    }
    uniqueMessages.set(payload.token, message);
    payloadByToken.set(payload.token, payload);
  }

  if (uniqueMessages.size === 0) return;
  const settings = await getSettings(env);

  for (const [token, message] of uniqueMessages.entries()) {
    const payload = payloadByToken.get(token);
    if (!payload) {
      message.ack();
      continue;
    }

    try {
      const tokenType = await getRefreshableTokenType(env, token);
      if (!tokenType) {
        message.ack();
        continue;
      }

      const ok = await refreshTokenQuota(env, token, tokenType, settings);
      if (ok) {
        message.ack();
      } else {
        message.retry({ delaySeconds: TOKEN_REFRESH_RETRY_DELAY_SECONDS });
      }
    } catch (error) {
      logTokenRefreshWarn("token refresh queue consume failed:", {
        token_suffix: token.slice(-6),
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

  if (rows.length === 0) {
    return;
  }

  await setRefreshProgress(env.DB, {
    running: true,
    total: rows.length,
    current: 0,
    success: 0,
    failed: 0,
  });

  let success = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const ok = await refreshTokenQuota(env, row.token, row.token_type, settings);
    if (ok) {
      success++;
    } else {
      failed++;
    }

    if (i % 5 === 0 || i === rows.length - 1) {
      await setRefreshProgress(env.DB, {
        current: i + 1,
        success,
        failed,
      });
    }

    await new Promise((res) => setTimeout(res, 50));
  }

  await setRefreshProgress(env.DB, {
    running: false,
    current: rows.length,
    success,
    failed,
  });
}
