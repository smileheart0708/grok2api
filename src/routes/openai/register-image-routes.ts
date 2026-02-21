import { normalizeCfCookie, getSettings } from "../../settings";
import {
  IMAGE_METHOD_IMAGINE_WS_EXPERIMENTAL,
  resolveAspectRatio,
  sendExperimentalImageEditRequest,
} from "../../grok/imagineExperimental";
import { uploadImage } from "../../grok/upload";
import { addRequestLog } from "../../repo/logs";
import { applyCooldown, recordTokenFailure, selectBestToken } from "../../repo/tokens";
import { arrayBufferToBase64 } from "../../utils/base64";
import {
  IMAGE_GENERATION_MODEL_ID,
  buildCookie,
  buildImageJsonPayload,
  createExperimentalImageEventStream,
  createImageEventStream,
  createStreamErrorImageEventStream,
  dedupeImages,
  imageCallPrompt,
  imageFormatDefault,
  imageGenerationMethod,
  invalidEditModelOrError,
  invalidGenerationModelOrError,
  invalidStreamNMessage,
  listImageFiles,
  nonEmptyPromptOrError,
  parseAllowedImageMime,
  parseImageConcurrencyOrError,
  parseImageCount,
  parseImageModel,
  parseImagePrompt,
  parseImageSize,
  parseImageStream,
  pickImageResults,
  recordImageLog,
  resolveImageResponseFormatByMethodOrError,
  responseFieldName,
  runExperimentalImageEditCall,
  runImageCall,
  runImageStreamCall,
  streamHeaders,
  baseUrlFromSettings,
  collectExperimentalGenerationImages,
  getTokenSuffix,
  IMAGE_EDIT_MODEL_ID,
} from "./image-support";
import { getClientIp, isContentModerationMessage, mapLimit, openAiError } from "./common";
import { enforceQuota } from "./quota";
import type { OpenAiRoutesApp } from "./types";

export function registerImageRoutes(openAiRoutes: OpenAiRoutesApp): void {
openAiRoutes.post("/images/generations", async (c) => {
  const start = Date.now();
  const ip = getClientIp(c.req.raw);
  const keyName = c.get("apiAuth").name ?? "Unknown";
  const origin = new URL(c.req.url).origin;

  let requestedModel = IMAGE_GENERATION_MODEL_ID;
  try {
    const body = (await c.req.json()) as {
      prompt?: unknown;
      model?: unknown;
      n?: unknown;
      size?: unknown;
      concurrency?: unknown;
      stream?: unknown;
      response_format?: unknown;
    };
    const prompt = parseImagePrompt(body.prompt);
    const promptErr = nonEmptyPromptOrError(prompt);
    if (promptErr) return c.json(openAiError(promptErr.message, promptErr.code), 400);

    requestedModel = parseImageModel(body.model, IMAGE_GENERATION_MODEL_ID);
    const modelErr = invalidGenerationModelOrError(requestedModel);
    if (modelErr) return c.json(openAiError(modelErr.message, modelErr.code), 400);

    const n = parseImageCount(body.n);
    const size = parseImageSize(body.size);
    const aspectRatio = resolveAspectRatio(size);
    const concurrencyParsed = parseImageConcurrencyOrError(body.concurrency);
    if ("error" in concurrencyParsed) {
      return c.json(
        openAiError(concurrencyParsed.error.message, concurrencyParsed.error.code),
        400,
      );
    }
    const concurrency = concurrencyParsed.value;
    const stream = parseImageStream(body.stream);
    if (stream && ![1, 2].includes(n)) {
      return c.json(openAiError(invalidStreamNMessage(), "invalid_stream_n"), 400);
    }

    const settingsBundle = await getSettings(c.env);
    const imageMethod = imageGenerationMethod(settingsBundle);
    const parsedResponseFormat = resolveImageResponseFormatByMethodOrError(
      body.response_format,
      imageFormatDefault(settingsBundle),
      imageMethod,
    );
    if ("error" in parsedResponseFormat) {
      return c.json(
        openAiError(parsedResponseFormat.error.message, parsedResponseFormat.error.code),
        400,
      );
    }
    const responseFormat = parsedResponseFormat.value;
    const responseField = responseFieldName(responseFormat);
    const baseUrl = baseUrlFromSettings(settingsBundle, origin);
    const cf = normalizeCfCookie(settingsBundle.grok.cf_clearance ?? "");

    const quota = await enforceQuota({
      env: c.env,
      apiAuth: c.get("apiAuth"),
      model: requestedModel,
      kind: "image",
      imageCount: n,
    });
    if (!quota.ok) return quota.resp;

    if (stream) {
      if (imageMethod === IMAGE_METHOD_IMAGINE_WS_EXPERIMENTAL) {
        const experimentalToken = await selectBestToken(c.env.DB, requestedModel);
        if (experimentalToken) {
          const experimentalCookie = buildCookie(experimentalToken.token, cf);
          const streamBody = createExperimentalImageEventStream({
            prompt: imageCallPrompt("generation", prompt),
            n,
            cookie: experimentalCookie,
            settings: settingsBundle.grok,
            responseFormat,
            responseField,
            baseUrl,
            aspectRatio,
            concurrency,
            onFinish: async ({ status, duration }) => {
              await addRequestLog(c.env.DB, {
                ip,
                model: requestedModel,
                duration: Number(duration.toFixed(2)),
                status,
                key_name: keyName,
                token_suffix: getTokenSuffix(experimentalToken.token),
                error: status === 200 ? "" : "stream_error",
              });
            },
          });
          return new Response(streamBody, { status: 200, headers: streamHeaders() });
        }
      }

      const chosen = await selectBestToken(c.env.DB, requestedModel);
      if (!chosen) {
        await recordImageLog({
          env: c.env,
          ip,
          model: requestedModel,
          start,
          keyName,
          status: 503,
          error: "NO_AVAILABLE_TOKEN",
        });
        return new Response(
          createStreamErrorImageEventStream({
            message: "No available token",
            responseField,
          }),
          { status: 200, headers: streamHeaders() },
        );
      }
      const cookie = buildCookie(chosen.token, cf);

      const upstream = await runImageStreamCall({
        requestModel: requestedModel,
        prompt: imageCallPrompt("generation", prompt),
        fileIds: [],
        cookie,
        settings: settingsBundle.grok,
      });
      if (!upstream.ok) {
        const txt = await upstream.text().catch(() => "");
        await recordTokenFailure(c.env.DB, chosen.token, upstream.status, txt.slice(0, 200));
        await applyCooldown(c.env.DB, chosen.token, upstream.status);
        await recordImageLog({
          env: c.env,
          ip,
          model: requestedModel,
          start,
          keyName,
          status: upstream.status,
          tokenSuffix: getTokenSuffix(chosen.token),
          error: txt.slice(0, 200),
        });
        return new Response(
          createStreamErrorImageEventStream({
            message: isContentModerationMessage(txt)
              ? txt.slice(0, 500)
              : `Upstream ${upstream.status}`,
            responseField,
          }),
          { status: 200, headers: streamHeaders() },
        );
      }

      const streamBody = createImageEventStream({
        upstream,
        responseFormat,
        baseUrl,
        cookie,
        settings: settingsBundle.grok,
        n,
        onFinish: async ({ status, duration }) => {
          await addRequestLog(c.env.DB, {
            ip,
            model: requestedModel,
            duration: Number(duration.toFixed(2)),
            status,
            key_name: keyName,
            token_suffix: getTokenSuffix(chosen.token),
            error: status === 200 ? "" : "stream_error",
          });
        },
      });
      return new Response(streamBody, { status: 200, headers: streamHeaders() });
    }

    if (imageMethod === IMAGE_METHOD_IMAGINE_WS_EXPERIMENTAL) {
      const experimentalToken = await selectBestToken(c.env.DB, requestedModel);
      if (experimentalToken) {
        const experimentalCookie = buildCookie(experimentalToken.token, cf);
        try {
          const urls = await collectExperimentalGenerationImages({
            prompt: imageCallPrompt("generation", prompt),
            n,
            cookie: experimentalCookie,
            settings: settingsBundle.grok,
            responseFormat,
            baseUrl,
            aspectRatio,
            concurrency,
          });
          const selected = pickImageResults(urls, n);
          await recordImageLog({
            env: c.env,
            ip,
            model: requestedModel,
            start,
            keyName,
            status: 200,
            tokenSuffix: getTokenSuffix(experimentalToken.token),
            error: "",
          });
          return c.json(buildImageJsonPayload(responseField, selected));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await recordTokenFailure(c.env.DB, experimentalToken.token, 500, msg.slice(0, 200));
          await applyCooldown(c.env.DB, experimentalToken.token, 500);
          console.warn("Experimental image generation failed, fallback to legacy:", msg);
        }
      }
    }

    const calls = Math.ceil(n / 2);
    const urlsNested = await mapLimit(
      Array.from({ length: calls }),
      Math.min(calls, Math.max(1, concurrency)),
      async () => {
      const chosen = await selectBestToken(c.env.DB, requestedModel);
      if (!chosen) throw new Error("No available token");
      const cookie = buildCookie(chosen.token, cf);
      try {
        return await runImageCall({
          requestModel: requestedModel,
          prompt: imageCallPrompt("generation", prompt),
          fileIds: [],
          cookie,
          settings: settingsBundle.grok,
          responseFormat,
          baseUrl,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await recordTokenFailure(c.env.DB, chosen.token, 500, msg.slice(0, 200));
        await applyCooldown(c.env.DB, chosen.token, 500);
        throw e;
      }
    },
    );
    const urls = dedupeImages(urlsNested.flat().filter(Boolean));
    const selected = pickImageResults(urls, n);

    await recordImageLog({
      env: c.env,
      ip,
      model: requestedModel,
      start,
      keyName,
      status: 200,
      error: "",
    });

    return c.json(buildImageJsonPayload(responseField, selected));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isContentModerationMessage(message)) {
      await recordImageLog({
        env: c.env,
        ip,
        model: requestedModel || "image",
        start,
        keyName,
        status: 400,
        error: message,
      });
      return c.json(openAiError(message, "content_policy_violation"), 400);
    }
    await recordImageLog({
      env: c.env,
      ip,
      model: requestedModel || "image",
      start,
      keyName,
      status: 500,
      error: message,
    });
    return c.json(openAiError(message || "Internal error", "internal_error"), 500);
  }
});

openAiRoutes.post("/images/edits", async (c) => {
  const start = Date.now();
  const ip = getClientIp(c.req.raw);
  const keyName = c.get("apiAuth").name ?? "Unknown";
  const origin = new URL(c.req.url).origin;
  const maxImageBytes = 50 * 1024 * 1024;

  let requestedModel = IMAGE_EDIT_MODEL_ID;
  try {
    const form = await c.req.formData();
    const prompt = parseImagePrompt(form.get("prompt"));
    const promptErr = nonEmptyPromptOrError(prompt);
    if (promptErr) return c.json(openAiError(promptErr.message, promptErr.code), 400);

    requestedModel = parseImageModel(form.get("model"), IMAGE_EDIT_MODEL_ID);
    const modelErr = invalidEditModelOrError(requestedModel);
    if (modelErr) return c.json(openAiError(modelErr.message, modelErr.code), 400);

    const n = parseImageCount(form.get("n"));
    const stream = parseImageStream(form.get("stream"));
    if (stream && ![1, 2].includes(n)) {
      return c.json(openAiError(invalidStreamNMessage(), "invalid_stream_n"), 400);
    }

    const files = listImageFiles(form);
    if (!files.length) return c.json(openAiError("Image is required", "missing_image"), 400);
    if (files.length > 16) {
      return c.json(openAiError("Too many images. Maximum is 16.", "invalid_image_count"), 400);
    }

    const settingsBundle = await getSettings(c.env);
    const imageMethod = imageGenerationMethod(settingsBundle);
    const parsedResponseFormat = resolveImageResponseFormatByMethodOrError(
      form.get("response_format"),
      imageFormatDefault(settingsBundle),
      imageMethod,
    );
    if ("error" in parsedResponseFormat) {
      return c.json(
        openAiError(parsedResponseFormat.error.message, parsedResponseFormat.error.code),
        400,
      );
    }
    const responseFormat = parsedResponseFormat.value;
    const responseField = responseFieldName(responseFormat);
    const baseUrl = baseUrlFromSettings(settingsBundle, origin);

    const quota = await enforceQuota({
      env: c.env,
      apiAuth: c.get("apiAuth"),
      model: requestedModel,
      kind: "image",
      imageCount: n,
    });
    if (!quota.ok) return quota.resp;

    const chosen = await selectBestToken(c.env.DB, requestedModel);
    if (!chosen) {
      if (stream) {
        await recordImageLog({
          env: c.env,
          ip,
          model: requestedModel,
          start,
          keyName,
          status: 503,
          error: "NO_AVAILABLE_TOKEN",
        });
        return new Response(
          createStreamErrorImageEventStream({
            message: "No available token",
            responseField,
          }),
          { status: 200, headers: streamHeaders() },
        );
      }
      return c.json(openAiError("No available token", "NO_AVAILABLE_TOKEN"), 503);
    }
    const cf = normalizeCfCookie(settingsBundle.grok.cf_clearance ?? "");
    const cookie = buildCookie(chosen.token, cf);

    const fileIds: string[] = [];
    const fileUris: string[] = [];
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength <= 0) {
        return c.json(openAiError("File content is empty", "empty_file"), 400);
      }
      if (bytes.byteLength > maxImageBytes) {
        return c.json(openAiError("Image file too large. Maximum is 50MB.", "file_too_large"), 400);
      }

      const mime = parseAllowedImageMime(file);
      if (!mime) {
        return c.json(
          openAiError("Unsupported image type. Supported: png, jpg, webp.", "invalid_image_type"),
          400,
        );
      }

      const dataUrl = `data:${mime};base64,${arrayBufferToBase64(bytes)}`;
      const uploaded = await uploadImage(dataUrl, cookie, settingsBundle.grok);
      if (uploaded.fileId) fileIds.push(uploaded.fileId);
      if (uploaded.fileUri) fileUris.push(uploaded.fileUri);
    }

    if (stream) {
      if (imageMethod === IMAGE_METHOD_IMAGINE_WS_EXPERIMENTAL) {
        try {
          const upstream = await sendExperimentalImageEditRequest({
            prompt: imageCallPrompt("edit", prompt),
            fileUris,
            cookie,
            settings: settingsBundle.grok,
          });

          const streamBody = createImageEventStream({
            upstream,
            responseFormat,
            baseUrl,
            cookie,
            settings: settingsBundle.grok,
            n,
            onFinish: async ({ status, duration }) => {
              await addRequestLog(c.env.DB, {
                ip,
                model: requestedModel,
                duration: Number(duration.toFixed(2)),
                status,
                key_name: keyName,
                token_suffix: getTokenSuffix(chosen.token),
                error: status === 200 ? "" : "stream_error",
              });
            },
          });
          return new Response(streamBody, { status: 200, headers: streamHeaders() });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await recordTokenFailure(c.env.DB, chosen.token, 500, msg.slice(0, 200));
          await applyCooldown(c.env.DB, chosen.token, 500);
          console.warn("Experimental image edit stream failed, fallback to legacy:", msg);
        }
      }

      const upstream = await runImageStreamCall({
        requestModel: requestedModel,
        prompt: imageCallPrompt("edit", prompt),
        fileIds,
        cookie,
        settings: settingsBundle.grok,
      });
      if (!upstream.ok) {
        const txt = await upstream.text().catch(() => "");
        await recordTokenFailure(c.env.DB, chosen.token, upstream.status, txt.slice(0, 200));
        await applyCooldown(c.env.DB, chosen.token, upstream.status);
        await recordImageLog({
          env: c.env,
          ip,
          model: requestedModel,
          start,
          keyName,
          status: upstream.status,
          tokenSuffix: getTokenSuffix(chosen.token),
          error: txt.slice(0, 200),
        });
        return new Response(
          createStreamErrorImageEventStream({
            message: isContentModerationMessage(txt)
              ? txt.slice(0, 500)
              : `Upstream ${upstream.status}`,
            responseField,
          }),
          { status: 200, headers: streamHeaders() },
        );
      }

      const streamBody = createImageEventStream({
        upstream,
        responseFormat,
        baseUrl,
        cookie,
        settings: settingsBundle.grok,
        n,
        onFinish: async ({ status, duration }) => {
          await addRequestLog(c.env.DB, {
            ip,
            model: requestedModel,
            duration: Number(duration.toFixed(2)),
            status,
            key_name: keyName,
            token_suffix: getTokenSuffix(chosen.token),
            error: status === 200 ? "" : "stream_error",
          });
        },
      });
      return new Response(streamBody, { status: 200, headers: streamHeaders() });
    }

    if (imageMethod === IMAGE_METHOD_IMAGINE_WS_EXPERIMENTAL) {
      try {
        const calls = Math.ceil(n / 2);
        const urlsNested = await mapLimit(Array.from({ length: calls }), 3, async () =>
          runExperimentalImageEditCall({
            prompt: imageCallPrompt("edit", prompt),
            fileUris,
            cookie,
            settings: settingsBundle.grok,
            responseFormat,
            baseUrl,
          }),
        );
        const urls = dedupeImages(urlsNested.flat().filter(Boolean));
        if (!urls.length) throw new Error("Experimental image edit returned no images");
        const selected = pickImageResults(urls, n);

        await recordImageLog({
          env: c.env,
          ip,
          model: requestedModel,
          start,
          keyName,
          status: 200,
          tokenSuffix: getTokenSuffix(chosen.token),
          error: "",
        });
        return c.json(buildImageJsonPayload(responseField, selected));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await recordTokenFailure(c.env.DB, chosen.token, 500, msg.slice(0, 200));
        await applyCooldown(c.env.DB, chosen.token, 500);
        console.warn("Experimental image edit failed, fallback to legacy:", msg);
      }
    }

    const calls = Math.ceil(n / 2);
    const urlsNested = await mapLimit(Array.from({ length: calls }), 3, async () => {
      return runImageCall({
        requestModel: requestedModel,
        prompt: imageCallPrompt("edit", prompt),
        fileIds,
        cookie,
        settings: settingsBundle.grok,
        responseFormat,
        baseUrl,
      });
    });
    const urls = dedupeImages(urlsNested.flat().filter(Boolean));
    const selected = pickImageResults(urls, n);

    await recordImageLog({
      env: c.env,
      ip,
      model: requestedModel,
      start,
      keyName,
      status: 200,
      tokenSuffix: getTokenSuffix(chosen.token),
      error: "",
    });

    return c.json(buildImageJsonPayload(responseField, selected));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isContentModerationMessage(message)) {
      await recordImageLog({
        env: c.env,
        ip,
        model: requestedModel || "image",
        start,
        keyName,
        status: 400,
        error: message,
      });
      return c.json(openAiError(message, "content_policy_violation"), 400);
    }
    await recordImageLog({
      env: c.env,
      ip,
      model: requestedModel || "image",
      start,
      keyName,
      status: 500,
      error: message,
    });
    return c.json(openAiError(message || "Internal error", "internal_error"), 500);
  }
});
}
