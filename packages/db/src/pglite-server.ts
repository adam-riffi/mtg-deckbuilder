/**
 * Embedded Postgres for machines without Docker: PGlite (Postgres compiled to WASM)
 * exposed over the Postgres wire protocol, so the web app, worker and drizzle-kit
 * all connect with a normal DATABASE_URL. Data persists in .data/pglite.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(root, ".data/pglite");
const port = Number(process.env.PGLITE_PORT ?? 5433);
fs.mkdirSync(dataDir, { recursive: true });

const db = await PGlite.create({ dataDir, extensions: { pg_trgm } });
await db.exec("create extension if not exists pg_trgm");
const server = new PGLiteSocketServer({
  db,
  port,
  host: "127.0.0.1",
  maxConnections: 16,
} as ConstructorParameters<typeof PGLiteSocketServer>[0]);
await server.start();
console.log(`PGlite listening on postgres://postgres:postgres@127.0.0.1:${port}/postgres (data: ${dataDir})`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
