import { createHash } from "node:crypto";
import {
  colorMask,
  fromScryfall,
  rarityRank,
  type ScryfallCard,
  type ScryfallRuling,
  scryfallCardSchema,
  scryfallRulingSchema,
  statNumber,
} from "@mtg/mtg";
import { eq, getTableColumns, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { type Db, query } from "./client";
import { cardTags, ingestRuns, oracleCards, printings, rulings } from "./schema";
import { normalizeName } from "./search";

/** `set` clause updating every non-key column from EXCLUDED, for idempotent upserts. */
function excludedSet<T extends PgTable>(table: T, skip: string[] = []): Record<string, SQL> {
  const cols = getTableColumns(table);
  const out: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(cols)) {
    if (skip.includes(key) || (col as { primary?: boolean }).primary) continue;
    if ((col as { generated?: unknown }).generated) continue;
    out[key] = sql.raw(`excluded."${(col as { name: string }).name}"`);
  }
  return out;
}

const stripReminder = (s: string) =>
  s
    .replace(/\([^)]*\)/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

type OracleInsert = typeof oracleCards.$inferInsert;
type PrintingInsert = typeof printings.$inferInsert;

function oracleRow(c: ScryfallCard): { oracle: OracleInsert; printing: PrintingInsert } | null {
  const n = fromScryfall(c);
  if (!n) return null;
  const { card, printing } = n;
  return {
    oracle: {
      id: card.id,
      name: card.name,
      nameSearch: normalizeName(card.name),
      layout: card.layout,
      manaCost: card.manaCost,
      cmc: card.cmc,
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      oracleSearch: stripReminder(card.oracleText),
      colors: card.colors,
      colorIdentity: card.colorIdentity,
      colorsMask: colorMask(card.colors),
      identityMask: colorMask(card.colorIdentity),
      producedMask: colorMask(card.producedMana),
      keywords: card.keywords,
      power: card.power,
      toughness: card.toughness,
      loyalty: card.loyalty,
      defense: card.defense,
      powerNum: statNumber(card.power),
      toughnessNum: statNumber(card.toughness),
      loyaltyNum: statNumber(card.loyalty),
      defenseNum: statNumber(card.defense),
      legalities: card.legalities,
      producedMana: card.producedMana,
      faces: card.faces,
      allParts: card.allParts,
      gameChanger: card.gameChanger,
      reserved: card.reserved,
      edhrecRank: card.edhrecRank,
      games: card.games,
      minUsd: card.minUsd,
      minEur: card.minEur,
      minTix: card.minTix,
      maxRarity: rarityRank(printing.rarity),
      firstReleased: card.firstReleased,
      defaultPrintingId: printing.id,
      updatedAt: new Date(),
    },
    printing: {
      id: printing.id,
      oracleId: printing.oracleId,
      name: printing.name,
      setCode: printing.setCode,
      setName: printing.setName,
      collectorNumber: printing.collectorNumber,
      rarity: printing.rarity,
      rarityRank: rarityRank(printing.rarity),
      lang: printing.lang,
      releasedAt: printing.releasedAt,
      artist: printing.artist,
      imageUris: printing.imageUris,
      faceImageUris: printing.faceImageUris,
      finishes: printing.finishes,
      prices: printing.prices,
      usd: printing.prices.usd,
      usdFoil: printing.prices.usdFoil,
      eur: printing.prices.eur,
      eurFoil: printing.prices.eurFoil,
      tix: printing.prices.tix,
      promo: printing.promo,
      digital: printing.digital,
      fullArt: printing.fullArt,
      frame: printing.frame,
      borderColor: printing.borderColor,
      frameEffects: printing.frameEffects,
      promoTypes: printing.promoTypes,
      illustrationId: printing.illustrationId,
      scryfallUri: printing.scryfallUri,
      games: printing.games,
      updatedAt: new Date(),
    },
  };
}

export interface IngestCounts {
  oracle: number;
  printings: number;
  skipped: number;
  invalid: number;
}

/**
 * Upserts a batch of raw Scryfall card objects.
 * mode "oracle": rows define oracle data (oracle-cards bulk file; sets the default printing).
 * mode "printings": rows are printings (default-cards bulk file); oracle rows are created only if missing.
 * mode "both": fixtures; each row is a printing and, the first time an oracle id is seen, its oracle data.
 */
export async function upsertScryfallBatch(
  db: Db,
  raw: unknown[],
  mode: "oracle" | "printings" | "both",
  counts: IngestCounts,
): Promise<void> {
  const oracle = new Map<string, OracleInsert>();
  const prints = new Map<string, PrintingInsert>();
  for (const r of raw) {
    const parsed = scryfallCardSchema.safeParse(r);
    if (!parsed.success) {
      counts.invalid++;
      continue;
    }
    if (parsed.data.layout === "art_series" || parsed.data.lang !== "en") {
      counts.skipped++;
      continue;
    }
    const row = oracleRow(parsed.data);
    if (!row) {
      counts.skipped++;
      continue;
    }
    if (mode !== "printings" || !oracle.has(row.oracle.id)) {
      if (!(mode === "both" && oracle.has(row.oracle.id))) oracle.set(row.oracle.id, row.oracle);
    }
    if (mode !== "oracle") prints.set(row.printing.id, row.printing);
  }
  if (oracle.size) {
    const values = [...oracle.values()];
    if (mode === "printings") await db.insert(oracleCards).values(values).onConflictDoNothing();
    else
      await db
        .insert(oracleCards)
        .values(values)
        // "both" keeps the first default printing ever assigned; "oracle" takes Scryfall's representative printing.
        .onConflictDoUpdate({
          target: oracleCards.id,
          set: excludedSet(oracleCards, mode === "both" ? ["defaultPrintingId", "tags"] : ["tags"]),
        });
    counts.oracle += values.length;
  }
  if (prints.size) {
    const values = [...prints.values()];
    await db
      .insert(printings)
      .values(values)
      .onConflictDoUpdate({ target: printings.id, set: excludedSet(printings) });
    counts.printings += values.length;
  }
}

/** Recomputes oracle-level aggregates from printings (cheapest price, max rarity, first release, games). */
export async function refreshOracleAggregates(db: Db): Promise<void> {
  await db.execute(sql`
    update oracle_cards o set
      min_usd = a.min_usd, min_eur = a.min_eur, min_tix = a.min_tix,
      max_rarity = a.max_rarity, first_released = a.first_released
    from (
      select oracle_id,
        min(coalesce(usd, usd_foil)) filter (where not digital) as min_usd,
        min(coalesce(eur, eur_foil)) filter (where not digital) as min_eur,
        min(tix) as min_tix,
        max(rarity_rank) as max_rarity,
        min(released_at) as first_released
      from printings group by oracle_id
    ) a
    where a.oracle_id = o.id`);
  await db.execute(sql`
    update oracle_cards o set games = g.games
    from (select oracle_id, array_agg(distinct game order by game) as games from printings, unnest(games) as game group by oracle_id) g
    where g.oracle_id = o.id`);
}

export async function upsertRulings(db: Db, raw: unknown[]): Promise<number> {
  const rows: (typeof rulings.$inferInsert)[] = [];
  for (const r of raw) {
    const p = scryfallRulingSchema.safeParse(r);
    if (!p.success) continue;
    const x: ScryfallRuling = p.data;
    rows.push({
      oracleId: x.oracle_id,
      source: x.source,
      publishedAt: x.published_at,
      comment: x.comment,
      hash: createHash("sha1").update(`${x.oracle_id}|${x.published_at}|${x.comment}`).digest("hex"),
    });
  }
  if (rows.length) await db.insert(rulings).values(rows).onConflictDoNothing();
  return rows.length;
}

/** Replaces oracle tags for the given cards and mirrors them onto oracle_cards.tags for fast search. */
export async function upsertTags(
  db: Db,
  items: { oracleId: string; tags: string[] }[],
  source = "scryfall",
): Promise<void> {
  const rows = items.flatMap((i) =>
    [...new Set(i.tags)].map((tag) => ({ oracleId: i.oracleId, tag: tag.toLowerCase(), source })),
  );
  if (rows.length) await db.insert(cardTags).values(rows).onConflictDoNothing();
  if (items.length)
    await db.execute(
      sql`update oracle_cards o set tags = t.tags from (select oracle_id, array_agg(tag order by tag) as tags from card_tags where oracle_id in (${sql.join(
        items.map((i) => sql`${i.oracleId}::uuid`),
        sql`, `,
      )}) group by oracle_id) t where t.oracle_id = o.id`,
    );
}

/** Records today's prices for every printing (idempotent per day). */
export async function snapshotPrices(db: Db, day = new Date().toISOString().slice(0, 10)): Promise<number> {
  const rows = await query<{ n: number }>(
    db,
    sql`with ins as (insert into price_snapshots (printing_id, day, usd, usd_foil, eur, eur_foil, tix)
      select id, ${day}::date, usd, usd_foil, eur, eur_foil, tix from printings where usd is not null or eur is not null or tix is not null or usd_foil is not null or eur_foil is not null
      on conflict (printing_id, day) do update set usd = excluded.usd, usd_foil = excluded.usd_foil, eur = excluded.eur, eur_foil = excluded.eur_foil, tix = excluded.tix
      returning 1) select count(*)::int as n from ins`,
  );
  return rows[0]?.n ?? 0;
}

export async function startRun(
  db: Db,
  kind: string,
  source: string,
  sourceUpdatedAt?: Date | null,
): Promise<number> {
  const [r] = await db
    .insert(ingestRuns)
    .values({ kind, source, sourceUpdatedAt: sourceUpdatedAt ?? null })
    .returning({ id: ingestRuns.id });
  return r!.id;
}

export async function finishRun(
  db: Db,
  id: number,
  status: "succeeded" | "failed",
  counts: Record<string, number>,
  error?: string,
): Promise<void> {
  await db
    .update(ingestRuns)
    .set({ status, counts, error: error ?? null, finishedAt: new Date() })
    .where(eq(ingestRuns.id, id));
}

export async function lastSuccessfulRun(db: Db, kind: string) {
  const rows = await db
    .select()
    .from(ingestRuns)
    .where(sql`${ingestRuns.kind} = ${kind} and ${ingestRuns.status} = 'succeeded'`)
    .orderBy(sql`${ingestRuns.finishedAt} desc`)
    .limit(1);
  return rows[0] ?? null;
}

/** Ingests an in-memory list of Scryfall cards (used for fixtures and tests). */
export async function ingestCardList(
  db: Db,
  cards: unknown[],
  opts: { rulings?: unknown[]; tags?: { oracleId: string; tags: string[] }[] } = {},
): Promise<IngestCounts> {
  const counts: IngestCounts = { oracle: 0, printings: 0, skipped: 0, invalid: 0 };
  for (let i = 0; i < cards.length; i += 500)
    await upsertScryfallBatch(db, cards.slice(i, i + 500), "both", counts);
  await refreshOracleAggregates(db);
  if (opts.rulings?.length) await upsertRulings(db, opts.rulings);
  if (opts.tags?.length) await upsertTags(db, opts.tags);
  await snapshotPrices(db);
  return counts;
}
