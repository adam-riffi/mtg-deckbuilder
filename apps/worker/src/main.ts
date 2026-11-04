import { createDb, DEFAULT_DATABASE_URL, lastSuccessfulRun, runMigrations } from "@mtg/db";
import { PgBoss } from "pg-boss";
import { ingestBulk, ingestFixtures } from "./ingest";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...a);
const QUEUE = "scryfall-ingest";
const { db } = createDb(undefined, 3);
await runMigrations(db);

async function runIngest() {
  try {
    if (process.env.INGEST_SOURCE === "fixtures") log("fixtures", await ingestFixtures(db));
    else log("bulk", await ingestBulk(db));
  } catch (e) {
    log("ingest failed:", e instanceof Error ? e.message : e);
    // Offline fallback: make sure the app has cards to work with.
    if (!(await lastSuccessfulRun(db, "bulk")) && !(await lastSuccessfulRun(db, "fixtures"))) {
      try {
        log("falling back to fixtures", await ingestFixtures(db));
      } catch (e2) {
        log("fixture fallback failed:", e2 instanceof Error ? e2.message : e2);
      }
    }
  }
}

try {
  const boss = new PgBoss(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  boss.on("error", (e: unknown) => log("pg-boss error", e));
  await boss.start();
  await boss.createQueue(QUEUE);
  // Daily at 04:17 UTC (Scryfall regenerates bulk files daily); first run immediately if no data yet.
  await boss.schedule(QUEUE, "17 4 * * *");
  await boss.work(QUEUE, async () => {
    await runIngest();
  });
  if (!(await lastSuccessfulRun(db, "bulk")) && !(await lastSuccessfulRun(db, "fixtures")))
    await boss.send(QUEUE, {});
  log("pg-boss scheduler started");
} catch (e) {
  // PGlite's wire server does not support everything pg-boss needs on every platform; fall back to a timer.
  log("pg-boss unavailable, using in-process timer:", e instanceof Error ? e.message : e);
  if (!(await lastSuccessfulRun(db, "bulk")) && !(await lastSuccessfulRun(db, "fixtures"))) await runIngest();
  setInterval(runIngest, 24 * 60 * 60 * 1000);
}
