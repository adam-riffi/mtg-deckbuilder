import { parseDecklist } from "@mtg/mtg/io";
import { matchQuery, parseSearch } from "@mtg/mtg/search";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  autocomplete,
  getCardDetail,
  getCardsByIds,
  getCardsByNames,
  getPrintingsFor,
  resolveLines,
  searchCards,
} from "../src/cards";
import type { Db } from "../src/client";
import { ingestCardList, lastSuccessfulRun } from "../src/ingest";
import { createTestDb } from "../src/testing";
import { SAMPLE, SOL_RING_REPRINT } from "./sample";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await ingestCardList(db, [...SAMPLE, SOL_RING_REPRINT]);
  // Idempotent: a second ingest changes nothing.
  await ingestCardList(db, [...SAMPLE, SOL_RING_REPRINT]);
}, 60_000);
afterAll(async () => close?.());

describe("ingest", () => {
  it("stores one oracle row per card and all printings", async () => {
    const r = await searchCards(db, "include:extras game:arena or game:paper", { limit: 100 });
    expect(r.total).toBe(SAMPLE.length);
    const [sol] = (await getCardsByNames(db, ["sol ring"])).values();
    expect((await getPrintingsFor(db, sol!.id)).length).toBe(2);
    expect(sol!.minUsd).toBe(0.8);
    expect(sol!.gameChanger).toBe(true);
  });
  it("handles split and transform cards", async () => {
    const names = await getCardsByNames(db, ["fire", "test werewolf // test night wolf"]);
    expect(names.get("fire")?.name).toBe("Fire // Ice");
    const wolf = names.get("test werewolf // test night wolf")!;
    expect(wolf.colors).toEqual(["G"]);
    expect(wolf.manaCost).toBe("{1}{G}");
    expect(wolf.faces).toHaveLength(2);
  });
  it("records nothing in ingest_runs for list ingests", async () => {
    expect(await lastSuccessfulRun(db, "bulk")).toBeNull();
  });
});

const QUERIES = [
  "sol",
  "t:instant",
  "c:u",
  "c=u",
  "id<=g",
  "id:simic -t:land",
  "c:m",
  "c:c",
  "c=2",
  "mv>=2",
  "mv=1 or t:land",
  "pow>=2",
  "pow<tou",
  "o:draw",
  'o:"~ deals 3"',
  "fo:add t:land",
  "o:add t:land",
  "is:commander",
  "is:dfc",
  "is:split",
  "is:spell",
  "is:permanent",
  "is:reserved",
  "is:gamechanger",
  "f:commander",
  "banned:commander",
  "usd<1",
  "eur>=5",
  "r:mythic",
  "r>=rare",
  "set:rep",
  "a:another",
  "year>=2024",
  "m:uu",
  "m:1g",
  "produces:g",
  "name:/^l/",
  "!fire",
  "(c:r or c:g) -t:creature",
  "is:token",
  "-is:token",
  "is:digital",
];

describe("search parity (SQL vs in-memory)", () => {
  it.each(QUERIES)("%s", async (q) => {
    const r = await searchCards(db, q, { limit: 100 });
    const all = await searchCards(db, "include:extras is:digital or -is:digital", { limit: 100 });
    const cards = await getCardsByIds(
      db,
      all.hits.map((h) => h.card.id),
    );
    const expected: string[] = [];
    for (const c of cards) {
      const prints = await getPrintingsFor(db, c.id);
      if (matchQuery(parseSearch(q), c, prints)) expected.push(c.name);
    }
    expect(r.hits.map((h) => h.card.name).sort()).toEqual(expected.sort());
  });

  it("orders by price", async () => {
    const r = await searchCards(db, "-t:land order:usd dir:desc");
    expect(r.hits[0]!.card.name).toBe("Test Legend of Growth");
  });
});

describe("autocomplete and detail", () => {
  it("prefix and fuzzy", async () => {
    expect((await autocomplete(db, "sol")).map((x) => x.name)[0]).toBe("Sol Ring");
    expect((await autocomplete(db, "lightnin bolt")).map((x) => x.name)).toContain("Lightning Bolt");
  });
  it("card detail includes printings", async () => {
    const [sol] = (await getCardsByNames(db, ["sol ring"])).values();
    const d = await getCardDetail(db, sol!.id);
    expect(d?.printings.map((p) => p.setCode).sort()).toEqual(["rep", "tst"]);
  });
});

describe("import resolution", () => {
  it("resolves names, set codes and reports unknown lines with suggestions", async () => {
    const parsed = parseDecklist("1 Sol Ring (REP) 99\n1 Counterspel\n1 Fire // Ice");
    const res = await resolveLines(db, parsed.lines);
    expect(res[0]!.printing?.setCode).toBe("rep");
    expect(res[1]!.card).toBeNull();
    expect(res[1]!.suggestions).toContain("Counterspell");
    expect(res[2]!.card?.name).toBe("Fire // Ice");
  });
});
