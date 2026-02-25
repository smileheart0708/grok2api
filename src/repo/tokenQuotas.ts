import type { Env } from "../env";
import { dbAll, dbRun } from "../db";
import { nowMs } from "../utils/time";
import { getModelEffortTier, toRateLimitModel } from "../grok/models";
import type { QuotaMetricKind } from "../grok/quota-parser";
import type { TokenType } from "./tokens";

export type TokenQuotaSource =
  | "queue"
  | "auto_refresh"
  | "manual_refresh"
  | "admin_test"
  | "probe"
  | "unknown";

export type TokenDisplayStatus = "active" | "cooling" | "exhausted" | "invalid" | "unknown";

export interface TokenQuotaStateInput {
  token: string;
  rate_limit_model: string;
  remaining_tokens: number | null;
  total_tokens: number | null;
  remaining_queries: number | null;
  total_queries: number | null;
  low_effort_cost: number | null;
  high_effort_cost: number | null;
  window_size_seconds: number | null;
  metric_kind: QuotaMetricKind;
  source: TokenQuotaSource;
  refreshed_at: number;
  success: boolean;
  last_error: string;
  raw_payload: Record<string, unknown> | null;
}

export interface TokenQuotaBucket {
  rate_limit_model: string;
  remaining_queries: number | null;
  total_queries: number | null;
  remaining_tokens: number | null;
  total_tokens: number | null;
  low_effort_cost: number | null;
  high_effort_cost: number | null;
  window_size_seconds: number | null;
  refreshed_at: number | null;
  stale: boolean;
  source: TokenQuotaSource;
  error: string | null;
}

export interface TokenQuotaSummary {
  known_count: number;
  stale_count: number;
  refreshed_at: number | null;
}

export interface TokenQuotaReservation {
  token: string;
  token_type: TokenType;
  rate_limit_model: string;
  units: number;
}

interface KnownQuotaCandidateRow {
  token: string;
  token_type: TokenType;
  created_time: number;
  capacity_queries: number | null;
  active_inflight: number;
  effective_queries: number | null;
}

interface UnknownProbeCandidateRow {
  token: string;
  token_type: TokenType;
}

interface QuotaBucketRow {
  token: string;
  rate_limit_model: string;
  remaining_queries: number | null;
  total_queries: number | null;
  remaining_tokens: number | null;
  total_tokens: number | null;
  low_effort_cost: number | null;
  high_effort_cost: number | null;
  window_size_seconds: number | null;
  source: string;
  refreshed_at: number | null;
  success: number;
  last_error: string;
}

interface D1RunMeta {
  changes?: number;
}

interface D1RunResultLike {
  meta?: D1RunMeta;
}

const MAX_FAILURES = 3;
const INFLIGHT_TTL_MS = 120_000;
const CANDIDATE_LIMIT = 12;
const MAX_ACQUIRE_ROUNDS = 2;
const DEFAULT_STALE_MS = 10 * 60 * 1000;
const DEFAULT_PROBE_WINDOW_MS = 3_000;
const DEFAULT_REFRESH_WINDOW_MS = 10_000;

function hasRunChanges(result: unknown): boolean {
  return Number((result as D1RunResultLike)?.meta?.changes ?? 0) > 0;
}

function normalizeUnits(units: number): number {
  const parsed = Math.floor(Number(units) || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

function normalizeSource(source: string): TokenQuotaSource {
  if (
    source === "queue" ||
    source === "auto_refresh" ||
    source === "manual_refresh" ||
    source === "admin_test" ||
    source === "probe"
  ) {
    return source;
  }
  return "unknown";
}

function serializeRawPayload(rawPayload: Record<string, unknown> | null): string {
  if (!rawPayload) return "{}";
  try {
    return JSON.stringify(rawPayload);
  } catch {
    return "{}";
  }
}

function sanitizeNonNegative(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function sanitizePositiveOrNull(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function modelTokenTypeOrder(model: string): readonly TokenType[] {
  return getModelEffortTier(model) === "high" ? ["ssoSuper"] : ["sso", "ssoSuper"];
}

function capacityExpressionForTier(effortTier: "low" | "high", alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  const costExpression =
    effortTier === "high"
      ? `COALESCE(NULLIF(${prefix}high_effort_cost, 0), 1)`
      : `COALESCE(NULLIF(${prefix}low_effort_cost, 0), 1)`;
  return `CASE
    WHEN ${prefix}remaining_queries IS NOT NULL THEN ${prefix}remaining_queries
    WHEN ${prefix}remaining_tokens IS NOT NULL THEN CAST(${prefix}remaining_tokens / ${costExpression} AS INTEGER)
    ELSE NULL
  END`;
}

function activeInflightExpression(alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  return `CASE WHEN ? - ${prefix}inflight_updated_at <= ? THEN ${prefix}inflight_units ELSE 0 END`;
}

function tokenStatusFromRow(args: {
  tokenStatus: string;
  cooldownUntil: number | null;
  summary: TokenQuotaSummary;
  buckets: readonly TokenQuotaBucket[];
  now: number;
}): TokenDisplayStatus {
  if (args.tokenStatus === "expired") return "invalid";
  if (args.cooldownUntil !== null && args.cooldownUntil > args.now) return "cooling";
  if (args.summary.known_count === 0) return "unknown";
  if (args.summary.known_count > 0 && args.summary.stale_count >= args.summary.known_count) {
    return "unknown";
  }

  const hasExhaustedBucket = args.buckets.some((bucket) => {
    if (!isKnownBucket(bucket)) return false;
    if (bucket.stale) return false;
    const remaining = estimateRemainingQueries(bucket);
    return remaining !== null && remaining <= 0;
  });
  if (hasExhaustedBucket) return "exhausted";
  return "active";
}

function isKnownBucket(bucket: TokenQuotaBucket): boolean {
  return (
    (bucket.remaining_queries !== null || bucket.remaining_tokens !== null) &&
    bucket.error === null
  );
}

function estimateRemainingQueries(bucket: TokenQuotaBucket): number | null {
  if (bucket.remaining_queries !== null) return bucket.remaining_queries;
  if (bucket.remaining_tokens === null) return null;
  const cost = bucket.low_effort_cost ?? 1;
  const normalizedCost = Number.isFinite(cost) && cost > 0 ? cost : 1;
  return Math.floor(bucket.remaining_tokens / normalizedCost);
}

export function computeTokenQuotaSummary(
  buckets: readonly TokenQuotaBucket[],
): TokenQuotaSummary {
  let knownCount = 0;
  let staleCount = 0;
  let refreshedAt: number | null = null;
  for (const bucket of buckets) {
    if (isKnownBucket(bucket)) {
      knownCount += 1;
      if (bucket.stale) staleCount += 1;
    }
    if (bucket.refreshed_at !== null) {
      refreshedAt = refreshedAt === null ? bucket.refreshed_at : Math.max(refreshedAt, bucket.refreshed_at);
    }
  }
  return {
    known_count: knownCount,
    stale_count: staleCount,
    refreshed_at: refreshedAt,
  };
}

export function computeTokenDisplayStatus(args: {
  tokenStatus: string;
  cooldownUntil: number | null;
  buckets: readonly TokenQuotaBucket[];
  now?: number;
}): TokenDisplayStatus {
  const now = typeof args.now === "number" && Number.isFinite(args.now) ? Math.floor(args.now) : nowMs();
  const summary = computeTokenQuotaSummary(args.buckets);
  return tokenStatusFromRow({
    tokenStatus: args.tokenStatus,
    cooldownUntil: args.cooldownUntil,
    summary,
    buckets: args.buckets,
    now,
  });
}

export async function upsertTokenQuotaState(
  db: Env["DB"],
  input: TokenQuotaStateInput,
): Promise<void> {
  const refreshedAt = Math.max(0, Math.floor(input.refreshed_at || nowMs()));
  await dbRun(
    db,
    `INSERT INTO token_quota_state(
      token,
      rate_limit_model,
      remaining_tokens,
      total_tokens,
      remaining_queries,
      total_queries,
      low_effort_cost,
      high_effort_cost,
      window_size_seconds,
      metric_kind,
      source,
      refreshed_at,
      success,
      last_error,
      raw_payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(token, rate_limit_model) DO UPDATE SET
      remaining_tokens=excluded.remaining_tokens,
      total_tokens=excluded.total_tokens,
      remaining_queries=excluded.remaining_queries,
      total_queries=excluded.total_queries,
      low_effort_cost=excluded.low_effort_cost,
      high_effort_cost=excluded.high_effort_cost,
      window_size_seconds=excluded.window_size_seconds,
      metric_kind=excluded.metric_kind,
      source=excluded.source,
      refreshed_at=excluded.refreshed_at,
      success=excluded.success,
      last_error=excluded.last_error,
      raw_payload=excluded.raw_payload`,
    [
      input.token,
      input.rate_limit_model,
      sanitizeNonNegative(input.remaining_tokens),
      sanitizeNonNegative(input.total_tokens),
      sanitizeNonNegative(input.remaining_queries),
      sanitizeNonNegative(input.total_queries),
      sanitizePositiveOrNull(input.low_effort_cost),
      sanitizePositiveOrNull(input.high_effort_cost),
      sanitizeNonNegative(input.window_size_seconds),
      input.metric_kind,
      input.source,
      refreshedAt,
      input.success ? 1 : 0,
      input.last_error,
      serializeRawPayload(input.raw_payload),
    ],
  );
}

export async function appendTokenQuotaAudit(
  db: Env["DB"],
  input: TokenQuotaStateInput,
): Promise<void> {
  const refreshedAt = Math.max(0, Math.floor(input.refreshed_at || nowMs()));
  await dbRun(
    db,
    `INSERT INTO token_quota_audit(
      token,
      rate_limit_model,
      remaining_tokens,
      total_tokens,
      remaining_queries,
      total_queries,
      low_effort_cost,
      high_effort_cost,
      window_size_seconds,
      metric_kind,
      source,
      refreshed_at,
      success,
      last_error,
      raw_payload,
      recorded_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.token,
      input.rate_limit_model,
      sanitizeNonNegative(input.remaining_tokens),
      sanitizeNonNegative(input.total_tokens),
      sanitizeNonNegative(input.remaining_queries),
      sanitizeNonNegative(input.total_queries),
      sanitizePositiveOrNull(input.low_effort_cost),
      sanitizePositiveOrNull(input.high_effort_cost),
      sanitizeNonNegative(input.window_size_seconds),
      input.metric_kind,
      input.source,
      refreshedAt,
      input.success ? 1 : 0,
      input.last_error,
      serializeRawPayload(input.raw_payload),
      refreshedAt,
    ],
  );
}

export async function saveTokenQuotaSnapshot(
  db: Env["DB"],
  input: TokenQuotaStateInput,
): Promise<void> {
  await upsertTokenQuotaState(db, input);
  await appendTokenQuotaAudit(db, input);
}

async function listKnownQuotaCandidates(args: {
  db: Env["DB"];
  tokenType: TokenType;
  rateLimitModel: string;
  effortTier: "low" | "high";
  atMs: number;
  units: number;
}): Promise<KnownQuotaCandidateRow[]> {
  const capacityExpr = capacityExpressionForTier(args.effortTier, "q");
  const activeExpr = activeInflightExpression("q");
  const sql = `WITH candidate AS (
      SELECT
        t.token,
        t.token_type,
        t.created_time,
        ${capacityExpr} AS capacity_queries,
        ${activeExpr} AS active_inflight
      FROM tokens t
      JOIN token_quota_state q ON q.token = t.token AND q.rate_limit_model = ?
      WHERE t.token_type = ?
        AND t.status != 'expired'
        AND t.failed_count < ?
        AND (t.cooldown_until IS NULL OR t.cooldown_until <= ?)
        AND q.success = 1
    )
    SELECT
      token,
      token_type,
      created_time,
      capacity_queries,
      active_inflight,
      (capacity_queries - active_inflight) AS effective_queries
    FROM candidate
    WHERE capacity_queries IS NOT NULL
      AND (capacity_queries - active_inflight) >= ?
    ORDER BY (capacity_queries - active_inflight) DESC, created_time ASC
    LIMIT ?`;

  return dbAll<KnownQuotaCandidateRow>(args.db, sql, [
    args.atMs,
    INFLIGHT_TTL_MS,
    args.rateLimitModel,
    args.tokenType,
    MAX_FAILURES,
    args.atMs,
    args.units,
    CANDIDATE_LIMIT,
  ]);
}

async function tryReserveQuotaCandidate(args: {
  db: Env["DB"];
  token: string;
  tokenType: TokenType;
  rateLimitModel: string;
  effortTier: "low" | "high";
  units: number;
  atMs: number;
}): Promise<boolean> {
  const capacityExpr = capacityExpressionForTier(args.effortTier);
  const activeExpr = activeInflightExpression();

  const result = await args.db
    .prepare(
      `UPDATE token_quota_state
       SET
         inflight_units = CASE WHEN ? - inflight_updated_at <= ? THEN inflight_units + ? ELSE ? END,
         inflight_updated_at = ?
       WHERE token = ?
         AND rate_limit_model = ?
         AND success = 1
         AND (${capacityExpr}) IS NOT NULL
         AND (${capacityExpr} - ${activeExpr}) >= ?
         AND EXISTS (
           SELECT 1
           FROM tokens t
           WHERE t.token = token_quota_state.token
             AND t.token_type = ?
             AND t.status != 'expired'
             AND t.failed_count < ?
             AND (t.cooldown_until IS NULL OR t.cooldown_until <= ?)
         )`,
    )
    .bind(
      args.atMs,
      INFLIGHT_TTL_MS,
      args.units,
      args.units,
      args.atMs,
      args.token,
      args.rateLimitModel,
      args.atMs,
      INFLIGHT_TTL_MS,
      args.units,
      args.tokenType,
      MAX_FAILURES,
      args.atMs,
    )
    .run();

  return hasRunChanges(result);
}

export async function acquireQuotaReservation(args: {
  db: Env["DB"];
  model: string;
  units?: number;
}): Promise<TokenQuotaReservation | null> {
  const rateLimitModel = toRateLimitModel(args.model);
  const effortTier = getModelEffortTier(args.model);
  const tokenTypeOrder = modelTokenTypeOrder(args.model);
  const units = normalizeUnits(args.units ?? 1);

  for (let round = 0; round < MAX_ACQUIRE_ROUNDS; round++) {
    const atMs = nowMs();
    for (const tokenType of tokenTypeOrder) {
      const candidates = await listKnownQuotaCandidates({
        db: args.db,
        tokenType,
        rateLimitModel,
        effortTier,
        atMs,
        units,
      });
      for (const candidate of candidates) {
        const ok = await tryReserveQuotaCandidate({
          db: args.db,
          token: candidate.token,
          tokenType: candidate.token_type,
          rateLimitModel,
          effortTier,
          units,
          atMs: nowMs(),
        });
        if (ok) {
          return {
            token: candidate.token,
            token_type: candidate.token_type,
            rate_limit_model: rateLimitModel,
            units,
          };
        }
      }
    }
  }
  return null;
}

export async function releaseQuotaReservation(
  db: Env["DB"],
  reservation: TokenQuotaReservation,
): Promise<void> {
  const units = normalizeUnits(reservation.units);
  const atMs = nowMs();
  await dbRun(
    db,
    `UPDATE token_quota_state
     SET
       inflight_units = CASE WHEN ? - inflight_updated_at <= ? THEN MAX(0, inflight_units - ?) ELSE 0 END,
       inflight_updated_at = ?
     WHERE token = ? AND rate_limit_model = ?`,
    [atMs, INFLIGHT_TTL_MS, units, atMs, reservation.token, reservation.rate_limit_model],
  );
}

export async function clearQuotaInflightAfterRefresh(
  db: Env["DB"],
  token: string,
  rateLimitModel: string,
): Promise<void> {
  await dbRun(
    db,
    "UPDATE token_quota_state SET inflight_units = 0, inflight_updated_at = ? WHERE token = ? AND rate_limit_model = ?",
    [nowMs(), token, rateLimitModel],
  );
}

export async function tryAcquireQuotaProbeWindowLock(
  db: Env["DB"],
  token: string,
  rateLimitModel: string,
  atMs: number,
  windowMs = DEFAULT_PROBE_WINDOW_MS,
): Promise<boolean> {
  const window = Math.max(1, Math.floor(windowMs));
  const result = await db
    .prepare(
      `INSERT INTO token_quota_probe_window(token, rate_limit_model, last_probed_at)
       VALUES(?, ?, ?)
       ON CONFLICT(token, rate_limit_model) DO UPDATE
       SET last_probed_at = excluded.last_probed_at
       WHERE token_quota_probe_window.last_probed_at <= ?`,
    )
    .bind(token, rateLimitModel, atMs, atMs - window)
    .run();
  return hasRunChanges(result);
}

export async function tryAcquireQuotaRefreshWindowLock(
  db: Env["DB"],
  token: string,
  rateLimitModel: string,
  atMs: number,
  windowMs = DEFAULT_REFRESH_WINDOW_MS,
): Promise<boolean> {
  const window = Math.max(1, Math.floor(windowMs));
  const result = await db
    .prepare(
      `INSERT INTO token_quota_refresh_window(token, rate_limit_model, last_enqueued_at)
       VALUES(?, ?, ?)
       ON CONFLICT(token, rate_limit_model) DO UPDATE
       SET last_enqueued_at = excluded.last_enqueued_at
       WHERE token_quota_refresh_window.last_enqueued_at <= ?`,
    )
    .bind(token, rateLimitModel, atMs, atMs - window)
    .run();
  return hasRunChanges(result);
}

export async function acquireUnknownQuotaTokenForProbe(args: {
  db: Env["DB"];
  model: string;
  probeWindowMs?: number;
}): Promise<{ token: string; token_type: TokenType; rate_limit_model: string } | null> {
  const rateLimitModel = toRateLimitModel(args.model);
  const tokenTypeOrder = modelTokenTypeOrder(args.model);
  const atMs = nowMs();
  const probeWindowMs =
    typeof args.probeWindowMs === "number" &&
    Number.isFinite(args.probeWindowMs) &&
    args.probeWindowMs > 0
      ? Math.floor(args.probeWindowMs)
      : DEFAULT_PROBE_WINDOW_MS;

  for (const tokenType of tokenTypeOrder) {
    const rows = await dbAll<UnknownProbeCandidateRow>(
      args.db,
      `SELECT t.token, t.token_type
       FROM tokens t
       LEFT JOIN token_quota_state q
         ON q.token = t.token AND q.rate_limit_model = ?
       WHERE t.token_type = ?
         AND t.status != 'expired'
         AND t.failed_count < ?
         AND (t.cooldown_until IS NULL OR t.cooldown_until <= ?)
         AND (
           q.token IS NULL OR
           q.success != 1 OR
           (q.remaining_queries IS NULL AND q.remaining_tokens IS NULL)
         )
       ORDER BY t.created_time ASC
       LIMIT ?`,
      [rateLimitModel, tokenType, MAX_FAILURES, atMs, CANDIDATE_LIMIT],
    );
    for (const row of rows) {
      const locked = await tryAcquireQuotaProbeWindowLock(
        args.db,
        row.token,
        rateLimitModel,
        nowMs(),
        probeWindowMs,
      );
      if (locked) {
        return {
          token: row.token,
          token_type: row.token_type,
          rate_limit_model: rateLimitModel,
        };
      }
    }
  }
  return null;
}

export async function listQuotaBucketsByToken(
  db: Env["DB"],
  tokens?: readonly string[],
  staleThresholdMs = DEFAULT_STALE_MS,
): Promise<Map<string, TokenQuotaBucket[]>> {
  const threshold = Math.max(1, Math.floor(staleThresholdMs));
  const now = nowMs();
  let sql = `SELECT
      token,
      rate_limit_model,
      remaining_queries,
      total_queries,
      remaining_tokens,
      total_tokens,
      low_effort_cost,
      high_effort_cost,
      window_size_seconds,
      source,
      refreshed_at,
      success,
      last_error
    FROM token_quota_state`;
  const params: unknown[] = [];
  if (tokens && tokens.length > 0) {
    const placeholders = tokens.map(() => "?").join(",");
    sql += ` WHERE token IN (${placeholders})`;
    params.push(...tokens);
  }
  sql += " ORDER BY token ASC, rate_limit_model ASC";

  const rows = await dbAll<QuotaBucketRow>(db, sql, params);
  const out = new Map<string, TokenQuotaBucket[]>();
  for (const row of rows) {
    const list = out.get(row.token) ?? [];
    const refreshedAt = typeof row.refreshed_at === "number" && Number.isFinite(row.refreshed_at)
      ? Math.floor(row.refreshed_at)
      : null;
    const stale = refreshedAt !== null ? now - refreshedAt > threshold : true;
    const success = Number(row.success) === 1;

    list.push({
      rate_limit_model: row.rate_limit_model,
      remaining_queries: sanitizeNonNegative(row.remaining_queries),
      total_queries: sanitizeNonNegative(row.total_queries),
      remaining_tokens: sanitizeNonNegative(row.remaining_tokens),
      total_tokens: sanitizeNonNegative(row.total_tokens),
      low_effort_cost: sanitizePositiveOrNull(row.low_effort_cost),
      high_effort_cost: sanitizePositiveOrNull(row.high_effort_cost),
      window_size_seconds: sanitizeNonNegative(row.window_size_seconds),
      refreshed_at: refreshedAt,
      stale,
      source: normalizeSource(row.source),
      error: success ? null : row.last_error || "quota_refresh_failed",
    });
    out.set(row.token, list);
  }
  return out;
}

export async function cleanupTokenQuotaArtifacts(args: {
  db: Env["DB"];
  auditRetentionDays?: number;
  windowRetentionHours?: number;
}): Promise<void> {
  const now = nowMs();
  const auditRetentionDays =
    typeof args.auditRetentionDays === "number" &&
    Number.isFinite(args.auditRetentionDays) &&
    args.auditRetentionDays > 0
      ? Math.floor(args.auditRetentionDays)
      : 7;
  const windowRetentionHours =
    typeof args.windowRetentionHours === "number" &&
    Number.isFinite(args.windowRetentionHours) &&
    args.windowRetentionHours > 0
      ? Math.floor(args.windowRetentionHours)
      : 24;

  const auditCutoff = now - auditRetentionDays * 24 * 60 * 60 * 1000;
  const windowCutoff = now - windowRetentionHours * 60 * 60 * 1000;

  await dbRun(args.db, "DELETE FROM token_quota_audit WHERE recorded_at < ?", [auditCutoff]);
  await dbRun(
    args.db,
    "DELETE FROM token_quota_refresh_window WHERE last_enqueued_at < ?",
    [windowCutoff],
  );
  await dbRun(
    args.db,
    "DELETE FROM token_quota_probe_window WHERE last_probed_at < ?",
    [windowCutoff],
  );
}

export async function deleteTokenQuotaData(
  db: Env["DB"],
  tokens: readonly string[],
): Promise<void> {
  const clean = tokens.map((token) => token.trim()).filter(Boolean);
  if (!clean.length) return;
  const placeholders = clean.map(() => "?").join(",");
  await dbRun(db, `DELETE FROM token_quota_state WHERE token IN (${placeholders})`, clean);
  await dbRun(db, `DELETE FROM token_quota_audit WHERE token IN (${placeholders})`, clean);
  await dbRun(
    db,
    `DELETE FROM token_quota_refresh_window WHERE token IN (${placeholders})`,
    clean,
  );
  await dbRun(
    db,
    `DELETE FROM token_quota_probe_window WHERE token IN (${placeholders})`,
    clean,
  );
}

