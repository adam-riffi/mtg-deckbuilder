import { z } from "zod";
import type { Card, CardFace, Finish, ImageUris, Legality, Printing, RelatedPart } from "./card";
import { type Color, sortColors } from "./colors";

/**
 * Zod schema for the subset of Scryfall's card object we use.
 * Unknown fields pass through so new Scryfall fields never break ingestion.
 */
const imageUrisSchema = z
  .looseObject({
    small: z.string().optional(),
    normal: z.string().optional(),
    large: z.string().optional(),
    png: z.string().optional(),
    art_crop: z.string().optional(),
    border_crop: z.string().optional(),
  })
  .nullish();

const faceSchema = z.looseObject({
  name: z.string(),
  mana_cost: z.string().nullish(),
  type_line: z.string().nullish(),
  oracle_text: z.string().nullish(),
  colors: z.array(z.string()).nullish(),
  power: z.string().nullish(),
  toughness: z.string().nullish(),
  loyalty: z.string().nullish(),
  defense: z.string().nullish(),
  oracle_id: z.string().nullish(),
  image_uris: imageUrisSchema,
});

const priceSchema = z.string().nullish();

export const scryfallCardSchema = z.looseObject({
  object: z.literal("card").optional(),
  id: z.string(),
  oracle_id: z.string().nullish(),
  name: z.string(),
  lang: z.string().default("en"),
  layout: z.string(),
  released_at: z.string().default("1993-08-05"),
  mana_cost: z.string().nullish(),
  cmc: z.number().nullish(),
  type_line: z.string().nullish(),
  oracle_text: z.string().nullish(),
  colors: z.array(z.string()).nullish(),
  color_identity: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  power: z.string().nullish(),
  toughness: z.string().nullish(),
  loyalty: z.string().nullish(),
  defense: z.string().nullish(),
  produced_mana: z.array(z.string()).nullish(),
  legalities: z.record(z.string(), z.string()).default({}),
  games: z.array(z.string()).default([]),
  reserved: z.boolean().default(false),
  game_changer: z.boolean().nullish(),
  edhrec_rank: z.number().nullish(),
  set: z.string(),
  set_name: z.string().default(""),
  collector_number: z.string(),
  rarity: z.string().default("common"),
  artist: z.string().nullish(),
  illustration_id: z.string().nullish(),
  image_uris: imageUrisSchema,
  card_faces: z.array(faceSchema).nullish(),
  all_parts: z
    .array(
      z.looseObject({
        id: z.string(),
        component: z.string(),
        name: z.string(),
        type_line: z.string().default(""),
      }),
    )
    .nullish(),
  finishes: z.array(z.string()).default(["nonfoil"]),
  prices: z
    .looseObject({
      usd: priceSchema,
      usd_foil: priceSchema,
      usd_etched: priceSchema,
      eur: priceSchema,
      eur_foil: priceSchema,
      tix: priceSchema,
    })
    .default({}),
  promo: z.boolean().default(false),
  digital: z.boolean().default(false),
  full_art: z.boolean().default(false),
  frame: z.string().nullish(),
  border_color: z.string().nullish(),
  frame_effects: z.array(z.string()).nullish(),
  promo_types: z.array(z.string()).nullish(),
  scryfall_uri: z.string().nullish(),
});
export type ScryfallCard = z.infer<typeof scryfallCardSchema>;

export const scryfallRulingSchema = z.looseObject({
  oracle_id: z.string(),
  source: z.string().default("wotc"),
  published_at: z.string(),
  comment: z.string(),
});
export type ScryfallRuling = z.infer<typeof scryfallRulingSchema>;

const num = (v: string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const colors = (v: readonly string[] | null | undefined): Color[] => sortColors(v ?? []);

function images(v: z.infer<typeof imageUrisSchema>): ImageUris | null {
  if (!v) return null;
  const { small, normal, large, png, art_crop, border_crop } = v;
  return { small, normal, large, png, art_crop, border_crop };
}

/** Oracle id, including reversible cards whose oracle id lives on the faces. */
export function oracleIdOf(c: ScryfallCard): string | null {
  return c.oracle_id ?? c.card_faces?.[0]?.oracle_id ?? null;
}

/** Normalises a Scryfall card into our oracle-level card and printing. */
export function fromScryfall(c: ScryfallCard): { card: Card; printing: Printing } | null {
  const oracleId = oracleIdOf(c);
  if (!oracleId) return null;
  const faces: CardFace[] = (c.card_faces ?? []).map((f) => ({
    name: f.name,
    manaCost: f.mana_cost || null,
    typeLine: f.type_line ?? "",
    oracleText: f.oracle_text ?? "",
    colors: f.colors ? colors(f.colors) : null,
    power: f.power ?? null,
    toughness: f.toughness ?? null,
    loyalty: f.loyalty ?? null,
    defense: f.defense ?? null,
  }));
  const typeLine = c.type_line ?? faces.map((f) => f.typeLine).join(" // ");
  const oracleText = c.oracle_text ?? faces.map((f) => f.oracleText).join("\n//\n");
  const manaCost = c.mana_cost || faces[0]?.manaCost || null;
  const cardColors = c.colors ? colors(c.colors) : colors(faces.flatMap((f) => f.colors ?? []));
  const front = faces[0];
  const prices = {
    usd: num(c.prices.usd),
    usdFoil: num(c.prices.usd_foil),
    usdEtched: num(c.prices.usd_etched),
    eur: num(c.prices.eur),
    eurFoil: num(c.prices.eur_foil),
    tix: num(c.prices.tix),
  };
  const allParts: RelatedPart[] = (c.all_parts ?? []).map((p) => ({
    id: p.id,
    component: p.component,
    name: p.name,
    typeLine: p.type_line,
  }));
  const card: Card = {
    id: oracleId,
    name: c.name,
    layout: c.layout,
    manaCost,
    cmc: c.cmc ?? 0,
    typeLine,
    oracleText,
    colors: cardColors,
    colorIdentity: colors(c.color_identity),
    keywords: c.keywords,
    power: c.power ?? front?.power ?? null,
    toughness: c.toughness ?? front?.toughness ?? null,
    loyalty: c.loyalty ?? front?.loyalty ?? null,
    defense: c.defense ?? front?.defense ?? null,
    legalities: c.legalities as Record<string, Legality>,
    producedMana: c.produced_mana ?? [],
    faces,
    gameChanger: c.game_changer ?? false,
    reserved: c.reserved,
    edhrecRank: c.edhrec_rank ?? null,
    tags: [],
    games: c.games,
    allParts,
    minUsd: prices.usd ?? prices.usdFoil ?? prices.usdEtched,
    minEur: prices.eur ?? prices.eurFoil,
    minTix: prices.tix,
    firstReleased: c.released_at,
  };
  const printing: Printing = {
    id: c.id,
    oracleId,
    name: c.name,
    setCode: c.set,
    setName: c.set_name,
    collectorNumber: c.collector_number,
    rarity: c.rarity,
    lang: c.lang,
    releasedAt: c.released_at,
    artist: c.artist ?? null,
    imageUris: images(c.image_uris),
    faceImageUris: (c.card_faces ?? []).map((f) => images(f.image_uris)),
    finishes: c.finishes.filter((f): f is Finish => f === "nonfoil" || f === "foil" || f === "etched"),
    prices,
    promo: c.promo,
    digital: c.digital,
    fullArt: c.full_art,
    frame: c.frame ?? null,
    borderColor: c.border_color ?? null,
    frameEffects: c.frame_effects ?? [],
    promoTypes: c.promo_types ?? [],
    illustrationId: c.illustration_id ?? null,
    scryfallUri: c.scryfall_uri ?? null,
    games: c.games,
  };
  return { card, printing };
}

/** Image for a printing face; never cropped or altered, always Scryfall's CDN URL. */
export function printingImage(
  p: Pick<Printing, "imageUris" | "faceImageUris">,
  face = 0,
  size: keyof ImageUris = "normal",
): string | null {
  const uris = p.imageUris ?? p.faceImageUris[face] ?? p.faceImageUris[0] ?? null;
  if (face > 0 && p.faceImageUris[face]) return p.faceImageUris[face]?.[size] ?? null;
  return uris?.[size] ?? null;
}
