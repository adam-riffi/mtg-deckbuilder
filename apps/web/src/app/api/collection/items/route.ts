import { setCollectionQty } from "@mtg/db";
import { z } from "zod";
import { body, route } from "@/server/http";

const schema = z.object({
  printingId: z.string().uuid(),
  finish: z.enum(["nonfoil", "foil", "etched"]).default("nonfoil"),
  qty: z.number().int().min(-999).max(9999),
  condition: z.string().max(4).optional(),
  language: z.string().max(5).optional(),
  mode: z.enum(["set", "add"]).default("set"),
});

export const POST = route(async ({ req, db, user }) => {
  const { mode, ...item } = await body(req, schema);
  await setCollectionQty(db, user.id, item, mode);
  return { ok: true };
});
