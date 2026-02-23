import type { Env } from "../env";
import { dbFirst, dbRun } from "../db";
import { generateSessionToken, sha256Base64Url } from "../utils/crypto";
import { nowMs } from "../utils/time";
import { ADMIN_SESSION_MAX_AGE_MS } from "../admin-session-cookie";

const DEFAULT_EXPIRE_HOURS = 8;

function resolveExpiryMs(expireHours: number): number {
  const safeHours = Number.isFinite(expireHours) && expireHours > 0 ? expireHours : DEFAULT_EXPIRE_HOURS;
  return Math.floor(safeHours * 60 * 60 * 1000);
}

export async function createAdminSession(
  db: Env["DB"],
  expireHours = DEFAULT_EXPIRE_HOURS,
): Promise<{ token: string; expiresAt: number }> {
  const token = generateSessionToken();
  const tokenHash = await sha256Base64Url(token);
  const expiresAt = nowMs() + resolveExpiryMs(expireHours);
  await dbRun(db, "INSERT INTO admin_sessions(token, expires_at) VALUES(?,?)", [tokenHash, expiresAt]);
  return { token, expiresAt };
}

export async function deleteAdminSession(db: Env["DB"], token: string): Promise<void> {
  const tokenHash = await sha256Base64Url(token);
  await dbRun(db, "DELETE FROM admin_sessions WHERE token = ?", [tokenHash]);
}

export async function verifyAdminSession(
  db: Env["DB"],
  token: string,
  slidingExpireMs = ADMIN_SESSION_MAX_AGE_MS,
): Promise<boolean> {
  const now = nowMs();
  await dbRun(db, "DELETE FROM admin_sessions WHERE expires_at <= ?", [now]);
  const tokenHash = await sha256Base64Url(token);
  const row = await dbFirst<{ token: string }>(
    db,
    "SELECT token FROM admin_sessions WHERE token = ? AND expires_at > ?",
    [tokenHash, now],
  );
  if (!row) return false;

  const safeSlidingExpire = Number.isFinite(slidingExpireMs) && slidingExpireMs > 0
    ? Math.floor(slidingExpireMs)
    : resolveExpiryMs(DEFAULT_EXPIRE_HOURS);
  await dbRun(db, "UPDATE admin_sessions SET expires_at = ? WHERE token = ?", [now + safeSlidingExpire, tokenHash]);
  return true;
}

