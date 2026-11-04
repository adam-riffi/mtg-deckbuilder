import { applyOps, getDeck } from "@mtg/db";
import { deckOpSchema } from "@mtg/mtg";
import { z } from "zod";
import { body, route } from "@/server/http";

const schema = z.object({
  ops: z.array(deckOpSchema).min(1).max(1000),
  summary: z.string().max(300).optional(),
});

/** Applies edit operations as one undoable event and returns the updated deck. */
export const POST = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { ops, summary } = await body(req, schema);
  const res = await applyOps(db, user.id, params.id, ops, { summary });
  return { eventId: res.eventId, summary: res.summary, ...(await getDeck(db, user.id, params.id)) };
});
