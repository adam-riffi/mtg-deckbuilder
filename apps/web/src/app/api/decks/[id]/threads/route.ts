import { DEFAULT_CHAT_MODEL, MODELS } from "@mtg/ai";
import { createThread, deckAiCost, listThreads } from "@mtg/db";
import { z } from "zod";
import { body, route } from "@/server/http";

export const GET = route<{ id: string }>(async ({ db, user, params }) => ({
  threads: await listThreads(db, user.id, params.id),
  cost: await deckAiCost(db, params.id),
}));

export const POST = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { model } = await body(
    req,
    z.object({ model: z.enum(Object.keys(MODELS) as [string, ...string[]]).default(DEFAULT_CHAT_MODEL) }),
  );
  return { thread: await createThread(db, user.id, params.id, model) };
});
