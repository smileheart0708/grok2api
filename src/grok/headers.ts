import type { GrokSettings } from "../settings";

/**
 * 动态请求头生成模块
 *
 * x-statsig-id：Grok 的反爬虫机制，需要模拟浏览器指纹
 * 动态模式下生成随机的 Sentry 错误信息作为指纹
 * 静态模式下使用用户配置的固定指纹
 */

// 基础请求头：模拟 Chrome 浏览器
const BASE_HEADERS: Record<string, string> = {
  Accept: "*/*",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Origin: "https://grok.com",
  Referer: "https://grok.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Sec-Ch-Ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  Baggage: "sentry-environment=production,sentry-public_key=b311e0f2690c81f25e2c4cf6d4f7ce1c",
};

function randomString(length: number, lettersOnly = true): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const chars = lettersOnly ? letters : letters + digits;
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += chars[bytes[i]! % chars.length]!;
  return out;
}

// 生成随机 Statsig ID：模拟浏览器 JavaScript 错误的 base64 编码
// Grok 使用此字段进行客户端指纹识别
// 两种模式：读取 null.children 或 undefined.xxx 的错误消息
function generateStatsigId(): string {
  let msg: string;
  if (Math.random() < 0.5) {
    const rand = randomString(5, false);
    msg = `e:TypeError: Cannot read properties of null (reading 'children['${rand}']')`;
  } else {
    const rand = randomString(10, true);
    msg = `e:TypeError: Cannot read properties of undefined (reading '${rand}')`;
  }
  return btoa(msg);
}

/**
 * 获取动态请求头
 *
 * @param settings - Grok 配置，包含 dynamic_statsig 和 x_statsig_id
 * @param pathname - API 路径，用于判断 Content-Type
 * @returns 完整的请求头对象
 */
export function getDynamicHeaders(settings: GrokSettings, pathname: string): Record<string, string> {
  const dynamic = settings.dynamic_statsig !== false;
  const statsigId = dynamic ? generateStatsigId() : (settings.x_statsig_id ?? "").trim();
  if (!dynamic && !statsigId) throw new Error("配置缺少 x_statsig_id（且未启用 dynamic_statsig）");

  const headers: Record<string, string> = { ...BASE_HEADERS };
  headers["x-statsig-id"] = statsigId;
  headers["x-xai-request-id"] = crypto.randomUUID();
  headers["Content-Type"] = pathname.includes("upload-file") ? "text/plain;charset=UTF-8" : "application/json";
  return headers;
}

