import type { DeckEntry } from "@mtg/mtg";
import { z } from "zod";

/**
 * Commander Spellbook lookup (optional; off by default — enable in Settings only after confirming their terms).
 * Uses the public "find-my-combos" endpoint. The response shape is validated loosely; failures are reported, not thrown.
 */
const ENDPOINT = "https://backend.commanderspellbook.com/find-my-combos";

const comboSchema = z.looseObject({
  id: z.union([z.string(), z.number()]).optional(),
  uses: z.array(z.looseObject({ card: z.looseObject({ name: z.string() }) })).default([]),
  produces: z.array(z.looseObject({ feature: z.looseObject({ name: z.string() }).optional() })).default([]),
  description: z.string().optional(),
});

export async function findCombos(entries: DeckEntry[]) {
  const main = entries
    .filter((e) => e.zone === "mainboard")
    .map((e) => ({ card: e.card.name, quantity: e.qty }));
  const commanders = entries
    .filter((e) => e.zone === "commander")
    .map((e) => ({ card: e.card.name, quantity: 1 }));
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "mtg-deckbuilder-local/0.1",
      },
      body: JSON.stringify({ main, commanders }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { enabled: true, error: `Commander Spellbook returned ${res.status}` };
    const body = (await res.json()) as { results?: { included?: unknown[]; almostIncluded?: unknown[] } };
    const parse = (list: unknown[] | undefined) =>
      (list ?? []).slice(0, 15).flatMap((c) => {
        const p = comboSchema.safeParse(c);
        if (!p.success) return [];
        return [
          {
            cards: p.data.uses.map((u) => u.card.name),
            produces: p.data.produces.map((x) => x.feature?.name).filter(Boolean),
            steps: p.data.description?.slice(0, 400),
          },
        ];
      });
    return {
      enabled: true,
      source: "Commander Spellbook",
      included: parse(body.results?.included),
      almost_included: parse(body.results?.almostIncluded).slice(0, 5),
    };
  } catch (e) {
    return {
      enabled: true,
      error: `Commander Spellbook unreachable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
