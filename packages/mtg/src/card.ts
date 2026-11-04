import type { Color } from "./colors";

export type Legality = "legal" | "not_legal" | "banned" | "restricted";

/** Scryfall layouts we care about. Unknown layouts are kept as plain strings. */
export type Layout =
  | "normal"
  | "split"
  | "flip"
  | "transform"
  | "modal_dfc"
  | "meld"
  | "leveler"
  | "class"
  | "case"
  | "saga"
  | "adventure"
  | "mutate"
  | "prototype"
  | "battle"
  | "planar"
  | "scheme"
  | "vanguard"
  | "token"
  | "double_faced_token"
  | "emblem"
  | "augment"
  | "host"
  | "art_series"
  | "reversible_card"
  | (string & {});

/** Layouts that are not real deck cards; hidden from search unless asked for. */
export const EXTRA_LAYOUTS: readonly string[] = [
  "token",
  "double_faced_token",
  "emblem",
  "art_series",
  "planar",
  "scheme",
  "vanguard",
];

/** Layouts with two physical faces (front/back image). */
export const DOUBLE_FACED_LAYOUTS: readonly string[] = [
  "transform",
  "modal_dfc",
  "meld",
  "double_faced_token",
  "reversible_card",
  "battle",
];

export interface CardFace {
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string;
  colors: Color[] | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
}

export interface RelatedPart {
  id: string;
  component: "token" | "meld_part" | "meld_result" | "combo_piece" | (string & {});
  name: string;
  typeLine: string;
}

/** An oracle card: one per gameplay-distinct card, independent of printing. */
export interface Card {
  id: string;
  name: string;
  layout: Layout;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colors: Color[];
  colorIdentity: Color[];
  keywords: string[];
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  legalities: Record<string, Legality>;
  producedMana: string[];
  faces: CardFace[];
  gameChanger: boolean;
  reserved: boolean;
  edhrecRank: number | null;
  tags: string[];
  games: string[];
  allParts: RelatedPart[];
  minUsd: number | null;
  minEur: number | null;
  minTix: number | null;
  firstReleased: string | null;
}

export interface ImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface Prices {
  usd: number | null;
  usdFoil: number | null;
  usdEtched: number | null;
  eur: number | null;
  eurFoil: number | null;
  tix: number | null;
}

export type Finish = "nonfoil" | "foil" | "etched";

/** A specific printing of an oracle card. */
export interface Printing {
  id: string;
  oracleId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus" | (string & {});
  lang: string;
  releasedAt: string;
  artist: string | null;
  imageUris: ImageUris | null;
  faceImageUris: (ImageUris | null)[];
  finishes: Finish[];
  prices: Prices;
  promo: boolean;
  digital: boolean;
  fullArt: boolean;
  frame: string | null;
  borderColor: string | null;
  frameEffects: string[];
  promoTypes: string[];
  illustrationId: string | null;
  scryfallUri: string | null;
  games: string[];
}

export const RARITY_ORDER = ["common", "uncommon", "rare", "special", "mythic", "bonus"] as const;
export function rarityRank(r: string): number {
  const i = (RARITY_ORDER as readonly string[]).indexOf(r);
  return Math.max(i, 0);
}

/** Front face, falling back to the card itself. */
export function frontFace(card: Pick<Card, "faces" | "name" | "manaCost" | "typeLine" | "oracleText">): {
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string;
} {
  return card.faces[0] ?? card;
}

/** Numeric value of a stat like "3", "*", "1+*"; null when not numeric. */
export function statNumber(v: string | null | undefined): number | null {
  if (v == null) return null;
  const m = /^-?\d+(\.\d+)?/.exec(v);
  if (m) return Number(m[0]);
  if (v.includes("*")) return 0;
  return null;
}

export function priceIn(prices: Prices, currency: "usd" | "eur", finish: Finish = "nonfoil"): number | null {
  if (currency === "eur")
    return finish === "foil" || finish === "etched" ? (prices.eurFoil ?? prices.eur) : prices.eur;
  if (finish === "foil") return prices.usdFoil ?? prices.usd;
  if (finish === "etched") return prices.usdEtched ?? prices.usdFoil ?? prices.usd;
  return prices.usd ?? prices.usdFoil;
}
