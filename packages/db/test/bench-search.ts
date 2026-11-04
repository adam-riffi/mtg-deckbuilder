/**
 * Search benchmark on a SYNTHETIC dataset (names like "Synth Card 1234"; not real cards).
 * Usage: pnpm --filter @mtg/db exec tsx test/bench-search.ts [oracleCount]
 * Loads N oracle cards (~3 printings each) through the ingest upsert path, vacuums, then times searches and prints plans.
 */
import { sql } from "drizzle-orm";
import { autocomplete, searchCards } from "../src/cards";
import { query } from "../src/client";
import {
  type IngestCounts,
  refreshOracleAggregates,
  snapshotPrices,
  upsertScryfallBatch,
} from "../src/ingest";
import { createTestDb } from "../src/testing";

const N = Number(process.argv[2] ?? 20000);
const rand = (() => {
  let s = 12345;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s / 4294967296;
  };
})();
const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;
const TYPES = [
  "Creature — Elf Druid",
  "Creature — Human Wizard",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment — Aura",
  "Legendary Creature — Dragon",
  "Land",
  "Basic Land — Forest",
  "Planeswalker — Synth",
  "Artifact Creature — Golem",
  "Legendary Artifact",
];
const TEXTS = [
  "Draw a card.",
  "Destroy target creature.",
  "{T}: Add {G}.",
  "Counter target spell.",
  "Flying",
  "When this enters, draw two cards.",
  "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
  "Exile target permanent.",
  "Trample, haste",
  "Destroy all creatures.",
  "Target creature gets +2/+2 until end of turn.",
  "You gain 3 life.",
];
const COLORS = [[], ["W"], ["U"], ["B"], ["R"], ["G"], ["U", "G"], ["W", "B"], ["R", "G", "W"]];
const SETS = ["aaa", "bbb", "ccc", "ddd", "eee", "fff", "ggg"];
const RAR = ["common", "common", "uncommon", "rare", "mythic"];
const hex = (n: number, len: number) => n.toString(16).padStart(len, "0");

function card(i: number, p: number) {
  const colors = pick(COLORS);
  const type = pick(TYPES);
  const cmc = type.includes("Land") ? 0 : Math.floor(rand() * 7);
  const cost = type.includes("Land") ? "" : `{${cmc}}${colors.map((c) => `{${c}}`).join("")}`;
  return {
    object: "card",
    id: `${hex(i, 8)}-0000-4000-8000-${hex(p, 12)}`,
    oracle_id: `${hex(i, 8)}-1111-4111-8111-000000000000`,
    name: `Synth ${pick(["Elf", "Wyrm", "Golem", "Angel", "Sphinx", "Bolt", "Ring", "Tower"])} ${i}`,
    lang: "en",
    layout: "normal",
    released_at: `20${10 + (i % 15)}-01-0${1 + (p % 9)}`,
    mana_cost: cost,
    cmc,
    type_line: type,
    oracle_text: `${pick(TEXTS)}${rand() < 0.3 ? `\n${pick(TEXTS)}` : ""}`,
    colors,
    color_identity: colors,
    keywords: rand() < 0.3 ? ["Flying"] : [],
    legalities: {
      commander: rand() < 0.95 ? "legal" : "banned",
      modern: rand() < 0.6 ? "legal" : "not_legal",
      standard: rand() < 0.2 ? "legal" : "not_legal",
    },
    games: ["paper", "mtgo"],
    reserved: false,
    game_changer: rand() < 0.01,
    set: SETS[p % SETS.length],
    set_name: "Synthetic Set",
    collector_number: String(i),
    rarity: pick(RAR),
    artist: `Artist ${i % 500}`,
    image_uris: { normal: `https://example.invalid/${i}.jpg` },
    finishes: ["nonfoil", "foil"],
    prices: { usd: (rand() * 20).toFixed(2), eur: (rand() * 18).toFixed(2) },
    power: type.includes("Creature") ? String(1 + (i % 5)) : undefined,
    toughness: type.includes("Creature") ? String(1 + (i % 4)) : undefined,
  };
}

const { db, close } = await createTestDb();
const t0 = performance.now();
const counts: IngestCounts = { oracle: 0, printings: 0, skipped: 0, invalid: 0 };
let batch: unknown[] = [];
let printings = 0;
for (let i = 0; i < N; i++) {
  const n = 1 + (i % 5);
  for (let p = 0; p < n; p++) batch.push(card(i, p));
  printings += n;
  if (batch.length >= 2000) {
    await upsertScryfallBatch(db, batch, "both", counts);
    batch = [];
  }
}
if (batch.length) await upsertScryfallBatch(db, batch, "both", counts);
await refreshOracleAggregates(db);
await snapshotPrices(db);
console.log(
  `Loaded ${N} oracle cards / ${printings} printings in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
);
// The real ingest runs aggregates once; vacuum removes dead tuples so plans reflect a healthy table.
await db.execute(sql`vacuum (full, analyze) oracle_cards`);
await db.execute(sql`vacuum (full, analyze) printings`);

const QUERIES = [
  "t:creature c:g mv<=3",
  'o:"draw a card"',
  "synth elf",
  "id<=simic",
  "f:commander r:mythic",
  "is:commander",
  "t:instant order:usd dir:desc",
  "c:m -t:land pow>=3",
  "s:aaa",
  "a:artist 42",
  "is:gc",
  "wyrm 12",
];
for (const q of QUERIES) {
  const times: number[] = [];
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const r = await searchCards(db, q, { limit: 60 });
    times.push(r.tookMs);
    total = r.total;
  }
  times.shift();
  console.log(
    `${q.padEnd(36)} total=${String(total).padStart(6)}  median=${times.sort((a, b) => a - b)[1]}ms  (${times.join("/")})`,
  );
}
const ta = performance.now();
const ac = await autocomplete(db, "synth wy", 10);
console.log(`autocomplete('synth wy') -> ${ac.length} in ${Math.round(performance.now() - ta)}ms`);

for (const q of ["t:creature c:g mv<=3", 'o:"draw a card"', "synth elf"]) {
  const { parseSearch } = await import("@mtg/mtg/search");
  const { compileWhere, compileOrder } = await import("../src/search");
  const parsed = parseSearch(q);
  const rows = await query<{ "QUERY PLAN": string }>(
    db,
    sql`explain (analyze, costs off) select o.id, count(*) over() as total from oracle_cards o where ${compileWhere(parsed)} order by ${compileOrder(parsed)} limit 60`,
  );
  console.log(`\nPLAN ${q}\n${rows.map((r) => r["QUERY PLAN"]).join("\n")}`);
}
await close();
