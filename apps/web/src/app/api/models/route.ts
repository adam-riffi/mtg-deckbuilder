import { BACKGROUND_MODEL, BUILD_MODEL, DEFAULT_CHAT_MODEL, MODELS } from "@mtg/ai";
import { route } from "@/server/http";

export const GET = route(async () => ({
  models: Object.values(MODELS),
  defaults: { chat: DEFAULT_CHAT_MODEL, build: BUILD_MODEL, background: BACKGROUND_MODEL },
  configured: !!process.env.ANTHROPIC_API_KEY,
}));
