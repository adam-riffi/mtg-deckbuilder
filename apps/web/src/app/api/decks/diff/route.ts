import { getCardsByIds, getDeckLines, getDeckRow, getVersion } from "@mtg/db";
import { type DeckLine, diffDecks } from "@mtg/mtg";
import { z } from "zod";
import { body, route } from "@/server/http";

const side = z.object({ deckId: z.string().uuid(), versionId: z.string().uuid().nullish() });

/** Diffs any two decks or deck versions. */
export const POST = route(async ({ req, db, user }) => {
  const { a, b } = await body(req, z.object({ a: side, b: side }));
  const load = async (s: z.infer<typeof side>): Promise<{ label: string; lines: DeckLine[] }> => {
    const deck = await getDeckRow(db, user.id, s.deckId);
    if (s.versionId) {
      const v = await getVersion(db, user.id, s.deckId, s.versionId);
      return { label: `${deck.name} — ${v.name}`, lines: v.snapshot.cards as DeckLine[] };
    }
    return { label: `${deck.name} (current)`, lines: await getDeckLines(db, s.deckId) };
  };
  const [A, B] = await Promise.all([load(a), load(b)]);
  const d = diffDecks(
    A.lines.map((l) => ({ ...l, cardId: l.oracleId })),
    B.lines.map((l) => ({ ...l, cardId: l.oracleId })),
  );
  const ids = [...new Set([...A.lines, ...B.lines].map((l) => l.oracleId))];
  const names = Object.fromEntries((await getCardsByIds(db, ids)).map((c) => [c.id, c.name]));
  return { a: A.label, b: B.label, diff: d, names };
});
