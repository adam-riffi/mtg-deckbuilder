import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client";
import { MIGRATIONS_DIR } from "./migrate";
import * as schema from "./schema";

/** Fresh in-memory database with migrations applied, for tests. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = await PGlite.create({ extensions: { pg_trgm } });
  await client.exec("create extension if not exists pg_trgm");
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db: db as unknown as Db, close: () => client.close() };
}
