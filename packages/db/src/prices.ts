import { asc, eq, sql } from "drizzle-orm";
import { type Db, query } from "./client";
import { priceSnapshots } from "./schema";

export async function printingPriceHistory(db: Db, printingId: string) {
  const rows = await db
    .select()
    .from(priceSnapshots)
    .where(eq(priceSnapshots.printingId, printingId))
    .orderBy(asc(priceSnapshots.day));
  return rows.map((r) => ({ day: r.day, usd: r.usd, eur: r.eur, usdFoil: r.usdFoil, eurFoil: r.eurFoil }));
}

/**
 * Deck value per day: sum over mainboard/commander lines of qty × that day's price for the line's
 * printing (or the card's default printing), honouring the finish.
 */
export async function deckPriceHistory(db: Db, deckId: string) {
  return query<{ day: string; eur: number | null; usd: number | null }>(
    db,
    sql`select ps.day::text as day,
        sum(dc.qty * case when dc.finish = 'nonfoil' then coalesce(ps.eur, ps.eur_foil) else coalesce(ps.eur_foil, ps.eur) end)::float as eur,
        sum(dc.qty * case when dc.finish = 'nonfoil' then coalesce(ps.usd, ps.usd_foil) else coalesce(ps.usd_foil, ps.usd) end)::float as usd
      from deck_cards dc
      join oracle_cards o on o.id = dc.oracle_id
      join price_snapshots ps on ps.printing_id = coalesce(dc.printing_id, o.default_printing_id)
      where dc.deck_id = ${deckId}::uuid and dc.zone in ('mainboard', 'commander')
      group by ps.day order by ps.day`,
  );
}
