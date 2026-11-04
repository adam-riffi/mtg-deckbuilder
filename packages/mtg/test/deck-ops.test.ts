import { describe, expect, it } from "vitest";
import { applyDeckOps, type DeckLine, type DeckOp } from "../src/deck-ops";

const base: DeckLine[] = [
  {
    oracleId: "a",
    zone: "mainboard",
    qty: 1,
    printingId: null,
    categories: ["Ramp"],
    tags: [],
    finish: "nonfoil",
  },
  { oracleId: "b", zone: "mainboard", qty: 4, printingId: "p1", categories: [], tags: [], finish: "foil" },
];

const norm = (ls: DeckLine[]) =>
  [...ls].sort((x, y) => `${x.zone}${x.oracleId}`.localeCompare(`${y.zone}${y.oracleId}`));

describe("applyDeckOps", () => {
  const cases: [string, DeckOp[]][] = [
    ["add new", [{ op: "add", oracleId: "c", qty: 2, zone: "mainboard" }]],
    ["add existing", [{ op: "add", oracleId: "a", qty: 1, zone: "mainboard", categories: ["Draw"] }]],
    ["remove all", [{ op: "remove", oracleId: "b", zone: "mainboard" }]],
    ["remove some", [{ op: "remove", oracleId: "b", zone: "mainboard", qty: 3 }]],
    ["set qty 0", [{ op: "set_qty", oracleId: "a", zone: "mainboard", qty: 0 }]],
    ["move partial", [{ op: "move", oracleId: "b", from: "mainboard", to: "sideboard", qty: 2 }]],
    ["move all to commander", [{ op: "move", oracleId: "a", from: "mainboard", to: "commander" }]],
    [
      "printing",
      [{ op: "set_printing", oracleId: "b", zone: "mainboard", printingId: "p2", finish: "nonfoil" }],
    ],
    [
      "categories",
      [{ op: "set_categories", oracleId: "a", zone: "mainboard", categories: ["Draw", " Draw ", ""] }],
    ],
    [
      "multiple",
      [
        { op: "add", oracleId: "c", qty: 1, zone: "mainboard" },
        { op: "move", oracleId: "c", from: "mainboard", to: "maybeboard" },
        { op: "remove", oracleId: "a", zone: "mainboard" },
      ],
    ],
  ];
  it.each(cases)("%s: inverse restores the original", (_, ops) => {
    const { lines, inverse } = applyDeckOps(base, ops);
    expect(norm(applyDeckOps(lines, inverse).lines)).toEqual(norm(base));
  });
  it("applies semantics", () => {
    const { lines } = applyDeckOps(base, cases[5]![1]);
    expect(lines.find((l) => l.zone === "sideboard")).toMatchObject({
      oracleId: "b",
      qty: 2,
      finish: "foil",
      printingId: "p1",
    });
    expect(lines.find((l) => l.zone === "mainboard" && l.oracleId === "b")?.qty).toBe(2);
    expect(applyDeckOps(base, cases[8]![1]).lines[0]!.categories).toEqual(["Draw"]);
    expect(applyDeckOps(base, cases[1]![1]).lines[0]).toMatchObject({ qty: 2, categories: ["Ramp", "Draw"] });
  });
  it("ignores ops on missing lines", () => {
    expect(applyDeckOps(base, [{ op: "remove", oracleId: "zzz", zone: "mainboard" }]).inverse).toEqual([]);
  });
});
