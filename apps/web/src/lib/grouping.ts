import {
  COLOR_NAMES,
  type Color,
  type DeckEntry,
  entryPrice,
  primaryType,
  RARITY_ORDER,
  rarityRank,
  TYPE_GROUP_ORDER,
} from "@mtg/mtg";
import type { GroupBy, SortBy } from "@/stores/editor-store";

export interface Group {
  key: string;
  label: string;
  entries: DeckEntry[];
  count: number;
}

const typeOf = (e: DeckEntry) => primaryType(e.card.faces[0]?.typeLine ?? e.card.typeLine);
const isLand = (e: DeckEntry) => typeOf(e) === "Land";

function colorKey(e: DeckEntry): string {
  const c = e.card.colors;
  if (isLand(e)) return "Land";
  if (c.length === 0) return "Colorless";
  if (c.length > 1) return "Multicolor";
  return COLOR_NAMES[c[0] as Color];
}

const COLOR_ORDER = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Land"];

function keysFor(e: DeckEntry, by: GroupBy): string[] {
  switch (by) {
    case "category":
      return e.categories.length ? [e.categories[0]!] : [isLand(e) ? "Land" : "Uncategorized"];
    case "type":
      return [typeOf(e)];
    case "mv":
      return [isLand(e) ? "Land" : String(Math.min(7, Math.floor(e.card.cmc)))];
    case "color":
      return [colorKey(e)];
    case "rarity":
      return [e.printing?.rarity ?? "unknown"];
    case "tag":
      return e.tags.length ? e.tags : ["Untagged"];
    default:
      return ["All"];
  }
}

function label(key: string, by: GroupBy): string {
  if (by === "mv" && key !== "Land") return key === "7" ? "7+ mana" : `${key} mana`;
  if (by === "rarity") return key[0]!.toUpperCase() + key.slice(1);
  return key;
}

function order(by: GroupBy, categoryOrder: string[]): (a: string, b: string) => number {
  const idx = (list: readonly string[], k: string) => {
    const i = list.indexOf(k);
    return i < 0 ? 999 : i;
  };
  switch (by) {
    case "type":
      return (a, b) => idx(TYPE_GROUP_ORDER, a) - idx(TYPE_GROUP_ORDER, b);
    case "mv":
      return (a, b) => (a === "Land" ? 99 : Number(a)) - (b === "Land" ? 99 : Number(b));
    case "color":
      return (a, b) => idx(COLOR_ORDER, a) - idx(COLOR_ORDER, b);
    case "rarity":
      return (a, b) => idx(RARITY_ORDER, b) - idx(RARITY_ORDER, a);
    case "category":
      return (a, b) => {
        const special = (k: string) =>
          k === "Land" ? 1000 : k === "Uncategorized" ? 999 : idx(categoryOrder, k);
        return special(a) - special(b) || a.localeCompare(b);
      };
    default:
      return (a, b) => a.localeCompare(b);
  }
}

export function sortEntries(entries: DeckEntry[], by: SortBy, currency: "eur" | "usd"): DeckEntry[] {
  const cmp: Record<SortBy, (a: DeckEntry, b: DeckEntry) => number> = {
    name: () => 0,
    mv: (a, b) => a.card.cmc - b.card.cmc,
    price: (a, b) => (entryPrice(b, currency) ?? 0) / b.qty - (entryPrice(a, currency) ?? 0) / a.qty,
    type: (a, b) => TYPE_GROUP_ORDER.indexOf(typeOf(a)) - TYPE_GROUP_ORDER.indexOf(typeOf(b)),
    rarity: (a, b) => rarityRank(b.printing?.rarity ?? "") - rarityRank(a.printing?.rarity ?? ""),
  };
  return [...entries].sort((a, b) => cmp[by](a, b) || a.card.name.localeCompare(b.card.name));
}

/** Groups mainboard entries for display; cards with several tags appear in each tag group. */
export function groupEntries(
  entries: DeckEntry[],
  by: GroupBy,
  sortBy: SortBy,
  currency: "eur" | "usd",
  categoryOrder: string[] = [],
): Group[] {
  const map = new Map<string, DeckEntry[]>();
  for (const e of entries) for (const k of keysFor(e, by)) map.set(k, [...(map.get(k) ?? []), e]);
  return [...map.keys()].sort(order(by, categoryOrder)).map((key) => {
    const list = sortEntries(map.get(key)!, sortBy, currency);
    return { key, label: label(key, by), entries: list, count: list.reduce((n, e) => n + e.qty, 0) };
  });
}
