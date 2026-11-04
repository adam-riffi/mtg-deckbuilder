import { applyOps, cheapestPrintings, getDeck, getDeckLines } from "@mtg/db";
import type { DeckOp } from "@mtg/mtg";
import { z } from "zod";
import { body, route } from "@/server/http";

/** Switches every card to its cheapest printing in the chosen currency (one undoable event). */
export const POST = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { currency } = await body(req, z.object({ currency: z.enum(["eur", "usd"]).default("eur") }));
  const lines = await getDeckLines(db, params.id);
  const cheapest = await cheapestPrintings(db, [...new Set(lines.map((l) => l.oracleId))], currency);
  const ops: DeckOp[] = [];
  for (const l of lines) {
    const c = cheapest.get(l.oracleId);
    if (c && (c.printingId !== l.printingId || c.finish !== l.finish))
      ops.push({
        op: "set_printing",
        oracleId: l.oracleId,
        zone: l.zone,
        printingId: c.printingId,
        finish: c.finish,
      });
  }
  if (ops.length)
    await applyOps(db, user.id, params.id, ops, {
      summary: `Cheapest printings (${currency.toUpperCase()}) for ${ops.length} cards`,
    });
  return { changed: ops.length, ...(await getDeck(db, user.id, params.id)) };
});
