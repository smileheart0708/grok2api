import { normalizeCfCookie, getSettings } from "../../settings";
import { createMediaPost, createPost } from "../../grok/create";
import {
  buildConversationPayload,
  extractContent,
  sendConversationRequest,
  type OpenAIChatMessage,
} from "../../grok/conversation";
import { MODEL_CONFIG, isValidModel } from "../../grok/models";
import { createOpenAiStreamFromGrokNdjson, parseOpenAiFromGrokNdjson } from "../../grok/processor";
import { uploadImage } from "../../grok/upload";
import { addRequestLog } from "../../repo/logs";
import { applyCooldown, recordTokenFailure, releaseTokenReservation } from "../../repo/tokens";
import { scheduleDelayedTokenRefresh } from "../../kv/tokenRefresh";
import { acquireTokenReservationWithProbe, getClientIp, mapLimit, openAiError } from "./common";
import { enforceQuota } from "./quota";
import type { OpenAiRoutesApp } from "./types";

interface ChatRequestBody {
  model?: string;
  messages?: OpenAIChatMessage[];
  stream?: boolean;
  video_config?: {
    aspect_ratio?: string;
    video_length?: number;
    resolution?: string;
    preset?: string;
  };
}

export function registerChatRoutes(openAiRoutes: OpenAiRoutesApp): void {
  openAiRoutes.post("/chat/completions", async (c) => {
    const start = Date.now();
    const ip = getClientIp(c.req.raw);
    const keyName = c.get("apiAuth").name ?? "Unknown";
    const origin = new URL(c.req.url).origin;

    let requestedModel = "";
    try {
      const body = (await c.req.json()) as ChatRequestBody;

      requestedModel = String(body.model ?? "");
      if (!requestedModel) return c.json(openAiError("Missing 'model'", "missing_model"), 400);
      if (!Array.isArray(body.messages)) {
        return c.json(openAiError("Missing 'messages'", "missing_messages"), 400);
      }
      if (!isValidModel(requestedModel)) {
        return c.json(
          openAiError(`Model '${requestedModel}' not supported`, "model_not_supported"),
          400,
        );
      }

      const settingsBundle = await getSettings(c.env);
      const cfg = MODEL_CONFIG[requestedModel];
      if (!cfg) {
        return c.json(openAiError(`Model '${requestedModel}' not supported`, "model_not_supported"), 400);
      }

      const retryCodes = Array.isArray(settingsBundle.grok.retry_status_codes)
        ? settingsBundle.grok.retry_status_codes
        : [401, 429];

      const stream = Boolean(body.stream);
      const maxRetry = 3;
      let lastErr: string | null = null;

      const quotaKind: "chat" | "image" | "video" = cfg.is_video_model
        ? "video"
        : cfg.is_image_model
          ? "image"
          : "chat";
      const quota = await enforceQuota({
        env: c.env,
        apiAuth: c.get("apiAuth"),
        model: requestedModel,
        kind: quotaKind,
        ...(cfg.is_image_model ? { imageCount: 2 } : {}),
      });
      if (!quota.ok) return quota.resp;

      for (let attempt = 0; attempt < maxRetry; attempt++) {
        const reservation = await acquireTokenReservationWithProbe({
          env: c.env,
          settings: settingsBundle,
          model: requestedModel,
          cost: {
            chat: 1,
            heavy: requestedModel === "grok-4-heavy" ? 1 : 0,
          },
        });
        if (!reservation) return c.json(openAiError("No available token", "NO_AVAILABLE_TOKEN"), 503);

        const jwt = reservation.token;
        const cf = normalizeCfCookie(settingsBundle.grok.cf_clearance ?? "");
        const cookie = cf ? `sso-rw=${jwt};sso=${jwt};${cf}` : `sso-rw=${jwt};sso=${jwt}`;

        const { content, images } = extractContent(body.messages);
        const isVideoModel = Boolean(cfg.is_video_model);
        const imgInputs = isVideoModel && images.length > 1 ? images.slice(0, 1) : images;

        try {
          const uploads = await mapLimit(imgInputs, 5, (u) =>
            uploadImage(u, cookie, settingsBundle.grok),
          );
          const imgIds = uploads.map((u) => u.fileId).filter(Boolean);
          const imgUris = uploads.map((u) => u.fileUri).filter(Boolean);

          let postId: string | undefined;
          if (isVideoModel) {
            const firstUri = imgUris[0];
            if (firstUri) {
              const post = await createPost(firstUri, cookie, settingsBundle.grok);
              postId = post.postId || undefined;
            } else {
              const post = await createMediaPost(
                { mediaType: "MEDIA_POST_TYPE_VIDEO", prompt: content },
                cookie,
                settingsBundle.grok,
              );
              postId = post.postId || undefined;
            }
          }

          const { payload, referer } = buildConversationPayload({
            requestModel: requestedModel,
            content,
            imgIds,
            imgUris,
            ...(postId ? { postId } : {}),
            ...(isVideoModel && body.video_config ? { videoConfig: body.video_config } : {}),
            settings: settingsBundle.grok,
          });

          const upstream = await sendConversationRequest({
            payload,
            cookie,
            settings: settingsBundle.grok,
            ...(referer ? { referer } : {}),
          });

          if (!upstream.ok) {
            const txt = await upstream.text().catch(() => "");
            lastErr = `Upstream ${upstream.status}: ${txt.slice(0, 200)}`;
            await releaseTokenReservation(c.env.DB, reservation);
            await recordTokenFailure(c.env.DB, jwt, upstream.status, txt.slice(0, 200));
            await applyCooldown(c.env.DB, jwt, upstream.status);
            if (retryCodes.includes(upstream.status) && attempt < maxRetry - 1) continue;
            break;
          }

          scheduleDelayedTokenRefresh({
            env: c.env,
            executionCtx: c.executionCtx,
            token: jwt,
            source: "chat_completions",
            model: requestedModel,
          });

          if (stream) {
            const sse = createOpenAiStreamFromGrokNdjson(upstream, {
              cookie,
              settings: settingsBundle.grok,
              global: settingsBundle.global,
              origin,
              onFinish: async ({ status, duration }) => {
                await addRequestLog(c.env.DB, {
                  ip,
                  model: requestedModel,
                  duration: Number(duration.toFixed(2)),
                  status,
                  key_name: keyName,
                  token_suffix: jwt.slice(-6),
                  error: status === 200 ? "" : "stream_error",
                });
              },
            });

            return new Response(sse, {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
              },
            });
          }

          const json = await parseOpenAiFromGrokNdjson(upstream, {
            cookie,
            settings: settingsBundle.grok,
            global: settingsBundle.global,
            origin,
            requestedModel,
          });

          const duration = (Date.now() - start) / 1000;
          await addRequestLog(c.env.DB, {
            ip,
            model: requestedModel,
            duration: Number(duration.toFixed(2)),
            status: 200,
            key_name: keyName,
            token_suffix: jwt.slice(-6),
            error: "",
          });

          return c.json(json);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          lastErr = msg;
          await releaseTokenReservation(c.env.DB, reservation);
          await recordTokenFailure(c.env.DB, jwt, 500, msg);
          await applyCooldown(c.env.DB, jwt, 500);
          if (attempt < maxRetry - 1) continue;
        }
      }

      const duration = (Date.now() - start) / 1000;
      await addRequestLog(c.env.DB, {
        ip,
        model: requestedModel,
        duration: Number(duration.toFixed(2)),
        status: 500,
        key_name: keyName,
        token_suffix: "",
        error: lastErr ?? "unknown_error",
      });

      return c.json(openAiError(lastErr ?? "Upstream error", "upstream_error"), 500);
    } catch (e) {
      const duration = (Date.now() - start) / 1000;
      await addRequestLog(c.env.DB, {
        ip,
        model: requestedModel || "unknown",
        duration: Number(duration.toFixed(2)),
        status: 500,
        key_name: keyName,
        token_suffix: "",
        error: e instanceof Error ? e.message : String(e),
      });
      return c.json(openAiError("Internal error", "internal_error"), 500);
    }
  });
}
