import { getDeck } from "@mtg/db";
import { EXPORT_FORMATS, exportDeck } from "@mtg/mtg/io";
import { z } from "zod";
import { route, searchParams } from "@/server/http";

export const GET = route<{ id: string }>(async ({ req, db, user, params }) => {
  const format = z.enum(EXPORT_FORMATS).parse(searchParams(req).get("format") ?? "text");
  const { deck, entries } = await getDeck(db, user.id, params.id);
  const text = exportDeck(entries, format);
  const ext = format === "csv" ? "csv" : "txt";
  const download = searchParams(req).get("download") === "1";
  return new Response(text, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      ...(download
        ? { "Content-Disposition": `attachment; filename="${deck.name.replace(/[^\w.-]+/g, "_")}.${ext}"` }
        : {}),
    },
  });
});
