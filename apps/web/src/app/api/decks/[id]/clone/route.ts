import { cloneDeck } from "@mtg/db";
import { z } from "zod";
import { body, route } from "@/server/http";

export const POST = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(120).optional() }));
  return { deck: await cloneDeck(db, user.id, params.id, name) };
});
