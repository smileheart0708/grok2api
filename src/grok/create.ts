import type { GrokSettings } from "../settings";
import { getDynamicHeaders } from "./headers";

/**
 * 媒体帖子创建模块
 *
 * 用于视频生成的准备工作：
 * 1. Grok 视频生成需要先创建一个 media post 作为容器
 * 2. 返回的 postId 用于关联后续的视频生成请求
 *
 * 两种类型：
 * - MEDIA_POST_TYPE_IMAGE: 图片帖子，需要提供 mediaUrl
 * - MEDIA_POST_TYPE_VIDEO: 视频帖子，需要提供 prompt
 */
const ENDPOINT = "https://grok.com/rest/media/post/create";

export type MediaPostType = "MEDIA_POST_TYPE_VIDEO" | "MEDIA_POST_TYPE_IMAGE";
interface ImageMediaPostBody {
  mediaType: "MEDIA_POST_TYPE_IMAGE";
  mediaUrl: string;
}

interface VideoMediaPostBody {
  mediaType: "MEDIA_POST_TYPE_VIDEO";
  prompt: string;
}

type CreateMediaPostBody = ImageMediaPostBody | VideoMediaPostBody;

export async function createMediaPost(
  args: { mediaType: MediaPostType; prompt?: string; mediaUrl?: string },
  cookie: string,
  settings: GrokSettings,
): Promise<{ postId: string }> {
  const headers = getDynamicHeaders(settings, "/rest/media/post/create");
  headers["Cookie"] = cookie;
  headers["Referer"] = "https://grok.com/imagine";

  let bodyObj: CreateMediaPostBody;
  if (args.mediaType === "MEDIA_POST_TYPE_IMAGE") {
    if (!args.mediaUrl) throw new Error("缺少 mediaUrl");
    bodyObj = { mediaType: "MEDIA_POST_TYPE_IMAGE", mediaUrl: args.mediaUrl };
  } else {
    if (!args.prompt) throw new Error("缺少 prompt");
    bodyObj = { mediaType: "MEDIA_POST_TYPE_VIDEO", prompt: args.prompt };
  }

  const body = JSON.stringify(bodyObj);

  const resp = await fetch(ENDPOINT, { method: "POST", headers, body });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`创建会话失败: ${resp.status} ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { post?: { id?: string } };
  return { postId: data.post?.id ?? "" };
}

export async function createPost(
  fileUri: string,
  cookie: string,
  settings: GrokSettings,
): Promise<{ postId: string }> {
  const path = fileUri.startsWith("/") ? fileUri : `/${fileUri}`;
  const url = `https://assets.grok.com${path}`;
  return createMediaPost({ mediaType: "MEDIA_POST_TYPE_IMAGE", mediaUrl: url }, cookie, settings);
}

