import { describe, expect, it } from "vitest";
import { lex, matchQuery, parseSearch } from "../src/search";
import {
  card,
  commanderGU,
  counterspell,
  forest,
  lightningBolt,
  llanowar,
  printing,
  solRing,
} from "./helpers";

const cards = [solRing, counterspell, lightningBolt, llanowar, forest, commanderGU];
const run = (q: string) =>
  cards.filter((c) => matchQuery(parseSearch(q), c, [printing(c)])).map((c) => c.name);

describe("lexer", () => {
  it("tokenises keys, quotes, regex, negation and parens", () => {
    const t = lex('-t:creature (o:"draw a card" or name:/^sol/) !"Sol Ring"');
    expect(t.map((x) => x.kind)).toEqual(["neg", "term", "lparen", "term", "or", "term", "rparen", "term"]);
  });
  it("handles comparison operators", () => {
    const t = lex("mv>=3 pow!=2 usd<1.5");
    expect(t).toMatchObject([
      { key: "mv", op: ">=", value: "3" },
      { key: "pow", op: "!=", value: "2" },
      { key: "usd", op: "<", value: "1.5" },
    ]);
  });
});

describe("parser", () => {
  it("implicit AND binds tighter than OR", () => {
    const q = parseSearch("t:instant c:u or c:r");
    expect(q.where.t).toBe("or");
  });
  it("collects order/direction and reports unknown keys", () => {
    const q = parseSearch("sol order:usd dir:desc foo:bar");
    expect(q.order).toBe("usd");
    expect(q.direction).toBe("desc");
    expect(q.errors).toContain('Unknown keyword "foo".');
  });
  it("flags printing-level filters", () => {
    expect(parseSearch("set:cmr").printingFilters).toBe(true);
    expect(parseSearch("t:elf").printingFilters).toBe(false);
  });
  it("survives malformed input", () => {
    expect(() => parseSearch('((o:"unterminated')).not.toThrow();
    expect(parseSearch("a)").errors.length).toBeGreaterThan(0);
  });
});

describe("matcher", () => {
  it("name contains / exact / regex", () => {
    expect(run("bolt")).toEqual(["Lightning Bolt"]);
    expect(run('!"sol ring"')).toEqual(["Sol Ring"]);
    expect(run("name:/^l/")).toEqual(["Lightning Bolt", "Llanowar Elves"]);
  });
  it("colour semantics", () => {
    expect(run("c:u")).toEqual(["Counterspell", "Test Legend of Growth"]);
    expect(run("c=u")).toEqual(["Counterspell"]);
    expect(run("id:simic")).toEqual([
      "Sol Ring",
      "Counterspell",
      "Llanowar Elves",
      "Forest",
      "Test Legend of Growth",
    ]);
    expect(run("id<=g -t:land")).toEqual(["Sol Ring", "Llanowar Elves"]);
    expect(run("c:c")).toEqual(["Sol Ring", "Forest"]);
    expect(run("c:m")).toEqual(["Test Legend of Growth"]);
    expect(run("c=2")).toEqual(["Test Legend of Growth"]);
  });
  it("numbers and field comparison", () => {
    expect(run("mv=1")).toEqual(["Sol Ring", "Lightning Bolt", "Llanowar Elves"]);
    expect(run("mv>=2")).toEqual(["Counterspell", "Test Legend of Growth"]);
    expect(run("pow<tou")).toEqual(["Test Legend of Growth"]);
  });
  it("oracle text ignores reminder text, fo: does not", () => {
    expect(run("o:add t:land")).toEqual([]);
    expect(run("fo:add t:land")).toEqual(["Forest"]);
  });
  it("~ in oracle text means the card's name", () => {
    expect(run('o:"~ deals 3"')).toEqual(["Lightning Bolt"]);
  });
  it("is:, tags, produces, mana", () => {
    expect(run("is:commander")).toEqual(["Test Legend of Growth"]);
    expect(run("otag:ramp")).toEqual(["Sol Ring"]);
    expect(run("produces:g")).toEqual(["Llanowar Elves", "Forest"]);
    expect(run("m:uu")).toEqual(["Counterspell"]);
  });
  it("negation and grouping", () => {
    expect(run("-t:land -t:artifact (c:r or c:g)")).toEqual([
      "Lightning Bolt",
      "Llanowar Elves",
      "Test Legend of Growth",
    ]);
  });
  it("hides tokens by default", () => {
    const token = card({ name: "Treasure", layout: "token", typeLine: "Token Artifact — Treasure" });
    expect(matchQuery(parseSearch("treasure"), token)).toBe(false);
    expect(matchQuery(parseSearch("treasure is:token"), token)).toBe(true);
  });
  it("legality and rarity", () => {
    const banned = card({ name: "Banned Thing", legalities: { commander: "banned" } });
    expect(matchQuery(parseSearch("f:commander"), banned)).toBe(false);
    expect(matchQuery(parseSearch("banned:edh"), banned)).toBe(true);
    expect(matchQuery(parseSearch("r>=rare"), solRing, [printing(solRing, { rarity: "uncommon" })])).toBe(
      false,
    );
    expect(matchQuery(parseSearch("r>=rare"), solRing, [printing(solRing, { rarity: "mythic" })])).toBe(true);
  });
});
