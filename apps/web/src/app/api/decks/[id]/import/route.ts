import { applyOps, getDeck, getDeckLines, resolveLines } from "@mtg/db";
import { type DeckOp, zoneSchema } from "@mtg/mtg";
import { parseDecklist } from "@mtg/mtg/io";
import { z } from "zod";
import { body, route } from "@/server/http";

const schema = z.object({
  text: z.string().max(500_000),
  mode: z.enum(["append", "replace"]).default("append"),
  zone: zoneSchema.optional(),
});

/** Imports text/Arena/MTGO/Moxfield/Archidekt/CSV lists and reports lines that could not be resolved. */
export const POST = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { text, mode, zone } = await body(req, schema);
  const parsed = parseDecklist(text);
  const resolved = await resolveLines(db, parsed.lines);
  const ops: DeckOp[] = [];
  if (mode === "replace")
    for (const l of await getDeckLines(db, params.id))
      ops.push({ op: "remove", oracleId: l.oracleId, zone: l.zone });
  let cards = 0;
  for (const r of resolved) {
    if (!r.card) continue;
    const z = zone && r.line.zone === "mainboard" ? zone : r.line.zone;
    ops.push({
      op: "add",
      oracleId: r.card.id,
      qty: r.line.qty,
      zone: z,
      printingId: r.printing?.id ?? null,
      categories: r.line.categories,
      finish: r.line.finish,
    });
    cards += r.line.qty;
  }
  const unresolved = resolved
    .filter((r) => !r.card)
    .map((r) => ({ lineNo: r.line.lineNo, raw: r.line.raw, name: r.line.name, suggestions: r.suggestions }));
  if (ops.length)
    await applyOps(db, user.id, params.id, ops, {
      kind: "import",
      source: "import",
      summary: `Imported ${cards} cards (${parsed.format})`,
    });
  return {
    report: {
      format: parsed.format,
      imported: cards,
      lines: parsed.lines.length,
      unresolved,
      errors: parsed.errors,
    },
    ...(await getDeck(db, user.id, params.id)),
  };
});
