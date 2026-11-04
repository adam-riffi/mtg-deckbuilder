// Dev-only helper (not a fixture): loads the synthetic test sample into the dev DB for smoke testing.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Db } from "../src/client";
import { ingestCardList } from "../src/ingest";
import * as schema from "../src/schema";
import { SAMPLE, SOL_RING_REPRINT } from "./sample";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5433/postgres",
  max: 1,
});
const db = drizzle({
  client: pool,
  schema,
  logger: { logQuery: (q) => console.log("SQL", q.slice(0, 120)) },
}) as unknown as Db;
console.log(await ingestCardList(db, [...SAMPLE, SOL_RING_REPRINT]));
await pool.end();
