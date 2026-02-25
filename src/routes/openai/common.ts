import { refreshTokenQuota } from "../../kv/tokenRefresh";
import {
  acquireBestTokenReservation,
  acquireUnknownTokenForProbe,
  type TokenReservation,
  type TokenReservationCost,
} from "../../repo/tokens";
import type { Env } from "../../env";
import type { SettingsBundle } from "../../settings";

const DEFAULT_PROBE_WINDOW_MS = 3_000;

export function openAiError(message: string, code: string): Record<string, unknown> {
  return { error: { message, type: "invalid_request_error", code } };
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ||
    req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const queue = items.slice();
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) continue;
      results.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runTasksSettledWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (!items.length) return [];
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(limit || 1), items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) break;
      try {
        const item = items[idx];
        if (item === undefined) {
          results[idx] = { status: "rejected", reason: new Error("task_item_missing") };
          continue;
        }
        const value = await fn(item);
        results[idx] = { status: "fulfilled", value };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export function parseIntSafe(v: string | undefined, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export function isContentModerationMessage(message: string): boolean {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("content moderated") ||
    m.includes("content-moderated") ||
    m.includes("wke=grok:content-moderated")
  );
}

export async function acquireTokenReservationWithProbe(args: {
  env: Env;
  settings: SettingsBundle;
  model: string;
  cost: TokenReservationCost;
  probeWindowMs?: number;
}): Promise<TokenReservation | null> {
  const reserved = await acquireBestTokenReservation({
    db: args.env.DB,
    model: args.model,
    cost: args.cost,
  });
  if (reserved) return reserved;

  const candidate = await acquireUnknownTokenForProbe({
    db: args.env.DB,
    model: args.model,
    probeWindowMs:
      typeof args.probeWindowMs === "number" &&
      Number.isFinite(args.probeWindowMs) &&
      args.probeWindowMs > 0
        ? Math.floor(args.probeWindowMs)
        : DEFAULT_PROBE_WINDOW_MS,
  });
  if (!candidate) return null;

  const refreshed = await refreshTokenQuota(
    args.env,
    candidate.token,
    candidate.token_type,
    args.settings,
  );
  if (!refreshed) return null;

  return acquireBestTokenReservation({
    db: args.env.DB,
    model: args.model,
    cost: args.cost,
  });
}
