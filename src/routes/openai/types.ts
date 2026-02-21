import type { Hono } from "hono";
import type { ApiAuthInfo } from "../../auth";
import type { Env } from "../../env";

export interface OpenAiRouteBindings {
  Bindings: Env;
  Variables: { apiAuth: ApiAuthInfo };
}

export type OpenAiRoutesApp = Hono<OpenAiRouteBindings>;
