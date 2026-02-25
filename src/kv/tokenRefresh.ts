import type { Env } from "../env";
import { dbAll } from "../db";
import { getSettings, normalizeCfCookie } from "../settings";
import { checkRateLimits } from "../grok/rateLimits";
import { updateTokenLimits } from "../repo/tokens";
import { getRefreshProgress, setRefreshProgress } from "../repo/refreshProgress";

function buildTokenCookie(token: string, cf: string): string {
  return cf ? `sso-rw=${token};sso=${token};${cf}` : `sso-rw=${token};sso=${token}`;
}

function getRemainingTokens(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  const value = payload["remainingTokens"];
  return typeof value === "number" ? value : null;
}

async function refreshTokenQuota(
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
  const now = Date.now();
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
