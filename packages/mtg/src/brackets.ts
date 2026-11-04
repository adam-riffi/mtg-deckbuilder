import { z } from "zod";
import type { Card } from "./card";
import defaultConfig from "./config/brackets.json";
import { type DeckEntry, entriesIn } from "./deck";

const limitsSchema = z.object({
  gameChangers: z.number().nullable(),
  massLandDenial: z.number().nullable(),
  extraTurnCards: z.number().nullable(),
  twoCardCombos: z.number().nullable(),
  tutors: z.number().nullable(),
});
const detectorSchema = z.object({ tags: z.array(z.string()), patterns: z.array(z.string()) });
export const bracketConfigSchema = z.object({
  version: z.string(),
  source: z.string().optional(),
  note: z.string().optional(),
  brackets: z.array(
    z.object({ level: z.number(), name: z.string(), description: z.string(), limits: limitsSchema }),
  ),
  detectors: z.object({ massLandDenial: detectorSchema, extraTurns: detectorSchema, tutors: detectorSchema }),
});
export type BracketConfig = z.infer<typeof bracketConfigSchema>;
export const DEFAULT_BRACKET_CONFIG: BracketConfig = bracketConfigSchema.parse(defaultConfig);

function detector(d: z.infer<typeof detectorSchema>): (c: Card) => boolean {
  const res = d.patterns.map((p) => new RegExp(p, "i"));
  return (c) => c.tags.some((t) => d.tags.includes(t)) || res.some((r) => r.test(c.oracleText));
}

export interface BracketEstimate {
  bracket: number;
  name: string;
  gameChangers: Card[];
  massLandDenial: Card[];
  extraTurns: Card[];
  tutors: Card[];
  twoCardCombos: number | null;
  reasons: string[];
  configVersion: string;
}

/**
 * Estimates the lowest bracket whose limits the deck satisfies. Bracket 5 (cEDH) depends on intent,
 * so the estimate never exceeds 4. `twoCardCombos` is optional input (e.g. from Commander Spellbook).
 */
export function estimateBracket(
  entries: readonly DeckEntry[],
  opts: { config?: BracketConfig; twoCardCombos?: number | null } = {},
): BracketEstimate {
  const cfg = opts.config ?? DEFAULT_BRACKET_CONFIG;
  const cards = uniqueCards(entriesIn(entries, ["commander", "mainboard", "companion"]));
  const isMld = detector(cfg.detectors.massLandDenial);
  const isTurn = detector(cfg.detectors.extraTurns);
  const isTutor = detector(cfg.detectors.tutors);
  const gc = cards.filter((c) => c.gameChanger);
  const mld = cards.filter(isMld);
  const turns = cards.filter(isTurn);
  const tutors = cards.filter(isTutor);
  const combos = opts.twoCardCombos ?? null;

  const counts = {
    gameChangers: gc.length,
    massLandDenial: mld.length,
    extraTurnCards: turns.length,
    tutors: tutors.length,
    twoCardCombos: combos ?? 0,
  };
  const sorted = [...cfg.brackets].sort((a, b) => a.level - b.level).filter((b) => b.level <= 4);
  let chosen = sorted[sorted.length - 1]!;
  const reasons: string[] = [];
  for (const b of sorted) {
    const fails = (Object.keys(counts) as (keyof typeof counts)[]).filter((k) => {
      const lim = b.limits[k];
      return lim !== null && counts[k] > lim;
    });
    if (fails.length === 0) {
      chosen = b;
      break;
    }
    reasons.push(
      `Above ${b.name} (${b.level}): ${fails.map((k) => `${label(k)} ${counts[k]} > ${b.limits[k]}`).join(", ")}.`,
    );
  }
  reasons.push(`Game Changers: ${gc.length}${gc.length ? ` (${gc.map((c) => c.name).join(", ")})` : ""}.`);
  if (mld.length) reasons.push(`Mass land denial: ${mld.map((c) => c.name).join(", ")}.`);
  if (turns.length) reasons.push(`Extra turns: ${turns.map((c) => c.name).join(", ")}.`);
  if (tutors.length) reasons.push(`Tutors: ${tutors.length}.`);
  if (combos === null) reasons.push("Two-card combos were not checked.");
  reasons.push("Bracket 5 (cEDH) depends on intent and is never inferred.");
  return {
    bracket: chosen.level,
    name: chosen.name,
    gameChangers: gc,
    massLandDenial: mld,
    extraTurns: turns,
    tutors,
    twoCardCombos: combos,
    reasons,
    configVersion: cfg.version,
  };
}

function label(k: string): string {
  return (
    {
      gameChangers: "Game Changers",
      massLandDenial: "mass land denial",
      extraTurnCards: "extra-turn cards",
      tutors: "tutors",
      twoCardCombos: "two-card combos",
    }[k] ?? k
  );
}

function uniqueCards(entries: readonly DeckEntry[]): Card[] {
  const m = new Map<string, Card>();
  for (const e of entries) m.set(e.card.id, e.card);
  return [...m.values()];
}
