import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
/** Driver-agnostic database handle (node-postgres in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:5433/postgres";

let cached: { db: Db; pool: pg.Pool } | undefined;

export function createDb(
  url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  max = 10,
): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max });
  const db = drizzle({ client: pool, schema }) as unknown as Db;
  return { db, pool };
}

/** Process-wide singleton for the web app and worker. */
export function getDb(): Db {
  if (!cached) {
    const isPglite = (process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL).includes(":5433/");
    cached = createDb(undefined, isPglite ? 4 : 10);
  }
  return cached.db;
}

export { schema };

/** Runs raw SQL and returns rows; works for both node-postgres and PGlite drivers. */
export async function query<T>(db: Db, q: import("drizzle-orm").SQL): Promise<T[]> {
  const res = (await db.execute(q)) as unknown as { rows: T[] };
  return res.rows;
}
