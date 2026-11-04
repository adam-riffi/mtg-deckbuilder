#!/usr/bin/env node
/**
 * `pnpm dev`: starts the database (embedded PGlite if nothing is listening on DATABASE_URL),
 * applies migrations, then runs the web app and the worker with prefixed logs.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5433/postgres";
const url = new URL(process.env.DATABASE_URL);
const port = Number(url.port || 5432);
const host = url.hostname;

const children = [];
const colors = { db: 35, migrate: 36, web: 32, worker: 33 };
function run(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"], ...opts });
  const prefix = `\x1b[${colors[name] ?? 37}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const l of lines) out.write(`${prefix + l}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  children.push(child);
  return child;
}

const isOpen = () =>
  new Promise((resolve) => {
    const s = net.connect({ port, host }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });

async function waitForPort(ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await isOpen()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const exited = (child) => new Promise((resolve) => child.on("exit", resolve));

if (!(await isOpen())) {
  if (port !== 5433) {
    console.error(
      `Nothing is listening on ${host}:${port}. Start Postgres (docker compose up -d) or unset DATABASE_URL to use embedded PGlite.`,
    );
    process.exit(1);
  }
  run("db", "pnpm", ["--filter", "@mtg/db", "pglite"]);
  if (!(await waitForPort())) {
    console.error("Embedded database did not start.");
    process.exit(1);
  }
}

const code = await exited(run("migrate", "pnpm", ["--filter", "@mtg/db", "migrate"]));
if (code !== 0) {
  console.error("Migrations failed.");
  for (const c of children) c.kill("SIGTERM");
  process.exit(1);
}

run("web", "pnpm", ["--filter", "@mtg/web", "dev"]);
run("worker", "pnpm", ["--filter", "@mtg/worker", "dev"]);

const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
