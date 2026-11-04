import { createDeck, listDecks } from "@mtg/db";
import { FORMAT_IDS } from "@mtg/mtg";
import { z } from "zod";
import { body, route, searchParams } from "@/server/http";

export const GET = route(async ({ req, db, user }) => {
  const sp = searchParams(req);
  const packages = sp.get("packages");
  return { decks: await listDecks(db, user.id, packages === null ? {} : { packages: packages === "true" }) };
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  format: z.enum(FORMAT_IDS as [string, ...string[]]).default("commander"),
  folderId: z.string().uuid().nullish(),
  isPackage: z.boolean().optional(),
  description: z.string().max(5000).optional(),
});

export const POST = route(async ({ req, db, user }) => {
  const input = await body(req, createSchema);
  return { deck: await createDeck(db, user.id, { ...input, folderId: input.folderId ?? null }) };
});
