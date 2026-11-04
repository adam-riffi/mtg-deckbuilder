import {
  colorIdentityLabel,
  computeStats,
  type DeckEntry,
  deckColorIdentity,
  estimateBracket,
  getFormat,
  validateDeck,
} from "@mtg/mtg";

export interface DeckMeta {
  name: string;
  format: string;
  targetBracket: number | null;
  budgetAmount: number | null;
  budgetCurrency: string;
}

/**
 * Compact deck summary sent with every turn (no full card objects; details come through tools).
 * Format, commanders, identity, counts per zone/category, curve, bracket, budget, legality issues.
 */
export function deckSummary(meta: DeckMeta, entries: DeckEntry[], currency: "eur" | "usd" = "eur"): string {
  const f = getFormat(meta.format);
  const stats = computeStats(entries, { format: meta.format, currency });
  const legality = validateDeck(entries, meta.format);
  const bracket = f.commander ? estimateBracket(entries) : null;
  const identity = deckColorIdentity(entries);
  const zones = ["commander", "companion", "mainboard", "sideboard", "maybeboard"] as const;
  const zoneCounts = zones
    .map((z) => [z, entries.filter((e) => e.zone === z).reduce((n, e) => n + e.qty, 0)] as const)
    .filter(([, n]) => n > 0)
    .map(([z, n]) => `${z} ${n}`)
    .join(", ");
  const cats = Object.entries(stats.categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c} ${n}`)
    .join(", ");
  const curve = stats.curve.map((b) => `${b.mv === 7 ? "7+" : b.mv}:${b.total}`).join(" ");
  const lines = [
    `Deck: "${meta.name}"`,
    `Format: ${f.name}${f.exactSize ? ` (exactly ${f.exactSize} cards)` : f.minMain ? ` (min ${f.minMain})` : ""}`,
    f.commander
      ? `Commander(s): ${
          entries
            .filter((e) => e.zone === "commander")
            .map((e) => e.card.name)
            .join(" + ") || "none chosen"
        }`
      : null,
    `Colour identity: ${colorIdentityLabel(identity)}`,
    `Cards by zone: ${zoneCounts || "empty"} (played total ${stats.totalCards})`,
    `Lands: ${stats.landCount} (guidance ${stats.landGuidance.min}-${stats.landGuidance.max}); average MV ${stats.averageMv.toFixed(2)}`,
    `Curve (non-land, MV:count): ${curve}`,
    `Categories: ${cats || "none"}`,
    bracket
      ? `Bracket estimate: ${bracket.bracket} (${bracket.name}); Game Changers ${bracket.gameChangers.length}${meta.targetBracket ? `; target bracket ${meta.targetBracket}` : ""}`
      : null,
    `Price: ${stats.price.total.toFixed(2)} ${currency.toUpperCase()}${meta.budgetAmount ? `; budget ${meta.budgetAmount} ${meta.budgetCurrency.toUpperCase()}` : "; no budget set"}`,
    legality.issues.length
      ? `Legality issues: ${legality.issues
          .slice(0, 8)
          .map((i) => i.message)
          .join(" | ")}${legality.issues.length > 8 ? ` (+${legality.issues.length - 8} more)` : ""}`
      : "Legality: no issues",
  ];
  return lines.filter(Boolean).join("\n");
}
