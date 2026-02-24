import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "./env";
import { openAiRoutes } from "./routes/openai";
import { mediaRoutes } from "./routes/media";
import { adminRoutes } from "./routes/admin";
import { runKvDailyClear } from "./kv/cleanup";

const app = new Hono<{ Bindings: Env }>();

function getAssets(env: Env): Fetcher | null {
  const assets = (env as Partial<Env>).ASSETS;
  return assets && typeof assets.fetch === "function" ? assets : null;
}

function getBuildSha(env: Env): string {
  const v = String(env.BUILD_SHA ?? "").trim();
  return v || "dev";
}

function isDebugRequest(c: Context<{ Bindings: Env }>): boolean {
  try {
    return new URL(c.req.url).searchParams.get("debug") === "1";
  } catch {
    return false;
  }
}

function logError(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error(...args);
}

function withResponseHeaders(res: Response, extra: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function assetFetchError(message: string, buildSha: string): Response {
  return new Response(message, {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8", "x-grok2api-build": buildSha },
  });
}

function isRootRedirectResponse(res: Response, requestUrl: URL): boolean {
  if (![301, 302, 303, 307, 308].includes(res.status)) return false;
  const location = res.headers.get("location");
  if (!location) return false;
  try {
    const target = new URL(location, requestUrl);
    return target.pathname === "/" && target.search === "" && target.hash === "";
  } catch {
    return false;
  }
}

async function fetchAsset(c: Context<{ Bindings: Env }>, pathname: string): Promise<Response> {
  const assets = getAssets(c.env);
  const buildSha = getBuildSha(c.env);
  if (!assets) {
    logError("ASSETS binding missing: check wrangler.toml assets binding");
    return assetFetchError(
      'Internal Server Error: missing ASSETS binding. Check `wrangler.toml` `assets = { directory = \"./web/dist\", binding = \"ASSETS\" }` and redeploy.',
      buildSha,
    );
  }

  const url = new URL(c.req.url);
  url.pathname = pathname;
  try {
    const res = await assets.fetch(new Request(url.toString(), c.req.raw));
    const extra: Record<string, string> = { "x-grok2api-build": buildSha };

    // Avoid caching UI files aggressively, otherwise users may keep seeing old UI after redeploy.
    // We keep images/videos cacheable (handled by KV + cache proxy paths), but HTML/JS/CSS should refresh quickly.
    const lower = pathname.toLowerCase();
    if (lower.endsWith(".html") || lower.endsWith(".js") || lower.endsWith(".css")) {
      extra["cache-control"] = "no-store, no-cache, must-revalidate";
      extra["pragma"] = "no-cache";
      extra["expires"] = "0";
    }

    return withResponseHeaders(res, extra);
  } catch (err) {
    logError(`ASSETS fetch failed (${pathname}):`, err);
    const detail = isDebugRequest(c) ? `\n\n${err instanceof Error ? err.stack || err.message : String(err)}` : "";
    return assetFetchError(`Internal Server Error: failed to fetch asset ${pathname}.${detail}`, buildSha);
  }
}

app.onError((err, c) => {
  logError("Unhandled error:", err);
  const buildSha = getBuildSha(c.env);
  const detail = isDebugRequest(c) ? `\n\n${err instanceof Error ? err.stack || err.message : String(err)}` : "";
  const res = c.text(`Internal Server Error${detail}`, 500);
  return withResponseHeaders(res, { "x-grok2api-build": buildSha });
});

app.route("/v1", openAiRoutes);
app.route("/", mediaRoutes);
app.route("/", adminRoutes);

// Backward-compatible local-cache viewer URLs used by the multi-page admin UI.
// In Workers we serve cache via /images/*, so redirect /v1/files/* to /images/*.
app.get("/v1/files/image/:imgPath{.+}", (c) =>
  c.redirect(`/images/${encodeURIComponent(c.req.param("imgPath"))}`, 302),
);
app.get("/v1/files/video/:imgPath{.+}", (c) =>
  c.redirect(`/images/${encodeURIComponent(c.req.param("imgPath"))}`, 302),
);

app.get("/_worker.js", (c) => c.notFound());

app.get("/manage", (c) => c.redirect("/admin/token", 302));

// Chat is public-only. The old internal entry is removed.
app.get("/admin/chat", (c) => {
  const buildSha = getBuildSha(c.env);
  return withResponseHeaders(c.text("Not Found", 404), { "x-grok2api-build": buildSha });
});

app.get("/health", (c) =>
  c.json({
    status: "healthy",
    service: "Grok2API",
    runtime: "cloudflare-workers",
    build: { sha: getBuildSha(c.env) },
    bindings: {
      db: Boolean(c.env.DB),
      kv_cache: Boolean(c.env.KV_CACHE),
      assets: Boolean(getAssets(c.env)),
    },
  }),
);

app.notFound(async (c) => {
  const assets = getAssets(c.env);
  const buildSha = getBuildSha(c.env);
  // Avoid calling c.notFound() here because it will invoke this handler again.
  if (!assets) return withResponseHeaders(c.text("Not Found", 404), { "x-grok2api-build": buildSha });
  try {
    const reqUrl = new URL(c.req.url);
    let res = await assets.fetch(c.req.raw);
    if (isRootRedirectResponse(res, reqUrl)) {
      // Cloudflare ASSETS may redirect unknown extensionless paths to "/".
      // Treat that as a miss so SPA routes can be handled by index.html.
      res = new Response(null, { status: 404, statusText: "Not Found" });
    }
    if (res.status !== 404) {
      // Keep the header consistent for debugging/version checks.
      return withResponseHeaders(res, { "x-grok2api-build": buildSha });
    }

    const accept = c.req.header("accept") ?? "";
    const canServeSpa =
      c.req.method === "GET" &&
      accept.includes("text/html") &&
      !reqUrl.pathname.startsWith("/api/") &&
      !reqUrl.pathname.startsWith("/v1/") &&
      !reqUrl.pathname.startsWith("/images/") &&
      reqUrl.pathname !== "/admin/chat";

    if (!canServeSpa) {
      return withResponseHeaders(res, { "x-grok2api-build": buildSha });
    }

    const indexRes = await fetchAsset(c, "/index.html");
    return withResponseHeaders(indexRes, { "x-grok2api-build": buildSha });
  } catch (err) {
    logError("ASSETS fetch failed (notFound):", err);
    const detail = isDebugRequest(c) ? `\n\n${err instanceof Error ? err.stack || err.message : String(err)}` : "";
    return withResponseHeaders(c.text(`Internal Server Error${detail}`, 500), { "x-grok2api-build": buildSha });
  }
});

const handler: ExportedHandler<Env> = {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  scheduled: (_event, env, ctx) => {
    ctx.waitUntil(runKvDailyClear(env));
  },
};

export default handler;
