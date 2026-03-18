import type { GrokSettings } from "../settings";
import { getDynamicHeaders } from "./headers";
import { getModelEffortTier, toRateLimitModel } from "./models";
import { parseQuotaSnapshot, type ParsedQuotaSnapshot } from "./quota-parser";

/**
 * 速率限制检查模块
 *
 * 查询当前账户对指定模型的剩余配额
 * 用于在请求前判断是否需要切换账户或等待
 */
const RATE_LIMIT_API = "https://grok.com/rest/rate-limits";
const RATE_LIMIT_RESPONSE_BODY_LIMIT = 4096;

export interface RateLimitApiErrorResponse extends Record<string, unknown> {
  success: false;
  error: string;
  status: number | null;
  status_text: string | null;
  body: string | null;
  parse_error: string | null;
}

export interface RateLimitApiSuccessResponse extends Record<string, unknown> {
  success: true;
  status: number;
  status_text: string;
  body: string | null;
  payload: Record<string, unknown>;
  snapshot: ParsedQuotaSnapshot;
}

export type RateLimitApiResult = RateLimitApiSuccessResponse | RateLimitApiErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateBody(body: string): string | null {
  if (!body) return null;
  if (body.length <= RATE_LIMIT_RESPONSE_BODY_LIMIT) return body;
  return body.slice(0, RATE_LIMIT_RESPONSE_BODY_LIMIT);
}

function buildErrorResponse(args: {
  error: string;
  status: number | null;
  statusText: string | null;
  body: string | null;
  parseError: string | null;
}): RateLimitApiErrorResponse {
  return {
    success: false,
    error: args.error,
    status: args.status,
    status_text: args.statusText,
    body: args.body,
    parse_error: args.parseError,
  };
}

function buildHttpErrorResponse(
  status: number,
  statusText: string,
  body: string | null,
): RateLimitApiErrorResponse {
  return buildErrorResponse({
    error: `rate_limit_api_http_${String(status)}`,
    status,
    statusText,
    body,
    parseError: null,
  });
}

function buildParseErrorResponse(args: {
  status: number;
  statusText: string;
  body: string | null;
  parseError: string;
}): RateLimitApiErrorResponse {
  return buildErrorResponse({
    error: "rate_limit_api_parse_failed",
    status: args.status,
    statusText: args.statusText,
    body: args.body,
    parseError: args.parseError,
  });
}

function buildFetchErrorResponse(errorValue: unknown): RateLimitApiErrorResponse {
  return buildErrorResponse({
    error: "rate_limit_api_fetch_failed",
    status: null,
    statusText: null,
    body: null,
    parseError: errorValue instanceof Error ? errorValue.message : String(errorValue),
  });
}

export async function checkRateLimits(
  cookie: string,
  settings: GrokSettings,
  model: string,
): Promise<RateLimitApiResult> {
  const rateModel = toRateLimitModel(model);
  const headers = getDynamicHeaders(settings, "/rest/rate-limits");
  headers["Cookie"] = cookie;
  const body = JSON.stringify({ requestKind: "DEFAULT", modelName: rateModel });

  try {
    const resp = await fetch(RATE_LIMIT_API, { method: "POST", headers, body });
    const statusText = resp.statusText || "";
    // Keep the raw body so admins can inspect upstream drift instead of only seeing a null quota snapshot.
    const responseBody = await resp.text().catch(() => "");
    const clippedBody = truncateBody(responseBody);

    if (!resp.ok) {
      return buildHttpErrorResponse(resp.status, statusText, clippedBody);
    }

    let parsed: unknown;
    try {
      parsed = responseBody ? JSON.parse(responseBody) : null;
    } catch (errorValue) {
      return buildParseErrorResponse({
        status: resp.status,
        statusText,
        body: clippedBody,
        parseError: errorValue instanceof Error ? errorValue.message : String(errorValue),
      });
    }

    if (!isRecord(parsed)) {
      return buildParseErrorResponse({
        status: resp.status,
        statusText,
        body: clippedBody,
        parseError: "rate_limit_response_is_not_object",
      });
    }

    const snapshot = parseQuotaSnapshot(parsed, getModelEffortTier(model));
    if (snapshot.metric_kind === "unknown") {
      return buildParseErrorResponse({
        status: resp.status,
        statusText,
        body: clippedBody,
        parseError: "rate_limit_payload_missing_quota_fields",
      });
    }

    return {
      success: true,
      status: resp.status,
      status_text: statusText,
      body: clippedBody,
      payload: parsed,
      snapshot,
    };
  } catch (errorValue) {
    return buildFetchErrorResponse(errorValue);
  }
}

