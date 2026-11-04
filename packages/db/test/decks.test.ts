import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCardsByNames } from "../src/cards";
import type { Db } from "../src/client";
import {
  applyOps,
  cloneDeck,
  createDeck,
  createVersion,
  getDeck,
  getDeckLines,
  listDecks,
  listEvents,
  redo,
  restoreVersion,
  undo,
} from "../src/decks";
import { ingestCardList } from "../src/ingest";
import { user } from "../src/schema";
import { createTestDb } from "../src/testing";
import { SAMPLE } from "./sample";

let db: Db;
let close: () => Promise<void>;
let ids: Record<string, string>;
const uid = "user-1";

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await ingestCardList(db, SAMPLE);
  await db.insert(user).values({ id: uid, name: "Test", email: "t@example.com" });
  const m = await getCardsByNames(db, ["sol ring", "counterspell", "forest", "test legend of growth"]);
  ids = Object.fromEntries([...m].map(([k, v]) => [k, v.id]));
}, 60_000);
afterAll(async () => close?.());

describe("decks", () => {
  it("ops, history, undo/redo", async () => {
    const d = await createDeck(db, uid, { name: "Simic", format: "commander" });
    await applyOps(db, uid, d.id, [
      { op: "add", oracleId: ids["test legend of growth"]!, qty: 1, zone: "commander" },
    ]);
    await applyOps(db, uid, d.id, [
      { op: "add", oracleId: ids["sol ring"]!, qty: 1, zone: "mainboard", categories: ["Ramp"] },
      { op: "add", oracleId: ids.forest!, qty: 30, zone: "mainboard" },
    ]);
    await applyOps(db, uid, d.id, [{ op: "set_qty", oracleId: ids.forest!, zone: "mainboard", qty: 35 }]);
    expect((await getDeckLines(db, d.id)).find((l) => l.oracleId === ids.forest)?.qty).toBe(35);

    await undo(db, uid, d.id);
    expect((await getDeckLines(db, d.id)).find((l) => l.oracleId === ids.forest)?.qty).toBe(30);
    await undo(db, uid, d.id);
    expect((await getDeckLines(db, d.id)).map((l) => l.zone)).toEqual(["commander"]);
    await redo(db, uid, d.id);
    expect((await getDeckLines(db, d.id)).length).toBe(3);
    await redo(db, uid, d.id);
    expect((await getDeckLines(db, d.id)).find((l) => l.oracleId === ids.forest)?.qty).toBe(35);
    expect(await redo(db, uid, d.id)).toBeNull();

    const events = await listEvents(db, uid, d.id);
    expect(events[0]!.summary).toContain("Redo");
    const full = await getDeck(db, uid, d.id);
    expect(full.entries.find((e) => e.card.name === "Sol Ring")?.categories).toEqual(["Ramp"]);
  });

  it("new edit clears redo", async () => {
    const d = await createDeck(db, uid, { name: "Redo test" });
    await applyOps(db, uid, d.id, [{ op: "add", oracleId: ids["sol ring"]!, qty: 1, zone: "mainboard" }]);
    await undo(db, uid, d.id);
    await applyOps(db, uid, d.id, [{ op: "add", oracleId: ids.counterspell!, qty: 1, zone: "mainboard" }]);
    expect(await redo(db, uid, d.id)).toBeNull();
  });

  it("versions restore and clone", async () => {
    const d = await createDeck(db, uid, { name: "Versioned" });
    await applyOps(db, uid, d.id, [{ op: "add", oracleId: ids["sol ring"]!, qty: 1, zone: "mainboard" }]);
    const v = await createVersion(db, uid, d.id, "v1");
    await applyOps(db, uid, d.id, [
      { op: "remove", oracleId: ids["sol ring"]!, zone: "mainboard" },
      { op: "add", oracleId: ids.counterspell!, qty: 2, zone: "sideboard" },
    ]);
    await restoreVersion(db, uid, d.id, v.id);
    expect((await getDeckLines(db, d.id)).map((l) => l.oracleId)).toEqual([ids["sol ring"]]);
    await undo(db, uid, d.id);
    expect((await getDeckLines(db, d.id)).map((l) => l.oracleId)).toEqual([ids.counterspell]);
    const c = await cloneDeck(db, uid, d.id);
    expect((await getDeckLines(db, c.id)).length).toBe(1);
  });

  it("rejects unknown cards and other users", async () => {
    const d = await createDeck(db, uid, { name: "X" });
    await expect(
      applyOps(db, uid, d.id, [
        { op: "add", oracleId: "00000000-0000-4000-8000-999999999999", qty: 1, zone: "mainboard" },
      ]),
    ).rejects.toThrow("Unknown card");
    await expect(getDeck(db, "someone-else", d.id)).rejects.toThrow("Deck not found");
  });

  it("lists decks with counts and commanders", async () => {
    const rows = await listDecks(db, uid);
    const simic = rows.find((r) => r.deck.name === "Simic")!;
    expect(simic.count).toBe(37);
    expect(simic.commanders).toEqual(["Test Legend of Growth"]);
    expect(simic.identity).toBe(18);
  });
});
