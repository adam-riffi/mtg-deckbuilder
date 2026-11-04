import { type Card, type Finish, type Printing, priceIn } from "./card";
import { COLORS, type Color } from "./colors";
import { type DeckEntry, entriesIn, PLAYED_ZONES, type Zone } from "./deck";
import { countPips, emptyPips, type PipCounts } from "./mana";
import { isLandTypeLine, primaryType, type TypeGroup } from "./types";

export interface CurveBucket {
  mv: number; // 7 means 7+
  total: number;
  byType: Partial<Record<TypeGroup, number>>;
}

export interface DeckStats {
  totalCards: number;
  landCount: number;
  nonLandCount: number;
  averageMv: number;
  averageMvWithLands: number;
  curve: CurveBucket[];
  typeCounts: Partial<Record<TypeGroup, number>>;
  pips: PipCounts;
  sources: PipCounts;
  pipShare: Record<Color, number>;
  sourceShare: Record<Color, number>;
  categoryCounts: Record<string, number>;
  price: {
    total: number;
    currency: "eur" | "usd";
    missing: number;
    byCategory: Record<string, number>;
    top: { name: string; price: number }[];
  };
  landGuidance: LandGuidance;
}

export interface LandGuidance {
  recommended: number;
  min: number;
  max: number;
  explanation: string;
}

const isLand = (c: Card) => isLandTypeLine(c.faces[0]?.typeLine ?? c.typeLine);

/** Mana sources a card provides (lands and nonland mana producers). */
function sourceColors(c: Card): (Color | "C")[] {
  return c.producedMana.filter(
    (m): m is Color | "C" => m === "C" || (COLORS as readonly string[]).includes(m),
  );
}

/**
 * Land-count guidance (Karsten-style rule of thumb): Commander ≈ 31 + 1.5×avg MV − ramp adjustment,
 * 60-card ≈ 16 + 3×avg MV, both clamped to sensible ranges.
 */
export function landGuidance(format: string, averageMv: number, rampCount: number): LandGuidance {
  const commanderLike = ["commander", "duel", "brawl", "paupercommander"].includes(format);
  if (commanderLike) {
    const raw = 31 + 1.5 * averageMv - Math.max(0, rampCount - 6) * 0.5;
    const rec = Math.round(Math.min(40, Math.max(33, raw)));
    return {
      recommended: rec,
      min: rec - 2,
      max: rec + 2,
      explanation: `≈31 + 1.5 × avg MV (${averageMv.toFixed(2)}) − 0.5 per ramp piece beyond 6 (${rampCount} ramp).`,
    };
  }
  const size = format === "standardbrawl" || format === "oathbreaker" ? 60 : 60;
  const raw = 16 + 3 * averageMv;
  const rec = Math.round(Math.min(27, Math.max(20, raw)));
  return {
    recommended: rec,
    min: rec - 1,
    max: rec + 1,
    explanation: `≈16 + 3 × avg MV (${averageMv.toFixed(2)}) for a ${size}-card deck.`,
  };
}

export function computeStats(
  entries: readonly DeckEntry[],
  opts: { format?: string; currency?: "eur" | "usd"; zones?: readonly Zone[] } = {},
): DeckStats {
  const zones = opts.zones ?? PLAYED_ZONES;
  const currency = opts.currency ?? "eur";
  const played = entriesIn(entries, zones);
  const curve: CurveBucket[] = Array.from({ length: 8 }, (_, mv) => ({ mv, total: 0, byType: {} }));
  const typeCounts: Partial<Record<TypeGroup, number>> = {};
  const pips = emptyPips();
  const sources = emptyPips();
  const categoryCounts: Record<string, number> = {};
  let total = 0;
  let lands = 0;
  let mvSum = 0;
  let rampCount = 0;
  for (const e of played) {
    const c = e.card;
    total += e.qty;
    const t = primaryType(c.faces[0]?.typeLine ?? c.typeLine);
    typeCounts[t] = (typeCounts[t] ?? 0) + e.qty;
    for (const cat of e.categories.length ? e.categories : ["Uncategorized"])
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + e.qty;
    if (e.categories.includes("Ramp")) rampCount += e.qty;
    for (const s of sourceColors(c)) sources[s] += e.qty;
    if (isLand(c)) {
      lands += e.qty;
      continue;
    }
    mvSum += c.cmc * e.qty;
    const bucket = curve[Math.min(7, Math.floor(c.cmc))]!;
    bucket.total += e.qty;
    bucket.byType[t] = (bucket.byType[t] ?? 0) + e.qty;
    for (let i = 0; i < e.qty; i++) countPips(c.faces[0]?.manaCost ?? c.manaCost, pips);
  }
  const nonLand = total - lands;
  const share = (p: PipCounts): Record<Color, number> => {
    const sum = COLORS.reduce((n, c) => n + p[c], 0) || 1;
    return Object.fromEntries(COLORS.map((c) => [c, p[c] / sum])) as Record<Color, number>;
  };
  const averageMv = nonLand ? mvSum / nonLand : 0;
  return {
    totalCards: total,
    landCount: lands,
    nonLandCount: nonLand,
    averageMv,
    averageMvWithLands: total ? mvSum / total : 0,
    curve,
    typeCounts,
    pips,
    sources,
    pipShare: share(pips),
    sourceShare: share(sources),
    categoryCounts,
    price: priceBreakdown(played, currency),
    landGuidance: landGuidance(opts.format ?? "commander", averageMv, rampCount),
  };
}

export function entryPrice(
  e: { qty: number; finish: Finish; printing: Printing | null; card: Card },
  currency: "eur" | "usd",
): number | null {
  const p = e.printing ? priceIn(e.printing.prices, currency, e.finish) : null;
  const fallback = currency === "eur" ? e.card.minEur : e.card.minUsd;
  const v = p ?? fallback;
  return v == null ? null : v * e.qty;
}

function priceBreakdown(entries: readonly DeckEntry[], currency: "eur" | "usd"): DeckStats["price"] {
  let total = 0;
  let missing = 0;
  const byCategory: Record<string, number> = {};
  const items: { name: string; price: number }[] = [];
  for (const e of entries) {
    const v = entryPrice(e, currency);
    if (v == null) {
      missing += e.qty;
      continue;
    }
    total += v;
    items.push({ name: e.card.name, price: v });
    const cat = e.categories[0] ?? "Uncategorized";
    byCategory[cat] = (byCategory[cat] ?? 0) + v;
  }
  items.sort((a, b) => b.price - a.price);
  return { total: Math.round(total * 100) / 100, currency, missing, byCategory, top: items.slice(0, 10) };
}
