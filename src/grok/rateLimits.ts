import type { GrokSettings } from "../settings";
import { getDynamicHeaders } from "./headers";
import { toRateLimitModel } from "./models";

/**
 * 速率限制检查模块
 *
 * 查询当前账户对指定模型的剩余配额
 * 用于在请求前判断是否需要切换账户或等待
 */
const RATE_LIMIT_API = "https://grok.com/rest/rate-limits";

export async function checkRateLimits(
  cookie: string,
  settings: GrokSettings,
  model: string,
): Promise<Record<string, unknown> | null> {
  const rateModel = toRateLimitModel(model);
  const headers = getDynamicHeaders(settings, "/rest/rate-limits");
  headers["Cookie"] = cookie;
  const body = JSON.stringify({ requestKind: "DEFAULT", modelName: rateModel });

  const resp = await fetch(RATE_LIMIT_API, { method: "POST", headers, body });
  if (!resp.ok) return null;
  return (await resp.json()) as Record<string, unknown>;
}

