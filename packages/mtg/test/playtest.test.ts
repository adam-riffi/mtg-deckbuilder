import { describe, expect, it } from "vitest";
import { newGame, playtestReducer as r, shuffle } from "../src/playtest";

const lib = Array.from({ length: 60 }, (_, i) => ({
  uid: `c${i}`,
  cardId: `id${i}`,
  name: `Card ${i}`,
  image: null,
  backImage: null,
}));

describe("playtest", () => {
  it("shuffle is deterministic and a permutation", () => {
    const a = shuffle(lib, 42);
    expect(shuffle(lib, 42)).toEqual(a);
    expect([...a].sort((x, y) => x.uid.localeCompare(y.uid))).toEqual(
      [...lib].sort((x, y) => x.uid.localeCompare(y.uid)),
    );
  });
  it("starts with 7 in hand and draws", () => {
    let s = newGame(lib, [], { seed: 1 });
    expect(s.zones.hand).toHaveLength(7);
    expect(s.zones.library).toHaveLength(53);
    s = r(s, { t: "draw", n: 2 });
    expect(s.zones.hand).toHaveLength(9);
  });
  it("London mulligan: draw 7, bottom N", () => {
    let s = newGame(lib, [], { seed: 1 });
    s = r(s, { t: "mulligan" });
    s = r(s, { t: "mulligan" });
    expect(s.zones.hand).toHaveLength(7);
    expect(s.toBottom).toBe(2);
    const [a, b] = s.zones.hand;
    s = r(s, { t: "bottom", uid: a!.uid });
    s = r(s, { t: "bottom", uid: b!.uid });
    expect(s.zones.hand).toHaveLength(5);
    expect(s.zones.library.at(-1)!.uid).toBe(b!.uid);
    expect(s.toBottom).toBe(0);
  });
  it("move, tap, counters, tokens, turns", () => {
    let s = newGame(lib, [], { seed: 3 });
    const c = s.zones.hand[0]!;
    s = r(s, { t: "move", uid: c.uid, to: "battlefield" });
    s = r(s, { t: "tap", uid: c.uid });
    s = r(s, { t: "counter", uid: c.uid, kind: "+1/+1", delta: 2 });
    expect(s.zones.battlefield[0]).toMatchObject({ tapped: true, counters: { "+1/+1": 2 } });
    s = r(s, { t: "next_turn" });
    expect(s.zones.battlefield[0]!.tapped).toBe(false);
    expect(s.turn).toBe(2);
    s = r(s, { t: "token", name: "Treasure" });
    const tok = s.zones.battlefield.at(-1)!;
    s = r(s, { t: "move", uid: tok.uid, to: "graveyard" });
    expect(s.zones.graveyard.some((x) => x.uid === tok.uid)).toBe(false);
    s = r(s, { t: "move", uid: c.uid, to: "graveyard" });
    expect(s.zones.graveyard[0]!.counters).toEqual({});
  });
  it("scry reorders the top of the library", () => {
    let s = newGame(lib, [], { seed: 5 });
    const [a, b] = s.zones.library;
    s = r(s, { t: "scry_resolve", top: [b!.uid], bottom: [a!.uid] });
    expect(s.zones.library[0]!.uid).toBe(b!.uid);
    expect(s.zones.library.at(-1)!.uid).toBe(a!.uid);
  });
  it("does not mutate the previous state", () => {
    const s = newGame(lib, [], { seed: 9 });
    const before = JSON.stringify(s);
    r(s, { t: "draw" });
    expect(JSON.stringify(s)).toBe(before);
  });
});
