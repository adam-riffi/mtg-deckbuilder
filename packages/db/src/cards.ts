import type { Card, Color, ImageUris, Printing } from "@mtg/mtg";
import type { ParsedLine } from "@mtg/mtg/io";
import { parseSearch, type SearchQuery } from "@mtg/mtg/search";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type Db, query } from "./client";
import { cardTags, oracleCards, printings, rulings } from "./schema";
import { compileOrder, compileWhere, normalizeName } from "./search";

type OracleRow = typeof oracleCards.$inferSelect;
type PrintingRow = typeof printings.$inferSelect;

export function rowToCard(r: OracleRow): Card {
  return {
    id: r.id,
    name: r.name,
    layout: r.layout,
    manaCost: r.manaCost,
    cmc: r.cmc,
    typeLine: r.typeLine,
    oracleText: r.oracleText,
    colors: r.colors as Color[],
    colorIdentity: r.colorIdentity as Color[],
    keywords: r.keywords,
    power: r.power,
    toughness: r.toughness,
    loyalty: r.loyalty,
    defense: r.defense,
    legalities: r.legalities,
    producedMana: r.producedMana,
    faces: r.faces,
    gameChanger: r.gameChanger,
    reserved: r.reserved,
    edhrecRank: r.edhrecRank,
    tags: r.tags,
    games: r.games,
    allParts: r.allParts,
    minUsd: r.minUsd,
    minEur: r.minEur,
    minTix: r.minTix,
    firstReleased: r.firstReleased,
  };
}

export function rowToPrinting(r: PrintingRow): Printing {
  return {
    id: r.id,
    oracleId: r.oracleId,
    name: r.name,
    setCode: r.setCode,
    setName: r.setName,
    collectorNumber: r.collectorNumber,
    rarity: r.rarity,
    lang: r.lang,
    releasedAt: r.releasedAt,
    artist: r.artist,
    imageUris: r.imageUris,
    faceImageUris: r.faceImageUris,
    finishes: r.finishes as Printing["finishes"],
    prices: r.prices,
    promo: r.promo,
    digital: r.digital,
    fullArt: r.fullArt,
    frame: r.frame,
    borderColor: r.borderColor,
    frameEffects: r.frameEffects,
    promoTypes: r.promoTypes,
    illustrationId: r.illustrationId,
    scryfallUri: r.scryfallUri,
    games: r.games,
  };
}

export interface CardHit {
  card: Card;
  image: ImageUris | null;
  faceImages: (ImageUris | null)[];
  printingId: string | null;
  setCode: string | null;
}

export interface SearchResult {
  query: SearchQuery;
  total: number;
  hits: CardHit[];
  tookMs: number;
}

/** Runs a Scryfall-syntax search. Results are one row per oracle card with its default printing's image. */
export async function searchCards(
  db: Db,
  input: string,
  opts: { limit?: number; offset?: number; extraWhere?: ReturnType<typeof sql> } = {},
): Promise<SearchResult> {
  const t0 = performance.now();
  const parsed = parseSearch(input);
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where = opts.extraWhere ? sql`${compileWhere(parsed)} and ${opts.extraWhere}` : compileWhere(parsed);
  const list = await query<{ id: string; total: number }>(
    db,
    sql`select o.id, count(*) over() as total from oracle_cards o where ${where} order by ${compileOrder(parsed)} limit ${limit} offset ${offset}`,
  );
  const ids = list.map((r) => r.id);
  const total = list.length ? Number(list[0]!.total) : 0;
  const hits = await hitsFor(db, ids);
  return { query: parsed, total, hits, tookMs: Math.round(performance.now() - t0) };
}

export async function hitsFor(db: Db, ids: string[]): Promise<CardHit[]> {
  if (!ids.length) return [];
  const cards = await db.select().from(oracleCards).where(inArray(oracleCards.id, ids));
  const printIds = cards.map((c) => c.defaultPrintingId).filter((x): x is string => !!x);
  const prints = printIds.length
    ? await db.select().from(printings).where(inArray(printings.id, printIds))
    : [];
  const pById = new Map(prints.map((p) => [p.id, p]));
  const cById = new Map(cards.map((c) => [c.id, c]));
  return ids
    .map((id) => cById.get(id))
    .filter((c): c is OracleRow => !!c)
    .map((c) => {
      const p = c.defaultPrintingId ? pById.get(c.defaultPrintingId) : undefined;
      return {
        card: rowToCard(c),
        image: p?.imageUris ?? null,
        faceImages: p?.faceImageUris ?? [],
        printingId: p?.id ?? null,
        setCode: p?.setCode ?? null,
      };
    });
}

/** Fuzzy name autocomplete (prefix first, then trigram word similarity). */
export async function autocomplete(db: Db, q: string, limit = 10): Promise<{ id: string; name: string }[]> {
  const n = normalizeName(q);
  if (!n) return [];
  const esc = n.replace(/[\\%_]/g, (m) => `\\${m}`);
  return query<{ id: string; name: string }>(
    db,
    sql`
    select o.id, o.name from oracle_cards o
    where (o.name_search like ${`${esc}%`} or o.name_search like ${`% ${esc}%`} or ${n} <% o.name_search)
      and o.layout not in ('token','double_faced_token','emblem','art_series')
    order by (o.name_search like ${`${esc}%`}) desc, word_similarity(${n}, o.name_search) desc, o.edhrec_rank asc nulls last, o.name
    limit ${limit}`,
  );
}

export async function getCardsByIds(db: Db, ids: string[]): Promise<Card[]> {
  if (!ids.length) return [];
  const rows = await db.select().from(oracleCards).where(inArray(oracleCards.id, ids));
  return rows.map(rowToCard);
}

/** Exact (case-insensitive) name lookup; also matches individual face names ("Fire" → "Fire // Ice"). */
export async function getCardsByNames(db: Db, names: string[]): Promise<Map<string, Card>> {
  const out = new Map<string, Card>();
  if (!names.length) return out;
  const lowered = [...new Set(names.map((n) => n.toLowerCase().trim()))];
  const rows = await db
    .select()
    .from(oracleCards)
    .where(
      sql`(lower(${oracleCards.name}) = any(${sql.raw(`array[${lowered.map((n) => `'${n.replace(/'/g, "''")}'`).join(",")}]::text[]`)})
        or lower(split_part(${oracleCards.name}, ' // ', 1)) = any(${sql.raw(`array[${lowered.map((n) => `'${n.replace(/'/g, "''")}'`).join(",")}]::text[]`)}))
        and ${oracleCards.layout} not in ('art_series')`,
    );
  // Prefer real cards over tokens with the same name.
  rows.sort((a, b) => Number(a.layout.includes("token")) - Number(b.layout.includes("token")));
  for (const r of rows) {
    const c = rowToCard(r);
    for (const key of [r.name.toLowerCase(), r.name.split(" // ")[0]!.toLowerCase()])
      if (!out.has(key)) out.set(key, c);
  }
  return out;
}

export async function getPrintingsFor(db: Db, oracleId: string): Promise<Printing[]> {
  const rows = await db
    .select()
    .from(printings)
    .where(eq(printings.oracleId, oracleId))
    .orderBy(sql`${printings.releasedAt} desc`, printings.setCode, printings.collectorNumber);
  return rows.map(rowToPrinting);
}

export async function getPrintingsByIds(db: Db, ids: string[]): Promise<Printing[]> {
  if (!ids.length) return [];
  const rows = await db.select().from(printings).where(inArray(printings.id, ids));
  return rows.map(rowToPrinting);
}

export interface CardDetail {
  card: Card;
  printings: Printing[];
  rulings: { source: string; publishedAt: string; comment: string }[];
  tokens: { id: string; name: string; typeLine: string }[];
  tags: string[];
}

export async function getCardDetail(db: Db, oracleId: string): Promise<CardDetail | null> {
  const [row] = await db.select().from(oracleCards).where(eq(oracleCards.id, oracleId));
  if (!row) return null;
  const card = rowToCard(row);
  const [prints, rules, tags] = await Promise.all([
    getPrintingsFor(db, oracleId),
    db.select().from(rulings).where(eq(rulings.oracleId, oracleId)).orderBy(rulings.publishedAt),
    db.select().from(cardTags).where(eq(cardTags.oracleId, oracleId)),
  ]);
  return {
    card,
    printings: prints,
    rulings: rules.map((r) => ({ source: r.source, publishedAt: r.publishedAt, comment: r.comment })),
    tokens: card.allParts
      .filter((p) => p.component === "token" || p.component === "meld_result" || p.component === "meld_part")
      .filter((p) => p.name !== card.name),
    tags: tags.map((t) => t.tag),
  };
}

export interface ResolvedLine {
  line: ParsedLine;
  card: Card | null;
  printing: Printing | null;
  suggestions: string[];
}

/** Resolves parsed decklist lines to cards and printings; unresolved lines carry fuzzy suggestions. */
export async function resolveLines(db: Db, lines: ParsedLine[]): Promise<ResolvedLine[]> {
  const byName = await getCardsByNames(
    db,
    lines.map((l) => l.name),
  );
  const out: ResolvedLine[] = [];
  for (const line of lines) {
    let printing: Printing | null = null;
    let card = byName.get(line.name.toLowerCase()) ?? null;
    if (line.scryfallId) {
      const [p] = await db.select().from(printings).where(eq(printings.id, line.scryfallId));
      if (p) printing = rowToPrinting(p);
    }
    if (!printing && line.setCode && card) {
      const conds = [eq(printings.oracleId, card.id), eq(printings.setCode, line.setCode)];
      if (line.collectorNumber) conds.push(eq(printings.collectorNumber, line.collectorNumber));
      const [p] = await db
        .select()
        .from(printings)
        .where(and(...conds))
        .limit(1);
      if (p) printing = rowToPrinting(p);
    }
    if (printing && !card) {
      const [c] = await getCardsByIds(db, [printing.oracleId]);
      card = c ?? null;
    }
    const suggestions = card ? [] : (await autocomplete(db, line.name, 3)).map((s) => s.name);
    out.push({ line, card, printing, suggestions });
  }
  return out;
}

/** Cheapest paper printing per card in the given currency (nonfoil price, falling back to foil). */
export async function cheapestPrintings(
  db: Db,
  oracleIds: string[],
  currency: "eur" | "usd",
): Promise<Map<string, { printingId: string; price: number; finish: "nonfoil" | "foil" }>> {
  const out = new Map<string, { printingId: string; price: number; finish: "nonfoil" | "foil" }>();
  if (!oracleIds.length) return out;
  const col = currency === "eur" ? sql.raw("eur") : sql.raw("usd");
  const foil = currency === "eur" ? sql.raw("eur_foil") : sql.raw("usd_foil");
  const rows = await query<{ oracle_id: string; id: string; price: number; finish: "nonfoil" | "foil" }>(
    db,
    sql`select distinct on (oracle_id) oracle_id, id, coalesce(${col}, ${foil}) as price, case when ${col} is null then 'foil' else 'nonfoil' end as finish
      from printings where oracle_id in (${sql.join(
        oracleIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}) and not digital and coalesce(${col}, ${foil}) is not null
      order by oracle_id, coalesce(${col}, ${foil}) asc, released_at desc`,
  );
  for (const r of rows) out.set(r.oracle_id, { printingId: r.id, price: Number(r.price), finish: r.finish });
  return out;
}
