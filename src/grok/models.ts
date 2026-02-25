/**
 * 模型配置模块
 *
 * 模型映射关系：
 * - 请求模型名（如 grok-4-fast）-> Grok 内部模型名 + 运行模式
 * - 不同模式影响响应速度和质量：
 *   - AUTO: 自动选择
 *   - FAST: 快速响应
 *   - HEAVY: 深度思考（需要 Super tokens）
 *   - EXPERT: 专家模式
 *   - MODEL_MODE_GROK_4_MINI_THINKING: 思考模式
 */

export interface ModelInfo {
  grok_model: [string, string];
  rate_limit_model: string;
  display_name: string;
  description: string;
  is_image_model?: boolean;
  is_video_model?: boolean;
}

export const MODEL_CONFIG: Record<string, ModelInfo> = {
  "grok-3": {
    grok_model: ["grok-3", "MODEL_MODE_AUTO"],
    rate_limit_model: "grok-3",
    display_name: "Grok 3",
    description: "Grok 3 chat model",
  },
  "grok-3-fast": {
    grok_model: ["grok-3", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-3",
    display_name: "Grok 3 Fast",
    description: "Fast Grok 3 chat model",
  },
  "grok-4": {
    grok_model: ["grok-4", "MODEL_MODE_AUTO"],
    rate_limit_model: "grok-4",
    display_name: "Grok 4",
    description: "Grok 4 chat model",
  },
  "grok-4-mini": {
    grok_model: ["grok-4-mini-thinking-tahoe", "MODEL_MODE_GROK_4_MINI_THINKING"],
    rate_limit_model: "grok-4-mini-thinking-tahoe",
    display_name: "Grok 4 Mini",
    description: "Grok 4 mini thinking model",
  },
  "grok-4-fast": {
    grok_model: ["grok-4", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-4",
    display_name: "Grok 4 Fast",
    description: "Fast Grok 4 chat model",
  },
  "grok-4-heavy": {
    grok_model: ["grok-4", "MODEL_MODE_HEAVY"],
    rate_limit_model: "grok-4-heavy",
    display_name: "Grok 4 Heavy",
    description: "Most powerful Grok model (Super tokens required)",
  },
  "grok-4.1": {
    grok_model: ["grok-4-1-thinking-1129", "MODEL_MODE_AUTO"],
    rate_limit_model: "grok-4-1-thinking-1129",
    display_name: "Grok 4.1",
    description: "Grok 4.1 chat model",
  },
  "grok-4.1-fast": {
    grok_model: ["grok-4-1-thinking-1129", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-4-1-thinking-1129",
    display_name: "Grok 4.1 Fast",
    description: "Fast Grok 4.1 chat model",
  },
  "grok-4.1-expert": {
    grok_model: ["grok-4-1-thinking-1129", "MODEL_MODE_EXPERT"],
    rate_limit_model: "grok-4-1-thinking-1129",
    display_name: "Grok 4.1 Expert",
    description: "Expert Grok 4.1 chat model",
  },
  "grok-4.1-thinking": {
    grok_model: ["grok-4-1-thinking-1129", "MODEL_MODE_GROK_4_1_THINKING"],
    rate_limit_model: "grok-4-1-thinking-1129",
    display_name: "Grok 4.1 Thinking",
    description: "Grok 4.1 with thinking mode",
  },
  "grok-imagine-1.0": {
    grok_model: ["grok-3", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-3",
    display_name: "Grok Imagine 1.0",
    description: "Image generation model",
    is_image_model: true,
  },
  "grok-imagine-1.0-edit": {
    grok_model: ["imagine-image-edit", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-3",
    display_name: "Grok Imagine 1.0 Edit",
    description: "Image edit model",
    is_image_model: true,
  },
  "grok-imagine-1.0-video": {
    grok_model: ["grok-3", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-3",
    display_name: "Grok Imagine 1.0 Video",
    description: "Video generation model",
    is_video_model: true,
  },
};

export function isValidModel(model: string): boolean {
  return Boolean(MODEL_CONFIG[model]);
}

export function getModelInfo(model: string): ModelInfo | null {
  return MODEL_CONFIG[model] ?? null;
}

export function toGrokModel(model: string): { grokModel: string; mode: string; isVideoModel: boolean } {
  const cfg = MODEL_CONFIG[model];
  if (!cfg) return { grokModel: model, mode: "MODEL_MODE_FAST", isVideoModel: false };
  return { grokModel: cfg.grok_model[0], mode: cfg.grok_model[1], isVideoModel: Boolean(cfg.is_video_model) };
}

export function toRateLimitModel(model: string): string {
  return MODEL_CONFIG[model]?.rate_limit_model ?? model;
}
