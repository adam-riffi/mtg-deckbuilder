import { describe, expect, it } from "vitest";
import { exportDeck, parseDecklist, parseLine } from "../src/io";
import { commanderGU, entry, solRing } from "./helpers";

describe("import", () => {
  it("parses common line shapes", () => {
    expect(parseLine("1x Sol Ring (C21) 263 *F*", 1, "mainboard")).toMatchObject({
      qty: 1,
      name: "Sol Ring",
      setCode: "c21",
      collectorNumber: "263",
      finish: "foil",
    });
    expect(parseLine("4 Lightning Bolt", 1, "mainboard")).toMatchObject({
      qty: 4,
      name: "Lightning Bolt",
      setCode: null,
    });
    expect(parseLine("Sol Ring", 1, "mainboard")).toMatchObject({ qty: 1, name: "Sol Ring" });
    expect(parseLine("1x Sol Ring (c21) 263 [Ramp,Artifact{noDeck}]", 1, "mainboard")).toMatchObject({
      categories: ["Ramp", "Artifact"],
    });
    expect(parseLine("1x Atraxa (one) 1 [Commander{top}]", 1, "mainboard")).toMatchObject({
      zone: "commander",
    });
    expect(parseLine("1 Fire // Ice", 1, "mainboard")).toMatchObject({ name: "Fire // Ice" });
    expect(parseLine("SB: 2 Duress", 1, "mainboard")).toMatchObject({ zone: "sideboard", qty: 2 });
  });
  it("Arena sections", () => {
    const r = parseDecklist(
      "Commander\n1 Test Legend (ABC) 1\n\nDeck\n1 Sol Ring (C21) 263\n\nSideboard\n1 Duress",
    );
    expect(r.lines.map((l) => l.zone)).toEqual(["commander", "mainboard", "sideboard"]);
  });
  it("MTGO blank-line sideboard", () => {
    const r = parseDecklist("4 Lightning Bolt\n56 Mountain\n\n2 Smash");
    expect(r.lines.map((l) => l.zone)).toEqual(["mainboard", "mainboard", "sideboard"]);
  });
  it("CSV with Moxfield-like headers", () => {
    const r = parseDecklist(
      'Count,Name,Edition,Foil,Collector Number\n1,"Sol Ring",c21,foil,263\n2,Island,,,\n',
    );
    expect(r.format).toBe("csv");
    expect(r.lines).toMatchObject([
      { qty: 1, name: "Sol Ring", setCode: "c21", finish: "foil", collectorNumber: "263" },
      { qty: 2, name: "Island", setCode: null },
    ]);
  });
  it("reports bad lines", () => {
    const r = parseDecklist("0 Sol Ring");
    expect(r.errors).toHaveLength(1);
  });
});

describe("export", () => {
  const deck = [entry(commanderGU, 1, "commander"), entry(solRing, 1, "mainboard", ["Ramp"])];
  it("round-trips text and archidekt", () => {
    for (const f of ["text", "arena", "moxfield", "archidekt", "csv"] as const) {
      const out = exportDeck(deck, f);
      const back = parseDecklist(out);
      expect(back.lines.map((l) => [l.name, l.zone])).toEqual([
        [commanderGU.name, "commander"],
        ["Sol Ring", "mainboard"],
      ]);
    }
  });
  it("archidekt keeps categories", () => {
    expect(exportDeck(deck, "archidekt")).toContain("1x Sol Ring [Ramp]");
  });
});
