import { deleteDeck, getDeck, updateDeckMeta } from "@mtg/db";
import { FORMAT_IDS } from "@mtg/mtg";
import { z } from "zod";
import { body, route } from "@/server/http";

export const GET = route<{ id: string }>(async ({ db, user, params }) => getDeck(db, user.id, params.id));

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  format: z.enum(FORMAT_IDS as [string, ...string[]]).optional(),
  description: z.string().max(5000).optional(),
  primer: z.string().max(200_000).optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  folderId: z.string().uuid().nullable().optional(),
  targetBracket: z.number().int().min(1).max(5).nullable().optional(),
  budgetAmount: z.number().min(0).nullable().optional(),
  budgetCurrency: z.enum(["eur", "usd"]).optional(),
  coverPrintingId: z.string().uuid().nullable().optional(),
  autoApplyAi: z.boolean().optional(),
  isPackage: z.boolean().optional(),
  categoryOrder: z.array(z.object({ name: z.string(), includeInDeck: z.boolean().optional() })).optional(),
});

export const PATCH = route<{ id: string }>(async ({ req, db, user, params }) => ({
  deck: await updateDeckMeta(db, user.id, params.id, await body(req, patchSchema)),
}));

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await deleteDeck(db, user.id, params.id);
  return { ok: true };
});
