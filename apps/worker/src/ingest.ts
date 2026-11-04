import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Db,
  finishRun,
  type IngestCounts,
  ingestCardList,
  lastSuccessfulRun,
  refreshOracleAggregates,
  snapshotPrices,
  startRun,
  upsertRulings,
  upsertScryfallBatch,
  upsertTags,
} from "@mtg/db";
import { streamJsonArray } from "./json-stream";
import { type BulkItem, downloadBulk, listBulkData } from "./scryfall";

const BATCH = 500;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[ingest]", ...a);

async function processStream(
  stream: AsyncIterable<Uint8Array>,
  onBatch: (rows: unknown[]) => Promise<void>,
): Promise<number> {
  let batch: unknown[] = [];
  let n = 0;
  for await (const row of streamJsonArray(stream)) {
    batch.push(row);
    n++;
    if (batch.length >= BATCH) {
      await onBatch(batch);
      batch = [];
      if (n % 20_000 === 0) log(`… ${n} rows`);
    }
  }
  if (batch.length) await onBatch(batch);
  return n;
}

/**
 * Daily ingest: oracle cards (canonical oracle data + default printing), default cards (all printings),
 * rulings, and oracle tags if Scryfall publishes a bulk file for them. Skips files unchanged since the last run.
 */
export async function ingestBulk(db: Db, opts: { force?: boolean } = {}): Promise<Record<string, number>> {
  const items = await listBulkData();
  const by = (t: string) => items.find((i) => i.type === t);
  const counts: Record<string, number> = {};
  const oracle = by("oracle_cards");
  const defaults = by("default_cards");
  const rulingsItem = by("rulings");
  const tagItem = items.find((i) => /tag/i.test(i.type));
  const prev = await lastSuccessfulRun(db, "bulk");
  const newest = [oracle, defaults].filter(Boolean).map((i) => new Date(i!.updated_at).getTime());
  const sourceUpdatedAt = newest.length ? new Date(Math.max(...newest)) : null;
  if (
    !opts.force &&
    prev?.sourceUpdatedAt &&
    sourceUpdatedAt &&
    prev.sourceUpdatedAt.getTime() >= sourceUpdatedAt.getTime()
  ) {
    log("Bulk data unchanged since last ingest; snapshotting prices only.");
    return { prices: await snapshotPrices(db) };
  }
  const runId = await startRun(db, "bulk", "scryfall", sourceUpdatedAt);
  try {
    const c: IngestCounts = { oracle: 0, printings: 0, skipped: 0, invalid: 0 };
    if (oracle) {
      log("oracle_cards", oracle.updated_at);
      counts.oracleRows = await processStream(await downloadBulk(oracle), (rows) =>
        upsertScryfallBatch(db, rows, "oracle", c),
      );
    }
    if (defaults) {
      log("default_cards", defaults.updated_at);
      counts.printingRows = await processStream(await downloadBulk(defaults), (rows) =>
        upsertScryfallBatch(db, rows, "printings", c),
      );
    }
    await refreshOracleAggregates(db);
    if (rulingsItem) {
      log("rulings", rulingsItem.updated_at);
      let n = 0;
      await processStream(await downloadBulk(rulingsItem), async (rows) => {
        n += await upsertRulings(db, rows);
      });
      counts.rulings = n;
    }
    if (tagItem) counts.tags = await ingestTagBulk(db, tagItem);
    counts.prices = await snapshotPrices(db);
    Object.assign(counts, c);
    await finishRun(db, runId, "succeeded", counts);
    log("done", counts);
    return counts;
  } catch (e) {
    await finishRun(db, runId, "failed", counts, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** Oracle tag bulk files are not a documented Scryfall format; accept {oracle_id, tags|label} objects defensively. */
async function ingestTagBulk(db: Db, item: BulkItem): Promise<number> {
  log("tags", item.type);
  let n = 0;
  await processStream(await downloadBulk(item), async (rows) => {
    const items: { oracleId: string; tags: string[] }[] = [];
    for (const r of rows as Record<string, unknown>[]) {
      const oracleId = typeof r.oracle_id === "string" ? r.oracle_id : null;
      const tags = Array.isArray(r.tags)
        ? r.tags.filter((t): t is string => typeof t === "string")
        : typeof r.label === "string"
          ? [r.label]
          : [];
      if (oracleId && tags.length) items.push({ oracleId, tags });
    }
    if (items.length) await upsertTags(db, items);
    n += items.length;
  });
  return n;
}

export const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

/** Loads fixtures/cards.json (+ rulings.json, tags.json if present) into the database. */
export async function ingestFixtures(db: Db): Promise<Record<string, number>> {
  const file = path.join(FIXTURES_DIR, "cards.json");
  if (!fs.existsSync(file))
    throw new Error(`No fixture dataset at ${file}. Run \`pnpm fixtures:build\` with Scryfall access.`);
  const read = (f: string) =>
    fs.existsSync(path.join(FIXTURES_DIR, f))
      ? JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), "utf8"))
      : [];
  const cards = read("cards.json") as unknown[];
  const runId = await startRun(db, "fixtures", "fixtures");
  const counts = await ingestCardList(db, cards, { rulings: read("rulings.json"), tags: read("tags.json") });
  await finishRun(db, runId, "succeeded", { ...counts });
  return { ...counts };
}
