import { describe, expect, it } from "vitest";
import { estimateBracket } from "../src/brackets";
import { suggestCategories } from "../src/categories";
import { colorIdentityLabel, colorMask, parseColorQuery } from "../src/colors";
import { canPair } from "../src/commander";
import { diffDecks } from "../src/diff";
import { drawChance, hypergeometricAtLeast, hypergeometricPmf } from "../src/hypergeometric";
import { validateDeck } from "../src/legality";
import { countPips, manaValue, parseManaCost } from "../src/mana";
import { computeStats } from "../src/stats";
import { parseTypeLine, primaryType } from "../src/types";
import {
  card,
  commanderGU,
  counterspell,
  entry,
  forest,
  island,
  lightningBolt,
  llanowar,
  solRing,
} from "./helpers";

describe("colours and mana", () => {
  it("masks and named combos", () => {
    expect(colorMask(["W", "U"])).toBe(3);
    expect(parseColorQuery("esper")).toEqual({ kind: "colors", mask: colorMask(["W", "U", "B"]) });
    expect(parseColorQuery("x")).toBeNull();
    expect(colorIdentityLabel(["U", "G"])).toBe("Simic (UG)");
  });
  it("mana value and pips", () => {
    expect(parseManaCost("{2}{W/U}{B/P}")).toEqual(["2", "W/U", "B/P"]);
    expect(manaValue("{2/W}{2/W}")).toBe(4);
    expect(manaValue("{X}{R}{R}")).toBe(2);
    expect(countPips("{W/U}{U}")).toMatchObject({ W: 1, U: 2 });
  });
  it("type lines", () => {
    expect(parseTypeLine("Legendary Artifact Creature — Golem")).toEqual({
      supertypes: ["Legendary"],
      types: ["Artifact", "Creature"],
      subtypes: ["Golem"],
    });
    expect(primaryType("Artifact Creature — Golem")).toBe("Creature");
    expect(primaryType("Artifact Land")).toBe("Artifact");
    expect(primaryType("Land")).toBe("Land");
  });
});

describe("hypergeometric", () => {
  it("pmf sums to 1", () => {
    let s = 0;
    for (let k = 0; k <= 7; k++) s += hypergeometricPmf(60, 24, 7, k);
    expect(s).toBeCloseTo(1, 10);
  });
  it("known value: P(≥1 of 4 in 7 from 60) ≈ 0.3995", () => {
    expect(hypergeometricAtLeast(60, 4, 7, 1)).toBeCloseTo(0.3995, 3);
  });
  it("draw chance by turn on the play", () => {
    // 10 ramp in 99, turn 3 on the play: 9 cards seen.
    expect(drawChance({ deckSize: 99, hits: 10, turn: 3 })).toBeCloseTo(
      hypergeometricAtLeast(99, 10, 9, 1),
      12,
    );
  });
});

function commanderDeck(extra: ReturnType<typeof entry>[] = []) {
  return [
    entry(commanderGU, 1, "commander"),
    entry(solRing),
    entry(counterspell),
    entry(llanowar),
    entry(forest, 50),
    entry(island, 46),
    ...extra,
  ];
}

describe("legality", () => {
  it("a 100-card Simic deck is legal", () => {
    const r = validateDeck(commanderDeck(), "commander");
    expect(r.issues).toEqual([]);
    expect(r.legal).toBe(true);
  });
  it("flags colour identity, copies, size and bans", () => {
    const banned = card({ name: "Bad Card", legalities: { commander: "banned" } });
    const r = validateDeck(
      [...commanderDeck([entry(lightningBolt), entry(banned)]), entry(solRing, 1, "mainboard")],
      "commander",
    );
    const codes = r.issues.map((i) => i.code).sort();
    expect(codes).toEqual(["banned", "color_identity", "copies", "deck_size"]);
  });
  it("requires a valid commander", () => {
    const r = validateDeck([entry(solRing, 1, "commander"), entry(forest, 99)], "commander");
    expect(r.issues.map((i) => i.code)).toContain("invalid_commander");
  });
  it("60-card format: 4-of limit and basics exempt", () => {
    const r = validateDeck([entry(lightningBolt, 5), entry(forest, 55)], "modern");
    expect(r.issues.map((i) => i.code)).toEqual(["copies"]);
  });
  it("vintage restricted list", () => {
    const restricted = card({ name: "Restricted", legalities: { vintage: "restricted" } });
    const r = validateDeck([entry(restricted, 2), entry(forest, 58)], "vintage");
    expect(r.issues.map((i) => i.code)).toEqual(["restricted"]);
  });
  it("any-number cards", () => {
    const rats = card({
      name: "Relentless Test Rats",
      oracleText: "A deck can have any number of cards named Relentless Test Rats.",
    });
    expect(validateDeck([entry(rats, 30), entry(forest, 30)], "modern").legal).toBe(true);
  });
});

describe("partners", () => {
  const p1 = card({
    name: "A",
    typeLine: "Legendary Creature — Human",
    keywords: ["Partner"],
    oracleText: "Partner",
  });
  const p2 = card({
    name: "B",
    typeLine: "Legendary Creature — Elf",
    keywords: ["Partner"],
    oracleText: "Partner",
  });
  const pw = card({
    name: "C",
    typeLine: "Legendary Creature — Elf",
    keywords: ["Partner with"],
    oracleText: "Partner with D (When this enters…)",
  });
  const pd = card({
    name: "D",
    typeLine: "Legendary Creature — Elf",
    keywords: ["Partner with"],
    oracleText: "Partner with C (When this enters…)",
  });
  const chooser = card({
    name: "E",
    typeLine: "Legendary Creature — Human",
    oracleText: "Choose a Background (You can have a Background as a second commander.)",
  });
  const bg = card({
    name: "F",
    typeLine: "Legendary Enchantment — Background",
    oracleText: "Commander creatures you own have flying.",
  });
  it("pairs correctly", () => {
    expect(canPair(p1, p2).ok).toBe(true);
    expect(canPair(pw, pd).ok).toBe(true);
    expect(canPair(pw, p1).ok).toBe(false);
    expect(canPair(chooser, bg).ok).toBe(true);
    expect(canPair(chooser, p1).ok).toBe(false);
  });
});

describe("brackets", () => {
  it("counts game changers and explains", () => {
    const gcs = ["G1", "G2", "G3", "G4"].map((n) => card({ name: n, gameChanger: true }));
    expect(estimateBracket(commanderDeck()).bracket).toBe(1);
    expect(estimateBracket(commanderDeck(gcs.slice(0, 2).map((c) => entry(c)))).bracket).toBe(3);
    const b4 = estimateBracket(commanderDeck(gcs.map((c) => entry(c))));
    expect(b4.bracket).toBe(4);
    expect(b4.reasons.join(" ")).toContain("Game Changers 4 > 3");
  });
  it("detects mass land denial", () => {
    const arm = card({ name: "Test Geddon", oracleText: "Destroy all lands." });
    expect(estimateBracket(commanderDeck([entry(arm)])).bracket).toBe(4);
  });
});

describe("stats", () => {
  it("curve, lands, pips and sources", () => {
    const s = computeStats(commanderDeck(), { format: "commander", currency: "usd" });
    expect(s.totalCards).toBe(100);
    expect(s.landCount).toBe(96);
    expect(s.curve[1]!.total).toBe(2);
    expect(s.pips.U).toBe(3);
    expect(s.sources.G).toBe(51);
    expect(s.averageMv).toBeCloseTo((3 + 1 + 2 + 1) / 4);
    expect(s.price.total).toBe(100);
  });
});

describe("categories", () => {
  it("prefers tags, falls back to text", () => {
    expect(suggestCategories(solRing)).toContain("Ramp");
    expect(suggestCategories(counterspell)).toEqual(["Counterspell"]);
    expect(suggestCategories(lightningBolt)).toEqual(["Removal"]);
    expect(suggestCategories(forest)).toEqual(["Land"]);
  });
});

describe("diff", () => {
  it("added, removed and changed", () => {
    const d = diffDecks(
      [
        { cardId: "a", qty: 1, zone: "mainboard" },
        { cardId: "b", qty: 2, zone: "mainboard" },
      ],
      [
        { cardId: "b", qty: 3, zone: "mainboard" },
        { cardId: "c", qty: 1, zone: "sideboard" },
      ],
    );
    expect(d.added).toEqual([{ cardId: "c", zone: "sideboard", qty: 1 }]);
    expect(d.removed).toEqual([{ cardId: "a", zone: "mainboard", qty: 1 }]);
    expect(d.changed).toEqual([{ cardId: "b", zone: "mainboard", from: 2, to: 3 }]);
  });
});
