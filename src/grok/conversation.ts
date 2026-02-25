import type { GrokSettings } from "../settings";
import { getDynamicHeaders } from "./headers";
import { getModelInfo, toGrokModel } from "./models";

export interface OpenAIChatMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url?: string } }>;
}

export interface OpenAIChatRequestBody {
  model: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  video_config?: {
    aspect_ratio?: string;
    video_length?: number;
    resolution?: string;
    preset?: string;
  };
}

export const CONVERSATION_API = "https://grok.com/rest/app-chat/conversations/new";

/**
 * 从 OpenAI 格式消息中提取内容
 *
 * OpenAI messages 支持两种格式：
 * 1. 字符串：{ role: "user", content: "你好" }
 * 2. 多部分数组：{ role: "user", content: [{ type: "text", text: "描述" }, { type: "image_url", image_url: { url: "..." } }] }
 *
 * 转换策略：
 * - 最后一条用户消息直接输出（作为当前输入）
 * - 其他消息添加角色前缀（作为上下文）
 */
export function extractContent(messages: OpenAIChatMessage[]): { content: string; images: string[] } {
  const images: string[] = [];
  const extracted: Array<{ role: string; text: string }> = [];

  for (const msg of messages) {
    const role = msg.role ?? "user";
    const content = msg.content ?? "";

    const parts: string[] = [];
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.type === "text") {
          const t = item.text ?? "";
          if (t.trim()) parts.push(t);
        }
        if (item?.type === "image_url") {
          const url = item.image_url?.url;
          if (url) images.push(url);
        }
      }
    } else {
      const t = String(content);
      if (t.trim()) parts.push(t);
    }

    if (parts.length) extracted.push({ role, text: parts.join("\n") });
  }

  let lastUserIndex: number | null = null;
  for (let i = extracted.length - 1; i >= 0; i--) {
    if (extracted[i]!.role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  const out: string[] = [];
  for (let i = 0; i < extracted.length; i++) {
    const role = extracted[i]!.role || "user";
    const text = extracted[i]!.text;
    if (i === lastUserIndex) out.push(text);
    else out.push(`${role}: ${text}`);
  }

  return { content: out.join("\n\n"), images };
}

/**
 * 构建 Grok API 请求体
 *
 * 视频模型特殊处理：
 * 1. 需要先调用 createMediaPost 创建占位帖子
 * 2. 使用 postId 关联视频生成任务
 * 3. 支持 aspect_ratio, video_length, resolution, preset 等参数
 *
 * 图片/文本模型：
 * - fileAttachments: 已上传文件的 ID 列表
 * - enableImageGeneration: 允许模型生成图片
 * - modelMode: 模型运行模式（AUTO/FAST/HEAVY/EXPERT）
 */
export function buildConversationPayload(args: {
  requestModel: string;
  content: string;
  imgIds: string[];
  imgUris: string[];
  postId?: string;
  videoConfig?: {
    aspect_ratio?: string;
    video_length?: number;
    resolution?: string;
    preset?: string;
  };
  settings: GrokSettings;
}): { payload: Record<string, unknown>; referer?: string; isVideoModel: boolean } {
  const { requestModel, content, imgIds, postId, settings } = args;
  const cfg = getModelInfo(requestModel);
  const { grokModel, mode, isVideoModel } = toGrokModel(requestModel);

    // 视频模型需要特殊的配置结构
    if (cfg?.is_video_model) {
      if (!postId) throw new Error("视频模型缺少 postId（需要先创建 media post）");

      const aspectRatio = (args.videoConfig?.aspect_ratio ?? "").trim() || "3:2";
      const videoLengthRaw = Number(args.videoConfig?.video_length ?? 6);
      const videoLength = Number.isFinite(videoLengthRaw) ? Math.max(1, Math.floor(videoLengthRaw)) : 6;
      const resolution = (args.videoConfig?.resolution ?? "SD") === "HD" ? "HD" : "SD";
      const preset = (args.videoConfig?.preset ?? "normal").trim();

      // 预设模式映射：normal/extremely-crazy/extremely-spicy-or-crazy
      let modeFlag = "--mode=custom";
      if (preset === "fun") modeFlag = "--mode=extremely-crazy";
      else if (preset === "normal") modeFlag = "--mode=normal";
      else if (preset === "spicy") modeFlag = "--mode=extremely-spicy-or-crazy";

    const prompt = `${String(content || "").trim()} ${modeFlag}`.trim();

    return {
      isVideoModel: true,
      referer: "https://grok.com/imagine",
      payload: {
        temporary: true,
        modelName: "grok-3",
        message: prompt,
        toolOverrides: { videoGen: true },
        enableSideBySide: true,
        responseMetadata: {
          experiments: [],
          modelConfigOverride: {
            modelMap: {
              videoGenModelConfig: {
                parentPostId: postId,
                aspectRatio,
                videoLength,
                videoResolution: resolution,
              },
            },
          },
        },
      },
    };
  }

  return {
    isVideoModel,
    payload: {
      temporary: settings.temporary ?? true,
      modelName: grokModel,
      message: content,
      fileAttachments: imgIds,
      imageAttachments: [],
      disableSearch: false,
      enableImageGeneration: true,
      returnImageBytes: false,
      returnRawGrokInXaiRequest: false,
      enableImageStreaming: true,
      imageGenerationCount: 2,
      forceConcise: false,
      toolOverrides: {},
      enableSideBySide: true,
      sendFinalMetadata: true,
      isReasoning: false,
      webpageUrls: [],
      disableTextFollowUps: true,
      responseMetadata: { requestModelDetails: { modelId: grokModel } },
      disableMemory: false,
      forceSideBySide: false,
      modelMode: mode,
      isAsyncChat: false,
    },
  };
}

export async function sendConversationRequest(args: {
  payload: Record<string, unknown>;
  cookie: string;
  settings: GrokSettings;
  referer?: string;
}): Promise<Response> {
  const { payload, cookie, settings, referer } = args;
  const headers = getDynamicHeaders(settings, "/rest/app-chat/conversations/new");
  headers["Cookie"] = cookie;
  if (referer) headers["Referer"] = referer;
  const body = JSON.stringify(payload);

  return fetch(CONVERSATION_API, { method: "POST", headers, body });
}
