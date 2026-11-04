import { getDeck, resolveChangeSet } from "@mtg/db";
import { z } from "zod";
import { body, route } from "@/server/http";

const schema = z.object({
  accept: z.union([z.literal("all"), z.array(z.string().uuid())]).default([]),
  reject: z.union([z.literal("rest"), z.array(z.string().uuid())]).default([]),
});

/** Accept and/or reject lines of an AI change set. Accepted lines are applied as one undoable AI event. */
export const POST = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { accept, reject } = await body(req, schema);
  const r = await resolveChangeSet(db, user.id, params.id, accept, reject);
  return { result: r, ...(await getDeck(db, user.id, r.deckId)) };
});
