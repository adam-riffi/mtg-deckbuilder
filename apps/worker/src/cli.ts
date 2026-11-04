import { createDb, runMigrations } from "@mtg/db";
import { ingestBulk, ingestFixtures } from "./ingest";

const cmd = process.argv[2] ?? "bulk";
const { db, pool } = createDb(undefined, 2);
try {
  await runMigrations(db);
  const counts =
    cmd === "fixtures"
      ? await ingestFixtures(db)
      : await ingestBulk(db, { force: process.argv.includes("--force") });
  console.log(counts);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
