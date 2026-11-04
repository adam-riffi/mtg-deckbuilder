import { MODELS } from "@mtg/ai";
import { deleteThread, getThread, listMessages, updateThread } from "@mtg/db";
import { z } from "zod";
import { body, route } from "@/server/http";

type P = { threadId: string };

export const GET = route<P>(async ({ db, user, params }) => {
  const thread = await getThread(db, user.id, params.threadId);
  return { thread, messages: await listMessages(db, thread.id) };
});

export const PATCH = route<P>(async ({ req, db, user, params }) => {
  const patch = await body(
    req,
    z.object({
      title: z.string().trim().min(1).max(80).optional(),
      model: z.enum(Object.keys(MODELS) as [string, ...string[]]).optional(),
    }),
  );
  return { thread: await updateThread(db, user.id, params.threadId, patch) };
});

export const DELETE = route<P>(async ({ db, user, params }) => {
  await deleteThread(db, user.id, params.threadId);
  return { ok: true };
});
