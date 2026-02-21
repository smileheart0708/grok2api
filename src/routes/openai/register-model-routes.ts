import { getSettings } from "../../settings";
import { MODEL_CONFIG, isValidModel } from "../../grok/models";
import { resolveImageGenerationMethod } from "../../grok/imagineExperimental";
import { openAiError } from "./common";
import type { OpenAiRoutesApp } from "./types";

export function registerModelRoutes(openAiRoutes: OpenAiRoutesApp): void {
  openAiRoutes.get("/models", async (c) => {
    const ts = Math.floor(Date.now() / 1000);
    const data = Object.entries(MODEL_CONFIG).map(([id, cfg]) => ({
      id,
      object: "model",
      created: ts,
      owned_by: "x-ai",
      display_name: cfg.display_name,
      description: cfg.description,
      raw_model_path: cfg.raw_model_path,
      default_temperature: cfg.default_temperature,
      default_max_output_tokens: cfg.default_max_output_tokens,
      supported_max_output_tokens: cfg.supported_max_output_tokens,
      default_top_p: cfg.default_top_p,
    }));
    return c.json({ object: "list", data });
  });

  openAiRoutes.get("/models/:modelId", async (c) => {
    const modelId = c.req.param("modelId");
    if (!isValidModel(modelId)) {
      return c.json(openAiError(`Model '${modelId}' not found`, "model_not_found"), 404);
    }
    const cfg = MODEL_CONFIG[modelId];
    if (!cfg) return c.json(openAiError(`Model '${modelId}' not found`, "model_not_found"), 404);
    const ts = Math.floor(Date.now() / 1000);
    return c.json({
      id: modelId,
      object: "model",
      created: ts,
      owned_by: "x-ai",
      display_name: cfg.display_name,
      description: cfg.description,
      raw_model_path: cfg.raw_model_path,
      default_temperature: cfg.default_temperature,
      default_max_output_tokens: cfg.default_max_output_tokens,
      supported_max_output_tokens: cfg.supported_max_output_tokens,
      default_top_p: cfg.default_top_p,
    });
  });

  openAiRoutes.get("/images/method", async (c) => {
    const settingsBundle = await getSettings(c.env);
    return c.json({
      image_generation_method: resolveImageGenerationMethod(settingsBundle.grok.image_generation_method),
    });
  });
}
