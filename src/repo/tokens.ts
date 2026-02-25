import type { Env } from "../env";
import { dbAll, dbFirst, dbRun } from "../db";
import { nowMs } from "../utils/time";

export type TokenType = "sso" | "ssoSuper";

export interface TokenRow {
  token: string;
  token_type: TokenType;
  created_time: number;
  remaining_queries: number;
  heavy_remaining_queries: number;
  status: string;
  tags: string; // JSON string
  note: string;
  cooldown_until: number | null;
  last_failure_time: number | null;
  last_failure_reason: string | null;
  failed_count: number;
  inflight_chat: number;
  inflight_heavy: number;
  inflight_updated_at: number;
}

export interface TokenReservationCost {
  chat: number;
  heavy: number;
}

export interface TokenReservation {
  token: string;
  token_type: TokenType;
  cost: TokenReservationCost;
}

interface ReservationCandidateRow {
  token: string;
  token_type: TokenType;
  created_time: number;
  remaining_queries: number;
  heavy_remaining_queries: number;
  active_inflight_chat: number;
  active_inflight_heavy: number;
  effective_chat: number;
  effective_heavy: number;
}

interface D1RunMeta {
  changes?: number;
}

interface D1RunResultLike {
  meta?: D1RunMeta;
}

const MAX_FAILURES = 3;
const INFLIGHT_TTL_MS = 120_000;
const TOP_K = 4;
const CANDIDATE_LIMIT = 12;
const MAX_ACQUIRE_ROUNDS = 2;
const DEFAULT_PROBE_LOCK_WINDOW_MS = 3_000;

function parseTags(tagsJson: string): string[] {
  try {
    const v = JSON.parse(tagsJson) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function normalizeCost(cost: TokenReservationCost): TokenReservationCost {
  const chat = Math.max(0, Math.floor(Number(cost.chat) || 0));
  const heavy = Math.max(0, Math.floor(Number(cost.heavy) || 0));
  return { chat, heavy };
}

function hasRunChanges(result: unknown): boolean {
  return Number((result as D1RunResultLike)?.meta?.changes ?? 0) > 0;
}

function reservationNeedsHeavy(model: string, cost: TokenReservationCost): boolean {
  return model === "grok-4-heavy" || cost.heavy > 0;
}

function tokenTypeOrder(model: string, cost: TokenReservationCost): readonly TokenType[] {
  return reservationNeedsHeavy(model, cost) ? ["ssoSuper"] : ["sso", "ssoSuper"];
}

function reservationWeight(row: ReservationCandidateRow, needsHeavy: boolean): number {
  const chatWeight = Math.max(0, row.effective_chat);
  if (!needsHeavy) return chatWeight;
  return Math.max(0, Math.min(chatWeight, row.effective_heavy));
}

function pickWeightedIndex(weights: readonly number[]): number {
  const normalized = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = normalized.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return 0;
  const r = Math.random() * total;
  let acc = 0;
  for (let i = 0; i < normalized.length; i++) {
    const w = normalized[i] ?? 0;
    acc += w;
    if (r <= acc) return i;
  }
  return Math.max(0, normalized.length - 1);
}

function buildAttemptOrder(
  candidates: readonly ReservationCandidateRow[],
  needsHeavy: boolean,
): ReservationCandidateRow[] {
  if (candidates.length <= 1) return [...candidates];
  const topCount = Math.min(TOP_K, candidates.length);
  const top = candidates.slice(0, topCount);
  const selectedTopIdx = pickWeightedIndex(top.map((row) => reservationWeight(row, needsHeavy)));
  const selected = top[selectedTopIdx] ?? top[0];
  if (!selected) return [...candidates];

  const out: ReservationCandidateRow[] = [selected];
  for (const row of candidates) {
    if (row.token === selected.token) continue;
    out.push(row);
  }
  return out;
}

async function listKnownReservationCandidates(args: {
  db: Env["DB"];
  tokenType: TokenType;
  model: string;
  cost: TokenReservationCost;
  atMs: number;
}): Promise<ReservationCandidateRow[]> {
  const needsHeavy = reservationNeedsHeavy(args.model, args.cost);
  const sql = `WITH candidate AS (
      SELECT
        token,
        token_type,
        created_time,
        remaining_queries,
        heavy_remaining_queries,
        CASE WHEN ? - inflight_updated_at <= ? THEN inflight_chat ELSE 0 END AS active_inflight_chat,
        CASE WHEN ? - inflight_updated_at <= ? THEN inflight_heavy ELSE 0 END AS active_inflight_heavy
      FROM tokens
      WHERE token_type = ?
        AND status != 'expired'
        AND failed_count < ?
        AND (cooldown_until IS NULL OR cooldown_until <= ?)
        AND remaining_queries > 0
        ${needsHeavy ? "AND heavy_remaining_queries > 0" : ""}
    )
    SELECT
      token,
      token_type,
      created_time,
      remaining_queries,
      heavy_remaining_queries,
      active_inflight_chat,
      active_inflight_heavy,
      (remaining_queries - active_inflight_chat) AS effective_chat,
      (heavy_remaining_queries - active_inflight_heavy) AS effective_heavy
    FROM candidate
    WHERE (remaining_queries - active_inflight_chat) >= ?
      ${needsHeavy ? "AND (heavy_remaining_queries - active_inflight_heavy) >= ?" : ""}
    ORDER BY ${
      needsHeavy
        ? "MIN((remaining_queries - active_inflight_chat), (heavy_remaining_queries - active_inflight_heavy))"
        : "(remaining_queries - active_inflight_chat)"
    } DESC, created_time ASC
    LIMIT ?`;

  const rows = await dbAll<ReservationCandidateRow>(
    args.db,
    sql,
    [
      args.atMs,
      INFLIGHT_TTL_MS,
      args.atMs,
      INFLIGHT_TTL_MS,
      args.tokenType,
      MAX_FAILURES,
      args.atMs,
      args.cost.chat,
      ...(needsHeavy ? [args.cost.heavy] : []),
      CANDIDATE_LIMIT,
    ],
  );

  return rows;
}

async function tryReserveCandidate(args: {
  db: Env["DB"];
  candidate: ReservationCandidateRow;
  model: string;
  cost: TokenReservationCost;
  atMs: number;
}): Promise<boolean> {
  const needsHeavy = reservationNeedsHeavy(args.model, args.cost);
  const sql = `UPDATE tokens
    SET
      inflight_chat = CASE WHEN ? - inflight_updated_at <= ? THEN inflight_chat + ? ELSE ? END,
      inflight_heavy = CASE WHEN ? - inflight_updated_at <= ? THEN inflight_heavy + ? ELSE ? END,
      inflight_updated_at = ?
    WHERE token = ?
      AND token_type = ?
      AND status != 'expired'
      AND failed_count < ?
      AND (cooldown_until IS NULL OR cooldown_until <= ?)
      AND remaining_queries > 0
      AND (remaining_queries - CASE WHEN ? - inflight_updated_at <= ? THEN inflight_chat ELSE 0 END) >= ?
      ${needsHeavy ? "AND heavy_remaining_queries > 0" : ""}
      ${
        needsHeavy
          ? "AND (heavy_remaining_queries - CASE WHEN ? - inflight_updated_at <= ? THEN inflight_heavy ELSE 0 END) >= ?"
          : ""
      }`;

  const result = await args.db
    .prepare(sql)
    .bind(
      args.atMs,
      INFLIGHT_TTL_MS,
      args.cost.chat,
      args.cost.chat,
      args.atMs,
      INFLIGHT_TTL_MS,
      args.cost.heavy,
      args.cost.heavy,
      args.atMs,
      args.candidate.token,
      args.candidate.token_type,
      MAX_FAILURES,
      args.atMs,
      args.atMs,
      INFLIGHT_TTL_MS,
      args.cost.chat,
      ...(needsHeavy ? [args.atMs, INFLIGHT_TTL_MS, args.cost.heavy] : []),
    )
    .run();

  return hasRunChanges(result);
}

export function tokenRowToInfo(row: TokenRow): {
  token: string;
  token_type: TokenType;
  created_time: number;
  remaining_queries: number;
  heavy_remaining_queries: number;
  status: string;
  tags: string[];
  note: string;
  cooldown_until: number | null;
  last_failure_time: number | null;
  last_failure_reason: string;
  limit_reason: string;
  cooldown_remaining: number;
} {
  const now = nowMs();
  const cooldownRemainingMs =
    row.cooldown_until && row.cooldown_until > now ? row.cooldown_until - now : 0;
  const cooldown_remaining = cooldownRemainingMs ? Math.floor((cooldownRemainingMs + 999) / 1000) : 0;
  const limit_reason = cooldownRemainingMs
    ? "cooldown"
    : row.token_type === "ssoSuper"
      ? row.remaining_queries === 0 || row.heavy_remaining_queries === 0
        ? "exhausted"
        : ""
      : row.remaining_queries === 0
        ? "exhausted"
        : "";

  const status = (() => {
    if (row.status === "expired") return "失效";
    if (cooldownRemainingMs) return "冷却中";
    if (row.token_type === "ssoSuper") {
      if (row.remaining_queries === -1 && row.heavy_remaining_queries === -1) return "未使用";
      if (row.remaining_queries === 0 || row.heavy_remaining_queries === 0) return "额度耗尽";
      return "正常";
    }
    if (row.remaining_queries === -1) return "未使用";
    if (row.remaining_queries === 0) return "额度耗尽";
    return "正常";
  })();

  return {
    token: row.token,
    token_type: row.token_type,
    created_time: row.created_time,
    remaining_queries: row.remaining_queries,
    heavy_remaining_queries: row.heavy_remaining_queries,
    status,
    tags: parseTags(row.tags),
    note: row.note ?? "",
    cooldown_until: row.cooldown_until,
    last_failure_time: row.last_failure_time,
    last_failure_reason: row.last_failure_reason ?? "",
    limit_reason,
    cooldown_remaining,
  };
}

export async function listTokens(db: Env["DB"]): Promise<TokenRow[]> {
  return dbAll<TokenRow>(
    db,
    "SELECT token, token_type, created_time, remaining_queries, heavy_remaining_queries, status, tags, note, cooldown_until, last_failure_time, last_failure_reason, failed_count, inflight_chat, inflight_heavy, inflight_updated_at FROM tokens ORDER BY created_time DESC",
  );
}

export async function addTokens(db: Env["DB"], tokens: string[], token_type: TokenType): Promise<number> {
  const now = nowMs();
  const cleaned = tokens.map((t) => t.trim()).filter(Boolean);
  if (!cleaned.length) return 0;

  const stmts = cleaned.map((t) =>
    db
      .prepare(
        "INSERT OR REPLACE INTO tokens(token, token_type, created_time, remaining_queries, heavy_remaining_queries, status, failed_count, cooldown_until, last_failure_time, last_failure_reason, tags, note) VALUES(?,?,?,?,?,'active',0,NULL,NULL,NULL,'[]','')",
      )
      .bind(t, token_type, now, -1, -1),
  );
  await db.batch(stmts);
  return cleaned.length;
}

export async function deleteTokens(db: Env["DB"], tokens: string[], token_type: TokenType): Promise<number> {
  const cleaned = tokens.map((t) => t.trim()).filter(Boolean);
  if (!cleaned.length) return 0;
  const placeholders = cleaned.map(() => "?").join(",");
  const before = await dbFirst<{ c: number }>(
    db,
    `SELECT COUNT(1) as c FROM tokens WHERE token_type = ? AND token IN (${placeholders})`,
    [token_type, ...cleaned],
  );
  await dbRun(db, `DELETE FROM tokens WHERE token_type = ? AND token IN (${placeholders})`, [token_type, ...cleaned]);
  return before?.c ?? 0;
}

export async function updateTokenTags(db: Env["DB"], token: string, token_type: TokenType, tags: string[]): Promise<void> {
  const cleaned = tags.map((t) => t.trim()).filter(Boolean);
  await dbRun(db, "UPDATE tokens SET tags = ? WHERE token = ? AND token_type = ?", [
    JSON.stringify(cleaned),
    token,
    token_type,
  ]);
}

export async function updateTokenNote(db: Env["DB"], token: string, token_type: TokenType, note: string): Promise<void> {
  await dbRun(db, "UPDATE tokens SET note = ? WHERE token = ? AND token_type = ?", [note.trim(), token, token_type]);
}

export async function getAllTags(db: Env["DB"]): Promise<string[]> {
  const rows = await dbAll<{ tags: string }>(db, "SELECT tags FROM tokens");
  const set = new Set<string>();
  for (const r of rows) {
    for (const t of parseTags(r.tags)) set.add(t);
  }
  return [...set].sort();
}

export async function selectBestToken(db: Env["DB"], model: string): Promise<{ token: string; token_type: TokenType } | null> {
  const now = nowMs();
  const isHeavy = model === "grok-4-heavy";
  const field = isHeavy ? "heavy_remaining_queries" : "remaining_queries";

  const pick = async (token_type: TokenType): Promise<{ token: string; token_type: TokenType } | null> => {
    const row = await dbFirst<{ token: string }>(
      db,
      `SELECT token FROM tokens
       WHERE token_type = ?
         AND status != 'expired'
         AND failed_count < ?
         AND (cooldown_until IS NULL OR cooldown_until <= ?)
         AND ${field} != 0
       ORDER BY CASE WHEN ${field} = -1 THEN 0 ELSE 1 END, ${field} DESC, created_time ASC
       LIMIT 1`,
      [token_type, MAX_FAILURES, now],
    );
    return row ? { token: row.token, token_type } : null;
  };

  if (isHeavy) return pick("ssoSuper");

  return (await pick("sso")) ?? (await pick("ssoSuper"));
}

export async function acquireBestTokenReservation(args: {
  db: Env["DB"];
  model: string;
  cost: TokenReservationCost;
}): Promise<TokenReservation | null> {
  const cost = normalizeCost(args.cost);
  if (cost.chat === 0 && cost.heavy === 0) return null;

  const types = tokenTypeOrder(args.model, cost);
  const needsHeavy = reservationNeedsHeavy(args.model, cost);

  for (let round = 0; round < MAX_ACQUIRE_ROUNDS; round++) {
    const atMs = nowMs();
    for (const tokenType of types) {
      const candidates = await listKnownReservationCandidates({
        db: args.db,
        tokenType,
        model: args.model,
        cost,
        atMs,
      });
      if (candidates.length === 0) continue;

      const attempts = buildAttemptOrder(candidates, needsHeavy);
      for (const candidate of attempts) {
        const ok = await tryReserveCandidate({
          db: args.db,
          candidate,
          model: args.model,
          cost,
          atMs: nowMs(),
        });
        if (ok) {
          return {
            token: candidate.token,
            token_type: candidate.token_type,
            cost,
          };
        }
      }
    }
  }

  return null;
}

export async function tryAcquireTokenProbeWindowLock(
  db: Env["DB"],
  token: string,
  atMs: number,
  windowMs = DEFAULT_PROBE_LOCK_WINDOW_MS,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO token_usage_probe_window(token, last_probed_at)
       VALUES(?, ?)
       ON CONFLICT(token) DO UPDATE
       SET last_probed_at = excluded.last_probed_at
       WHERE token_usage_probe_window.last_probed_at <= ?`,
    )
    .bind(token, atMs, atMs - Math.max(1, Math.floor(windowMs)))
    .run();
  return hasRunChanges(result);
}

async function listUnknownProbeCandidates(args: {
  db: Env["DB"];
  tokenType: TokenType;
  model: string;
  atMs: number;
}): Promise<Array<{ token: string; token_type: TokenType }>> {
  const needsHeavy = args.model === "grok-4-heavy";
  const sql = `SELECT token, token_type
    FROM tokens
    WHERE token_type = ?
      AND status != 'expired'
      AND failed_count < ?
      AND (cooldown_until IS NULL OR cooldown_until <= ?)
      AND remaining_queries = -1
      ${needsHeavy ? "AND heavy_remaining_queries = -1" : ""}
    ORDER BY created_time ASC
    LIMIT ?`;
  return dbAll<{ token: string; token_type: TokenType }>(args.db, sql, [
    args.tokenType,
    MAX_FAILURES,
    args.atMs,
    CANDIDATE_LIMIT,
  ]);
}

export async function acquireUnknownTokenForProbe(args: {
  db: Env["DB"];
  model: string;
  probeWindowMs?: number;
}): Promise<{ token: string; token_type: TokenType } | null> {
  const types = tokenTypeOrder(args.model, { chat: 1, heavy: args.model === "grok-4-heavy" ? 1 : 0 });
  const atMs = nowMs();
  const probeWindowMs =
    typeof args.probeWindowMs === "number" && Number.isFinite(args.probeWindowMs) && args.probeWindowMs > 0
      ? Math.floor(args.probeWindowMs)
      : DEFAULT_PROBE_LOCK_WINDOW_MS;

  for (const tokenType of types) {
    const candidates = await listUnknownProbeCandidates({
      db: args.db,
      tokenType,
      model: args.model,
      atMs,
    });
    for (const candidate of candidates) {
      const locked = await tryAcquireTokenProbeWindowLock(args.db, candidate.token, nowMs(), probeWindowMs);
      if (locked) {
        return candidate;
      }
    }
  }
  return null;
}

export async function releaseTokenReservation(
  db: Env["DB"],
  reservation: TokenReservation,
): Promise<void> {
  const cost = normalizeCost(reservation.cost);
  if (cost.chat === 0 && cost.heavy === 0) return;

  const atMs = nowMs();
  await dbRun(
    db,
    `UPDATE tokens
     SET
       inflight_chat = CASE WHEN ? - inflight_updated_at <= ? THEN MAX(0, inflight_chat - ?) ELSE 0 END,
       inflight_heavy = CASE WHEN ? - inflight_updated_at <= ? THEN MAX(0, inflight_heavy - ?) ELSE 0 END,
       inflight_updated_at = ?
     WHERE token = ? AND token_type = ?`,
    [
      atMs,
      INFLIGHT_TTL_MS,
      cost.chat,
      atMs,
      INFLIGHT_TTL_MS,
      cost.heavy,
      atMs,
      reservation.token,
      reservation.token_type,
    ],
  );
}

export async function clearTokenInflightAfterRefresh(db: Env["DB"], token: string): Promise<void> {
  await dbRun(
    db,
    "UPDATE tokens SET inflight_chat = 0, inflight_heavy = 0, inflight_updated_at = ? WHERE token = ?",
    [nowMs(), token],
  );
}

export async function recordTokenFailure(
  db: Env["DB"],
  token: string,
  status: number,
  message: string,
): Promise<void> {
  const now = nowMs();
  const reason = `${status}: ${message}`;
  await dbRun(
    db,
    "UPDATE tokens SET failed_count = failed_count + 1, last_failure_time = ?, last_failure_reason = ? WHERE token = ?",
    [now, reason, token],
  );

  const row = await dbFirst<{ failed_count: number }>(db, "SELECT failed_count FROM tokens WHERE token = ?", [token]);
  if (!row) return;
  if (status >= 400 && status < 500 && row.failed_count >= MAX_FAILURES) {
    await dbRun(db, "UPDATE tokens SET status = 'expired' WHERE token = ?", [token]);
  }
}

export async function applyCooldown(db: Env["DB"], token: string, status: number): Promise<void> {
  const now = nowMs();
  let until: number | null = null;
  if (status === 429) {
    const row = await dbFirst<{ remaining_queries: number }>(db, "SELECT remaining_queries FROM tokens WHERE token = ?", [token]);
    const remaining = row?.remaining_queries ?? -1;
    const seconds = remaining > 0 || remaining === -1 ? 3600 : 36000;
    until = now + seconds * 1000;
  } else {
    // Workers 不适合做“按请求次数”冷却，这里用短时间冷却近似替代。
    until = now + 30 * 1000;
  }
  await dbRun(db, "UPDATE tokens SET cooldown_until = ? WHERE token = ?", [until, token]);
}

export async function updateTokenLimits(
  db: Env["DB"],
  token: string,
  updates: { remaining_queries?: number; heavy_remaining_queries?: number },
): Promise<void> {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (typeof updates.remaining_queries === "number") {
    parts.push("remaining_queries = ?");
    params.push(updates.remaining_queries);
  }
  if (typeof updates.heavy_remaining_queries === "number") {
    parts.push("heavy_remaining_queries = ?");
    params.push(updates.heavy_remaining_queries);
  }
  if (!parts.length) return;
  params.push(token);
  await dbRun(db, `UPDATE tokens SET ${parts.join(", ")} WHERE token = ?`, params);
}

export async function reactivateToken(
  db: Env["DB"],
  token: string,
  token_type: TokenType,
): Promise<boolean> {
  const row = await dbFirst<{ status: string }>(
    db,
    "SELECT status FROM tokens WHERE token = ? AND token_type = ?",
    [token, token_type],
  );
  if (!row || row.status !== "expired") return false;

  await dbRun(
    db,
    "UPDATE tokens SET status = 'active', failed_count = 0, cooldown_until = NULL, last_failure_time = NULL, last_failure_reason = NULL WHERE token = ? AND token_type = ?",
    [token, token_type],
  );
  return true;
}
