import { createDb } from "./client";
import { runMigrations } from "./migrate";

const { db, pool } = createDb(undefined, 1);
try {
  await runMigrations(db);
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
