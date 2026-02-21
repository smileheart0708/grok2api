import type { Env } from "../../env";
import { buildConversationPayload, sendConversationRequest } from "../../grok/conversation";
import { getDynamicHeaders } from "../../grok/headers";
import {
  IMAGE_METHOD_IMAGINE_WS_EXPERIMENTAL,
  generateImagineWs,
  resolveImageGenerationMethod,
  sendExperimentalImageEditRequest,
} from "../../grok/imagineExperimental";
import { MODEL_CONFIG, isValidModel } from "../../grok/models";
import { addRequestLog } from "../../repo/logs";
import { getSettings } from "../../settings";
import { arrayBufferToBase64 } from "../../utils/base64";
import { runTasksSettledWithLimit } from "./common";

export function base64UrlEncodeString(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function encodeAssetPath(raw: string): string {
  try {
    const u = new URL(raw);
    return `u_${base64UrlEncodeString(u.toString())}`;
  } catch {
    const p = raw.startsWith("/") ? raw : `/${raw}`;
    return `p_${base64UrlEncodeString(p)}`;
  }
}

export function toProxyUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/images/${path}`;
}

export type ImageResponseFormat = "url" | "base64" | "b64_json";

export function resolveResponseFormat(raw: unknown, defaultMode: string): ImageResponseFormat | null {
  const fallback = String(defaultMode || "url").trim().toLowerCase();
  const candidate =
    typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : fallback;
  if (candidate === "url" || candidate === "base64" || candidate === "b64_json") {
    return candidate;
  }
  return null;
}

export function responseFieldName(format: ImageResponseFormat): ImageResponseFormat {
  return format;
}

export function toBool(input: unknown): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input === 1;
  if (typeof input !== "string") return false;
  const normalized = input.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function normalizeGeneratedImageUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => Boolean(u && u !== "/"));
}

export function dedupeImages(images: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of images) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function pickImageResults(images: string[], n: number): string[] {
  if (images.length >= n) {
    const pool = images.slice();
    const picked: string[] = [];
    while (picked.length < n && pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      const [item] = pool.splice(idx, 1);
      if (item) picked.push(item);
    }
    return picked;
  }
  const picked = images.slice();
  while (picked.length < n) picked.push("error");
  return picked;
}

export function normalizeImageMime(mime: string): string {
  const m = (mime || "").trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

export function mimeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

export async function fetchImageAsBase64(args: {
  rawUrl: string;
  cookie: string;
  settings: Awaited<ReturnType<typeof getSettings>>["grok"];
}): Promise<string> {
  let url: URL;
  try {
    url = new URL(args.rawUrl);
  } catch {
    const p = args.rawUrl.startsWith("/") ? args.rawUrl : `/${args.rawUrl}`;
    url = new URL(`https://assets.grok.com${p}`);
  }

  const headers = getDynamicHeaders(args.settings, url.pathname || "/");
  headers["Cookie"] = args.cookie;
  delete headers["Content-Type"];
  headers["Accept"] = "image/avif,image/webp,image/*,*/*;q=0.8";
  headers["Sec-Fetch-Dest"] = "image";
  headers["Sec-Fetch-Mode"] = "no-cors";
  headers["Sec-Fetch-Site"] = "same-site";
  headers["Referer"] = "https://grok.com/";

  const resp = await fetch(url.toString(), { method: "GET", headers, redirect: "follow" });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Image download failed: ${resp.status} ${txt.slice(0, 200)}`);
  }
  return arrayBufferToBase64(await resp.arrayBuffer());
}

export async function convertRawUrlByFormat(
  rawUrl: string,
  responseFormat: ImageResponseFormat,
  args: {
    baseUrl: string;
    cookie: string;
    settings: Awaited<ReturnType<typeof getSettings>>["grok"];
  },
): Promise<string> {
  if (responseFormat === "url") {
    return toProxyUrl(args.baseUrl, encodeAssetPath(rawUrl));
  }
  return fetchImageAsBase64({ rawUrl, cookie: args.cookie, settings: args.settings });
}

export async function collectImageUrls(resp: Response): Promise<string[]> {
  const text = await resp.text();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const allUrls: string[] = [];
  for (const line of lines) {
    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }
    const err = data?.error;
    if (err?.message) throw new Error(String(err.message));
    const grok = data?.result?.response;
    const urls = normalizeGeneratedImageUrls(grok?.modelResponse?.generatedImageUrls);
    if (urls.length) allUrls.push(...urls);
  }
  return allUrls;
}

export function buildImageSse(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createImageEventStream(args: {
  upstream: Response;
  responseFormat: ImageResponseFormat;
  baseUrl: string;
  cookie: string;
  settings: Awaited<ReturnType<typeof getSettings>>["grok"];
  n: number;
  onFinish?: (result: { status: number; duration: number }) => Promise<void> | void;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const responseField = responseFieldName(args.responseFormat);
  const targetIndex = args.n === 1 ? Math.floor(Math.random() * 2) : null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      const body = args.upstream.body;
      if (!body) {
        if (args.onFinish) {
          await args.onFinish({ status: 500, duration: (Date.now() - startedAt) / 1000 });
        }
        controller.close();
        return;
      }

      const reader = body.getReader();
      const finalImages: string[] = [];
      let buffer = "";
      let failed = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          buffer += decoder.decode(value, { stream: true });
          let idx = buffer.indexOf("\n");
          while (idx >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) {
              idx = buffer.indexOf("\n");
              continue;
            }

            let data: any;
            try {
              data = JSON.parse(line);
            } catch {
              idx = buffer.indexOf("\n");
              continue;
            }

            const err = data?.error;
            if (err?.message) throw new Error(String(err.message));

            const resp = data?.result?.response ?? {};
            const progressInfo = resp.streamingImageGenerationResponse;
            if (progressInfo) {
              const imageIndex = Number(progressInfo.imageIndex ?? 0);
              const progress = Number(progressInfo.progress ?? 0);
              if (args.n === 1 && imageIndex !== targetIndex) {
                idx = buffer.indexOf("\n");
                continue;
              }
              const outIndex = args.n === 1 ? 0 : imageIndex;
              controller.enqueue(
                encoder.encode(
                  buildImageSse("image_generation.partial_image", {
                    type: "image_generation.partial_image",
                    [responseField]: "",
                    index: outIndex,
                    progress,
                  }),
                ),
              );
            }

            const rawUrls = normalizeGeneratedImageUrls(resp?.modelResponse?.generatedImageUrls);
            if (rawUrls.length) {
              for (const rawUrl of rawUrls) {
                const converted = await convertRawUrlByFormat(rawUrl, args.responseFormat, {
                  baseUrl: args.baseUrl,
                  cookie: args.cookie,
                  settings: args.settings,
                });
                finalImages.push(converted);
              }
            }
            idx = buffer.indexOf("\n");
          }
        }

        for (let i = 0; i < finalImages.length; i++) {
          if (args.n === 1 && i !== targetIndex) continue;
          const outIndex = args.n === 1 ? 0 : i;
          controller.enqueue(
            encoder.encode(
              buildImageSse("image_generation.completed", {
                type: "image_generation.completed",
                [responseField]: finalImages[i] ?? "",
                index: outIndex,
                usage: {
                  total_tokens: 50,
                  input_tokens: 25,
                  output_tokens: 25,
                  input_tokens_details: { text_tokens: 5, image_tokens: 20 },
                },
              }),
            ),
          );
        }
        if (args.onFinish) {
          await args.onFinish({ status: 200, duration: (Date.now() - startedAt) / 1000 });
        }
      } catch (e) {
        failed = true;
        console.error("Image stream processing failed:", e);
        if (args.onFinish) {
          await args.onFinish({ status: 500, duration: (Date.now() - startedAt) / 1000 });
        }
        controller.error(e);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
        if (!failed) controller.close();
      }
    },
  });
}

export function imageResponseData(field: ImageResponseFormat, values: string[]) {
  return values.map((v) => ({ [field]: v }));
}

export function getTokenSuffix(token: string): string {
  return token.length >= 6 ? token.slice(-6) : token;
}

export const IMAGE_GENERATION_MODEL_ID = "grok-imagine-1.0";
export const IMAGE_EDIT_MODEL_ID = "grok-imagine-1.0-edit";

export function parseImageCount(input: unknown): number {
  const raw = Number(input ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(10, Math.floor(raw)));
}

export function parseImagePrompt(input: unknown): string {
  return String(input ?? "").trim();
}

export function parseImageModel(input: unknown, fallback: string): string {
  return String(input ?? fallback).trim() || fallback;
}

export function parseImageStream(input: unknown): boolean {
  return toBool(input);
}

export function parseImageSize(input: unknown): string {
  return String(input ?? "1024x1024").trim() || "1024x1024";
}

export function parseImageConcurrencyOrError(
  input: unknown,
): { value: number } | { error: { message: string; code: string } } {
  if (input === undefined || input === null || String(input).trim() === "") {
    return { value: 1 };
  }
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return {
      error: { message: "concurrency must be between 1 and 3", code: "invalid_concurrency" },
    };
  }
  const value = Math.floor(parsed);
  if (value < 1 || value > 3) {
    return {
      error: { message: "concurrency must be between 1 and 3", code: "invalid_concurrency" },
    };
  }
  return { value };
}

export function parseAllowedImageMime(file: File): string | null {
  const byMime = normalizeImageMime(String(file.type || ""));
  if (byMime === "image/png" || byMime === "image/jpeg" || byMime === "image/webp") return byMime;
  const byName = mimeFromFilename(String(file.name || ""));
  if (byName) return byName;
  return null;
}

export function buildCookie(token: string, cf: string): string {
  return cf ? `sso-rw=${token};sso=${token};${cf}` : `sso-rw=${token};sso=${token}`;
}

export async function runImageCall(args: {
  requestModel: string;
  prompt: string;
  fileIds: string[];
  cookie: string;
  settings: Awaited<ReturnType<typeof getSettings>>["grok"];
  responseFormat: ImageResponseFormat;
  baseUrl: string;
}): Promise<string[]> {
  const { payload, referer } = buildConversationPayload({
    requestModel: args.requestModel,
    content: args.prompt,
    imgIds: args.fileIds,
    imgUris: [],
    settings: args.settings,
  });
  const upstream = await sendConversationRequest({
    payload,
    cookie: args.cookie,
    settings: args.settings,
    ...(referer ? { referer } : {}),
  });
  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => "");
    throw new Error(`Upstream ${upstream.status}: ${txt.slice(0, 200)}`);
  }
  const rawUrls = await collectImageUrls(upstream);
  const converted = await Promise.all(
    rawUrls.map((rawUrl) =>
      convertRawUrlByFormat(rawUrl, args.responseFormat, {
        baseUrl: args.baseUrl,
        cookie: args.cookie,
        settings: args.settings,
      }),
    ),
  );
  return converted.filter(Boolean);
}

export async function runImageStreamCall(args: {
  requestModel: string;
  prompt: string;
  fileIds: string[];
  cookie: string;
  settings: Awaited<ReturnType<typeof getSettings>>["grok"];
}): Promise<Response> {
  const { payload, referer } = buildConversationPayload({
    requestModel: args.requestModel,
    content: args.prompt,
    imgIds: args.fileIds,
    imgUris: [],
    settings: args.settings,
  });
  return sendConversationRequest({
    payload,
    cookie: args.cookie,
    settings: args.settings,
    ...(referer ? { referer } : {}),
  });
}

export function imageGenerationMethod(settingsBundle: Awaited<ReturnType<typeof getSettings>>) {
  return resolveImageGenerationMethod(settingsBundle.grok.image_generation_method);
}

export async function collectExperimentalGenerationImages(args: {
  prompt: string;
  n: number;
  cookie: string;
  settings: Awaited<ReturnType<typeof getSettings>>["grok"];
  responseFormat: ImageResponseFormat;
  baseUrl: string;
  aspectRatio: string;
  concurrency: number;
}): Promise<string[]> {
  const calls = Math.ceil(Math.max(1, args.n) / 4);
  const plans = Array.from({ length: calls }, (_, i) => {
    const alreadyPlanned = i * 4;
    const chunkN = Math.max(1, Math.min(4, args.n - alreadyPlanned));
    return { chunkN };
  });

  const settled = await runTasksSettledWithLimit(
    plans,
    Math.min(plans.length, Math.max(1, args.concurrency || 1)),
    async (plan) =>
      generateImagineWs({
        prompt: args.prompt,
        n: plan.chunkN,
        cookie: args.cookie,
        settings: args.settings,
        aspectRatio: args.aspectRatio,
      }),
  );
  const rawUrls: string[] = [];
  for (const item of settled) {
    if (item.status === "fulfilled") rawUrls.push(...item.value);
  }
  if (!rawUrls.length) {
    const firstRejected = settled.find(
      (item): item is PromiseRejectedResult => item.status === "rejected",
    );
    if (firstRejected) throw firstRejected.reason;
    throw new Error("Experimental imagine websocket returned no images");
  }
  const dedupedRawUrls = dedupeImages(rawUrls);

  const converted = await Promise.all(
    dedupedRawUrls.map((rawUrl) =>
      convertRawUrlByFormat(rawUrl, args.responseFormat, {
        baseUrl: args.baseUrl,
        cookie: args.cookie,
        settings: args.settings,
      }),
    ),
  );
  return dedupeImages(converted.filter(Boolean));
}

export async function runExperimentalImageEditCall(args: {
  prompt: string;
  fileUris: string[];
  cookie: string;
  settings: Awaited<ReturnType<typeof getSettings>>["grok"];
  responseFormat: ImageResponseFormat;
  baseUrl: string;
}): Promise<string[]> {
  const upstream = await sendExperimentalImageEditRequest({
    prompt: args.prompt,
    fileUris: args.fileUris,
    cookie: args.cookie,
    settings: args.settings,
  });
  const rawUrls = await collectImageUrls(upstream);
  const converted = await Promise.all(
    rawUrls.map((rawUrl) =>
      convertRawUrlByFormat(rawUrl, args.responseFormat, {
        baseUrl: args.baseUrl,
        cookie: args.cookie,
        settings: args.settings,
      }),
    ),
  );
  return converted.filter(Boolean);
}

export function createSyntheticImageEventStream(args: {
  selected: string[];
  responseField: ImageResponseFormat;
  onFinish?: (result: { status: number; duration: number }) => Promise<void> | void;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      try {
        let emitted = false;
        for (let i = 0; i < args.selected.length; i++) {
          const value = args.selected[i];
          if (!value || value === "error") continue;
          emitted = true;

          controller.enqueue(
            encoder.encode(
              buildImageSse("image_generation.partial_image", {
                type: "image_generation.partial_image",
                [args.responseField]: "",
                index: i,
                progress: 100,
              }),
            ),
          );
          controller.enqueue(
            encoder.encode(
              buildImageSse("image_generation.completed", {
                type: "image_generation.completed",
                [args.responseField]: value,
                index: i,
                usage: {
                  total_tokens: 50,
                  input_tokens: 25,
                  output_tokens: 25,
                  input_tokens_details: { text_tokens: 5, image_tokens: 20 },
                },
              }),
            ),
          );
        }

        if (!emitted) {
          controller.enqueue(
            encoder.encode(
              buildImageSse("image_generation.completed", {
                type: "image_generation.completed",
                [args.responseField]: "error",
                index: 0,
                usage: {
                  total_tokens: 0,
                  input_tokens: 0,
                  output_tokens: 0,
                  input_tokens_details: { text_tokens: 0, image_tokens: 0 },
                },
              }),
            ),
          );
        }

        if (args.onFinish) {
          await args.onFinish({ status: 200, duration: (Date.now() - startedAt) / 1000 });
        }
        controller.close();
      } catch (e) {
        if (args.onFinish) {
          await args.onFinish({ status: 500, duration: (Date.now() - startedAt) / 1000 });
        }
        controller.error(e);
      }
    },
  });
}

export function createStreamErrorImageEventStream(args: {
  message: string;
  responseField: ImageResponseFormat;
  onFinish?: (result: { status: number; duration: number }) => Promise<void> | void;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      try {
        controller.enqueue(
          encoder.encode(
            buildImageSse("image_generation.error", {
              type: "image_generation.error",
              message: args.message,
            }),
          ),
        );
        controller.enqueue(
          encoder.encode(
            buildImageSse("image_generation.completed", {
              type: "image_generation.completed",
              [args.responseField]: "error",
              index: 0,
              usage: {
                total_tokens: 0,
                input_tokens: 0,
                output_tokens: 0,
                input_tokens_details: { text_tokens: 0, image_tokens: 0 },
              },
            }),
          ),
        );
        if (args.onFinish) {
          await args.onFinish({ status: 500, duration: (Date.now() - startedAt) / 1000 });
        }
        controller.close();
      } catch (e) {
        if (args.onFinish) {
          await args.onFinish({ status: 500, duration: (Date.now() - startedAt) / 1000 });
        }
        controller.error(e);
      }
    },
  });
}

export function createExperimentalImageEventStream(args: {
  prompt: string;
  n: number;
  cookie: string;
  settings: Awaited<ReturnType<typeof getSettings>>["grok"];
  responseFormat: ImageResponseFormat;
  responseField: ImageResponseFormat;
  baseUrl: string;
  aspectRatio: string;
  concurrency: number;
  onFinish?: (result: { status: number; duration: number }) => Promise<void> | void;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const safeN = Math.max(1, Math.floor(args.n || 1));
  const concurrency = Math.max(1, Math.min(3, Math.floor(args.concurrency || 1)));

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      const completedByIndex = new Map<number, string>();

      const emitPartial = (index: number, progress: number) => {
        if (index < 0 || index >= safeN) return;
        const pct = Math.max(0, Math.min(100, Number(progress) || 0));
        controller.enqueue(
          encoder.encode(
            buildImageSse("image_generation.partial_image", {
              type: "image_generation.partial_image",
              [args.responseField]: "",
              index,
              progress: pct,
            }),
          ),
        );
      };

      const emitCompleted = (index: number, value: string) => {
        if (index < 0 || index >= safeN) return;
        if (completedByIndex.has(index)) return;
        const finalValue = String(value || "").trim() || "error";
        completedByIndex.set(index, finalValue);
        const isError = finalValue === "error";
        controller.enqueue(
          encoder.encode(
            buildImageSse("image_generation.completed", {
              type: "image_generation.completed",
              [args.responseField]: finalValue,
              index,
              usage: {
                total_tokens: isError ? 0 : 50,
                input_tokens: isError ? 0 : 25,
                output_tokens: isError ? 0 : 25,
                input_tokens_details: {
                  text_tokens: isError ? 0 : 5,
                  image_tokens: isError ? 0 : 20,
                },
              },
            }),
          ),
        );
      };

      const toOutIndex = (offset: number, localIndex: number) =>
        Math.max(0, Math.min(safeN - 1, offset + Math.max(0, Math.floor(localIndex || 0))));

      try {
        const callCount = Math.ceil(safeN / 4);
        const plans = Array.from({ length: callCount }, (_, i) => {
          const offset = i * 4;
          const chunkN = Math.max(1, Math.min(4, safeN - offset));
          return { offset, chunkN };
        });

        const settled = await runTasksSettledWithLimit(
          plans,
          Math.min(plans.length, concurrency),
          async (plan) => {
            const rawUrls = await generateImagineWs({
              prompt: args.prompt,
              n: plan.chunkN,
              cookie: args.cookie,
              settings: args.settings,
              aspectRatio: args.aspectRatio,
              progressCb: ({ index, progress }) => {
                emitPartial(toOutIndex(plan.offset, index), progress);
              },
              completedCb: async ({ index, url }) => {
                const converted = await convertRawUrlByFormat(url, args.responseFormat, {
                  baseUrl: args.baseUrl,
                  cookie: args.cookie,
                  settings: args.settings,
                });
                if (converted) {
                  emitCompleted(toOutIndex(plan.offset, index), converted);
                }
              },
            });
            return { plan, rawUrls };
          },
        );

        for (const item of settled) {
          if (item.status !== "fulfilled") continue;
          const { plan, rawUrls } = item.value;
          for (let i = 0; i < rawUrls.length; i++) {
            const outIndex = toOutIndex(plan.offset, i);
            if (completedByIndex.has(outIndex)) continue;
            const converted = await convertRawUrlByFormat(rawUrls[i] ?? "", args.responseFormat, {
              baseUrl: args.baseUrl,
              cookie: args.cookie,
              settings: args.settings,
            });
            if (converted) {
              emitCompleted(outIndex, converted);
            }
          }
        }

        if (!Array.from(completedByIndex.values()).some((v) => v && v !== "error")) {
          try {
            const allImages = await collectExperimentalGenerationImages({
              prompt: args.prompt,
              n: safeN,
              cookie: args.cookie,
              settings: args.settings,
              responseFormat: args.responseFormat,
              baseUrl: args.baseUrl,
              aspectRatio: args.aspectRatio,
              concurrency,
            });
            const selected = pickImageResults(dedupeImages(allImages), safeN);
            for (let i = 0; i < selected.length; i++) {
              const value = selected[i] ?? "error";
              if (value !== "error") emitPartial(i, 100);
              emitCompleted(i, value);
            }
          } catch (fallbackErr) {
            const message = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            controller.enqueue(
              encoder.encode(
                buildImageSse("image_generation.error", {
                  type: "image_generation.error",
                  message,
                }),
              ),
            );
          }
        }

        for (let i = 0; i < safeN; i++) {
          if (!completedByIndex.has(i)) {
            emitCompleted(i, "error");
          }
        }

        const success = Array.from(completedByIndex.values()).some((v) => v !== "error");
        if (args.onFinish) {
          await args.onFinish({ status: success ? 200 : 500, duration: (Date.now() - startedAt) / 1000 });
        }
        controller.close();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        controller.enqueue(
          encoder.encode(
            buildImageSse("image_generation.error", {
              type: "image_generation.error",
              message,
            }),
          ),
        );
        if (!completedByIndex.has(0)) emitCompleted(0, "error");
        if (args.onFinish) {
          await args.onFinish({ status: 500, duration: (Date.now() - startedAt) / 1000 });
        }
        controller.close();
      }
    },
  });
}

export function streamHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  };
}

export function isValidImageModel(model: string): boolean {
  if (!isValidModel(model)) return false;
  const cfg = MODEL_CONFIG[model];
  return Boolean(cfg?.is_image_model);
}

export function invalidResponseFormatMessage(): string {
  return "response_format must be one of [\"b64_json\", \"base64\", \"url\"]";
}

export function invalidStreamNMessage(): string {
  return "Streaming is only supported when n=1 or n=2";
}

export function imageUsagePayload(values: string[]) {
  return {
    total_tokens: 0 * values.filter((v) => v !== "error").length,
    input_tokens: 0,
    output_tokens: 0 * values.filter((v) => v !== "error").length,
    input_tokens_details: { text_tokens: 0, image_tokens: 0 },
  };
}

export function createdTs(): number {
  return Math.floor(Date.now() / 1000);
}

export function buildImageJsonPayload(field: ImageResponseFormat, values: string[]) {
  return {
    created: createdTs(),
    data: imageResponseData(field, values),
    usage: imageUsagePayload(values),
  };
}

export async function recordImageLog(args: {
  env: Env;
  ip: string;
  model: string;
  start: number;
  keyName: string;
  status: number;
  tokenSuffix?: string;
  error: string;
}) {
  const duration = (Date.now() - args.start) / 1000;
  await addRequestLog(args.env.DB, {
    ip: args.ip,
    model: args.model,
    duration: Number(duration.toFixed(2)),
    status: args.status,
    key_name: args.keyName,
    token_suffix: args.tokenSuffix ?? "",
    error: args.error,
  });
}

export function listImageFiles(form: FormData): File[] {
  return [...form.getAll("image"), ...form.getAll("image[]")].filter(
    (item): item is File => item instanceof File,
  );
}

export function nonEmptyPromptOrError(prompt: string) {
  if (prompt) return null;
  return { message: "Missing 'prompt'", code: "missing_prompt" };
}

export function invalidGenerationModelOrError(model: string) {
  if (model !== IMAGE_GENERATION_MODEL_ID) {
    return {
      message: `The model '${IMAGE_GENERATION_MODEL_ID}' is required for image generations.`,
      code: "model_not_supported",
    };
  }
  if (!isValidModel(model)) return { message: `Model '${model}' not supported`, code: "model_not_supported" };
  if (!isValidImageModel(model)) return { message: `Model '${model}' is not an image model`, code: "invalid_model" };
  return null;
}

export function invalidEditModelOrError(model: string) {
  if (model !== IMAGE_EDIT_MODEL_ID) {
    return {
      message: `The model '${IMAGE_EDIT_MODEL_ID}' is required for image edits.`,
      code: "model_not_supported",
    };
  }
  if (!isValidModel(model)) return { message: `Model '${model}' not supported`, code: "model_not_supported" };
  if (!isValidImageModel(model)) return { message: `Model '${model}' is not an image model`, code: "invalid_model" };
  return null;
}

export function baseUrlFromSettings(settingsBundle: Awaited<ReturnType<typeof getSettings>>, origin: string): string {
  return (settingsBundle.global.base_url ?? "").trim() || origin;
}

export function imageCallPrompt(kind: "generation" | "edit", prompt: string): string {
  return kind === "edit" ? `Image Edit: ${prompt}` : `Image Generation: ${prompt}`;
}

export function imageFormatDefault(settingsBundle: Awaited<ReturnType<typeof getSettings>>): string {
  return String(settingsBundle.global.image_mode ?? "url");
}

export function parseResponseFormatOrError(raw: unknown, defaultMode: string) {
  const resolved = resolveResponseFormat(raw, defaultMode);
  if (!resolved) {
    return { error: { message: invalidResponseFormatMessage(), code: "invalid_response_format" } };
  }
  return { value: resolved };
}

export function resolveImageResponseFormatByMethodOrError(
  raw: unknown,
  defaultMode: string,
  imageMethod: ReturnType<typeof resolveImageGenerationMethod>,
) {
  const missing =
    raw === undefined ||
    raw === null ||
    (typeof raw === "string" && raw.trim().length === 0);
  const normalizedDefault = String(defaultMode || "url").trim().toLowerCase();
  const effectiveDefault =
    missing &&
    imageMethod === IMAGE_METHOD_IMAGINE_WS_EXPERIMENTAL &&
    normalizedDefault === "url"
      ? "b64_json"
      : defaultMode;
  return parseResponseFormatOrError(raw, effectiveDefault);
}
