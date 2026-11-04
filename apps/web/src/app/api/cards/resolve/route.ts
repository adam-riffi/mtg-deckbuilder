import { getCardsByIds, getCardsByNames, hitsFor } from "@mtg/db";
import { z } from "zod";
import { body, route } from "@/server/http";

const schema = z.object({
  names: z.array(z.string()).max(500).optional(),
  ids: z.array(z.string()).max(500).optional(),
});

/** Resolves card names or ids to card hits (with default images). */
export const POST = route(async ({ req, db }) => {
  const { names = [], ids = [] } = await body(req, schema);
  const byName = await getCardsByNames(db, names);
  const found = [
    ...new Set([
      ...[...byName.values()].map((c) => c.id),
      ...(await getCardsByIds(db, ids)).map((c) => c.id),
    ]),
  ];
  const hits = await hitsFor(db, found);
  const missing = names.filter((n) => !byName.has(n.toLowerCase().trim()));
  return { hits, missing };
});
