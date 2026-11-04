import { and, eq, inArray, sql } from "drizzle-orm";
import { type Db, query } from "./client";
import { collectionItems, collections, printings } from "./schema";

/** Each user has one default collection (created on first use). */
export async function getOrCreateCollection(db: Db, userId: string) {
  const [c] = await db.select().from(collections).where(eq(collections.userId, userId)).limit(1);
  if (c) return c;
  const [n] = await db.insert(collections).values({ userId }).returning();
  return n!;
}

export async function ownedByOracle(
  db: Db,
  userId: string,
  oracleIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!oracleIds.length) return out;
  const c = await getOrCreateCollection(db, userId);
  const rows = await db
    .select({ oracleId: collectionItems.oracleId, qty: sql<number>`sum(${collectionItems.qty})::int` })
    .from(collectionItems)
    .where(and(eq(collectionItems.collectionId, c.id), inArray(collectionItems.oracleId, oracleIds)))
    .groupBy(collectionItems.oracleId);
  for (const r of rows) out.set(r.oracleId, r.qty);
  return out;
}

export interface CollectionRow {
  printingId: string;
  oracleId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  finish: string;
  qty: number;
  condition: string;
  language: string;
  eur: number | null;
  usd: number | null;
  image: string | null;
}

export async function listCollection(
  db: Db,
  userId: string,
  opts: { q?: string; limit?: number; offset?: number } = {},
) {
  const c = await getOrCreateCollection(db, userId);
  const q = opts.q?.trim().toLowerCase();
  const rows = await query<CollectionRow & { total: number }>(
    db,
    sql`select ci.printing_id as "printingId", ci.oracle_id as "oracleId", p.name, p.set_code as "setCode", p.collector_number as "collectorNumber",
        ci.finish, ci.qty, ci.condition, ci.language,
        case when ci.finish = 'nonfoil' then p.eur else coalesce(p.eur_foil, p.eur) end as eur,
        case when ci.finish = 'nonfoil' then p.usd else coalesce(p.usd_foil, p.usd) end as usd,
        coalesce(p.image_uris->>'small', p.face_image_uris->0->>'small') as image,
        count(*) over() as total
      from collection_items ci join printings p on p.id = ci.printing_id
      where ci.collection_id = ${c.id} ${q ? sql`and lower(p.name) like ${`%${q}%`}` : sql``}
      order by p.name, p.set_code limit ${opts.limit ?? 200} offset ${opts.offset ?? 0}`,
  );
  const [summary] = await query<{ cards: number; unique: number; eur: number; usd: number }>(
    db,
    sql`select coalesce(sum(ci.qty), 0)::int as cards, count(distinct ci.oracle_id)::int as unique,
        coalesce(sum(ci.qty * case when ci.finish = 'nonfoil' then p.eur else coalesce(p.eur_foil, p.eur) end), 0)::float as eur,
        coalesce(sum(ci.qty * case when ci.finish = 'nonfoil' then p.usd else coalesce(p.usd_foil, p.usd) end), 0)::float as usd
      from collection_items ci join printings p on p.id = ci.printing_id where ci.collection_id = ${c.id}`,
  );
  return {
    total: rows.length ? Number(rows[0]!.total) : 0,
    items: rows.map(({ total: _t, ...r }) => r),
    summary: summary!,
  };
}

export async function setCollectionQty(
  db: Db,
  userId: string,
  item: { printingId: string; finish: string; qty: number; condition?: string; language?: string },
  mode: "set" | "add" = "set",
) {
  const c = await getOrCreateCollection(db, userId);
  const [p] = await db
    .select({ oracleId: printings.oracleId })
    .from(printings)
    .where(eq(printings.id, item.printingId));
  if (!p) throw new Error("Unknown printing");
  const condition = item.condition ?? "NM";
  const language = item.language ?? "en";
  const key = and(
    eq(collectionItems.collectionId, c.id),
    eq(collectionItems.printingId, item.printingId),
    eq(collectionItems.finish, item.finish),
    eq(collectionItems.condition, condition),
    eq(collectionItems.language, language),
  );
  if (mode === "set" && item.qty <= 0) {
    await db.delete(collectionItems).where(key);
    return;
  }
  await db
    .insert(collectionItems)
    .values({
      collectionId: c.id,
      printingId: item.printingId,
      oracleId: p.oracleId,
      finish: item.finish,
      qty: item.qty,
      condition,
      language,
    })
    .onConflictDoUpdate({
      target: [
        collectionItems.collectionId,
        collectionItems.printingId,
        collectionItems.finish,
        collectionItems.condition,
        collectionItems.language,
      ],
      set: {
        qty: mode === "add" ? sql`${collectionItems.qty} + ${item.qty}` : item.qty,
        updatedAt: new Date(),
      },
    });
}

/** Deck lines vs. collection: owned and missing quantities, and cost to complete (cheapest printing). */
export async function deckCollectionOverlay(db: Db, userId: string, deckId: string) {
  const c = await getOrCreateCollection(db, userId);
  return query<{
    oracleId: string;
    zone: string;
    need: number;
    owned: number;
    missing: number;
    cheapestEur: number | null;
    cheapestUsd: number | null;
  }>(
    db,
    sql`with need as (
        select dc.oracle_id, dc.zone, dc.qty from deck_cards dc where dc.deck_id = ${deckId}::uuid
      ), owned as (
        select oracle_id, sum(qty)::int as qty from collection_items where collection_id = ${c.id} group by oracle_id
      )
      select n.oracle_id as "oracleId", n.zone, n.qty as need, coalesce(o.qty, 0) as owned,
        greatest(n.qty - coalesce(o.qty, 0), 0) as missing, oc.min_eur as "cheapestEur", oc.min_usd as "cheapestUsd"
      from need n join oracle_cards oc on oc.id = n.oracle_id left join owned o on o.oracle_id = n.oracle_id`,
  );
}

/** Imports parsed collection CSV rows: resolves printings (Scryfall id, set + number, set + name, then name) and adds quantities. */
export async function importCollection(
  db: Db,
  userId: string,
  rows: import("@mtg/mtg/io").CollectionCsvRow[],
  mode: "add" | "replace" = "add",
): Promise<{ imported: number; unresolved: { lineNo: number; name: string }[] }> {
  const c = await getOrCreateCollection(db, userId);
  if (mode === "replace") await db.delete(collectionItems).where(eq(collectionItems.collectionId, c.id));
  let imported = 0;
  const unresolved: { lineNo: number; name: string }[] = [];
  for (const r of rows) {
    const found = await query<{ id: string }>(
      db,
      sql`select p.id from printings p join oracle_cards o on o.id = p.oracle_id
        where (${r.scryfallId}::text is not null and p.id::text = ${r.scryfallId})
           or (lower(o.name) = lower(${r.name}) or lower(split_part(o.name, ' // ', 1)) = lower(${r.name}))
        order by (p.id::text = coalesce(${r.scryfallId}, '')) desc,
                 (p.set_code = coalesce(${r.setCode}, '') and p.collector_number = coalesce(${r.collectorNumber}, '')) desc,
                 (p.set_code = coalesce(${r.setCode}, '')) desc,
                 (p.id = o.default_printing_id) desc
        limit 1`,
    );
    const id = found[0]?.id;
    if (!id) {
      unresolved.push({ lineNo: r.lineNo, name: r.name });
      continue;
    }
    await setCollectionQty(
      db,
      userId,
      { printingId: id, finish: r.finish, qty: r.qty, condition: r.condition, language: r.language },
      "add",
    );
    imported += r.qty;
  }
  return { imported, unresolved };
}
