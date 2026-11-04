import { importCollection } from "@mtg/db";
import { parseCollectionCsv } from "@mtg/mtg/io";
import { z } from "zod";
import { body, route } from "@/server/http";

/** Imports a Moxfield, Archidekt or ManaBox collection CSV. */
export const POST = route(async ({ req, db, user }) => {
  const { csv, mode } = await body(
    req,
    z.object({ csv: z.string().max(20_000_000), mode: z.enum(["add", "replace"]).default("add") }),
  );
  const parsed = parseCollectionCsv(csv);
  const r = await importCollection(db, user.id, parsed.rows, mode);
  return {
    source: parsed.source,
    rows: parsed.rows.length,
    imported: r.imported,
    unresolved: r.unresolved,
    errors: parsed.errors,
  };
});
