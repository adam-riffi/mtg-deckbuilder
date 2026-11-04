import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

/** Creates required extensions, then applies Drizzle migrations. */
export async function runMigrations(db: Db): Promise<void> {
  await db.execute(sql`create extension if not exists pg_trgm`);
  // biome-ignore lint/suspicious/noExplicitAny: migrator accepts any node-postgres drizzle instance
  await migratePg(db as any, { migrationsFolder: MIGRATIONS_DIR });
}
