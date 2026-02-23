import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { Env } from "./env";

export const ADMIN_SESSION_COOKIE = "grok2api_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const ADMIN_SESSION_MAX_AGE_MS = ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
export const ADMIN_REQUESTED_WITH = "grok2api-admin";

type AdminContext = Context<{ Bindings: Env }>;

export function getAdminSessionCookie(c: AdminContext): string | null {
  const value = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function setAdminSessionCookie(c: AdminContext, token: string): void {
  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export function clearAdminSessionCookie(c: AdminContext): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  });
}
