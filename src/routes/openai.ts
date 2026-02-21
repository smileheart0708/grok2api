import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireApiAuth } from "../auth";
import { registerChatRoutes } from "./openai/register-chat-routes";
import { registerImageRoutes } from "./openai/register-image-routes";
import { registerModelRoutes } from "./openai/register-model-routes";
import { registerUploadRoutes } from "./openai/register-upload-routes";
import type { OpenAiRouteBindings } from "./openai/types";

export const openAiRoutes = new Hono<OpenAiRouteBindings>();

openAiRoutes.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  }),
);

openAiRoutes.use("/*", requireApiAuth);

registerModelRoutes(openAiRoutes);
registerChatRoutes(openAiRoutes);
registerImageRoutes(openAiRoutes);
registerUploadRoutes(openAiRoutes);

openAiRoutes.options("/*", (c) => c.body(null, 204));
