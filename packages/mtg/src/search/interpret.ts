import { parseColorQuery } from "../colors";
import { normaliseManaQuery } from "../mana";
import {
  type Ast,
  type NumField,
  type Op,
  ORDER_FIELDS,
  type OrderField,
  type Predicate,
  type SearchQuery,
} from "./ast";
import { parseAst } from "./parser";

const NUM_FIELDS: Record<string, NumField> = {
  mv: "mv",
  cmc: "mv",
  manavalue: "mv",
  pow: "power",
  power: "power",
  tou: "toughness",
  toughness: "toughness",
  loy: "loyalty",
  loyalty: "loyalty",
  def: "defense",
  defense: "defense",
};

const RARITIES: Record<string, string> = {
  c: "common",
  common: "common",
  u: "uncommon",
  uncommon: "uncommon",
  r: "rare",
  rare: "rare",
  m: "mythic",
  mythic: "mythic",
  s: "special",
  special: "special",
  b: "bonus",
  bonus: "bonus",
};

const FORMAT_ALIASES: Record<string, string> = {
  edh: "commander",
  cedh: "commander",
  duelcommander: "duel",
  pdh: "paupercommander",
};

const IS_VALUES = new Set([
  "commander",
  "partner",
  "companion",
  "background",
  "dfc",
  "mdfc",
  "transform",
  "split",
  "flip",
  "meld",
  "adventure",
  "leveler",
  "saga",
  "class",
  "token",
  "spell",
  "permanent",
  "historic",
  "vanilla",
  "frenchvanilla",
  "modal",
  "reserved",
  "gamechanger",
  "gc",
  "foil",
  "nonfoil",
  "etched",
  "promo",
  "digital",
  "fullart",
  "reprint",
  "land",
  "basic",
  "legendary",
  "creature",
  "multicolor",
  "colorless",
  "hybrid",
  "phyrexian",
]);

/** Keys that need printing-level data. */
const PRINTING_KEYS = new Set(["set", "s", "e", "edition", "r", "rarity", "a", "artist", "year", "date"]);
const PRINTING_IS = new Set(["foil", "nonfoil", "etched", "promo", "digital", "fullart", "reprint"]);

const clampOp = (op: Op): Op => op;

/** Parses Scryfall syntax into a typed query. Unknown keys become errors and match nothing. */
export function parseSearch(input: string): SearchQuery {
  const { ast, errors } = parseAst(input);
  const q: SearchQuery = {
    where: { t: "true" },
    order: "name",
    direction: "auto",
    unique: "cards",
    includeExtras: false,
    includeDigital: false,
    errors: [...errors],
    printingFilters: false,
  };
  if (ast) q.where = simplify(interpret(ast, q));
  return q;
}

function interpret(ast: Ast, q: SearchQuery): Predicate {
  switch (ast.type) {
    case "and":
      return { t: "and", children: ast.nodes.map((n) => interpret(n, q)) };
    case "or":
      return { t: "or", children: ast.nodes.map((n) => interpret(n, q)) };
    case "not":
      return { t: "not", child: interpret(ast.node, q) };
    case "term":
      return term(ast, q);
  }
}

function term(a: Extract<Ast, { type: "term" }>, q: SearchQuery): Predicate {
  const v = a.value;
  if (a.key === null) {
    if (a.exact) return { t: "name", mode: "exact", value: v };
    if (a.regex) return { t: "name", mode: "regex", value: v };
    return { t: "name", mode: "contains", value: v };
  }
  const key = a.key;
  if (PRINTING_KEYS.has(key)) q.printingFilters = true;
  const err = (msg: string): Predicate => {
    q.errors.push(msg);
    return { t: "true" };
  };
  switch (key) {
    case "name":
    case "n":
      return { t: "name", mode: a.regex ? "regex" : a.op === "=" ? "exact" : "contains", value: v };
    case "t":
    case "type":
      if (/^(token|emblem)$/i.test(v)) q.includeExtras = true;
      return { t: "text", field: "type", mode: a.regex ? "regex" : "contains", value: v };
    case "o":
    case "oracle":
      return { t: "text", field: "oracle", mode: a.regex ? "regex" : "contains", value: v };
    case "fo":
    case "fulloracle":
      return { t: "text", field: "fullOracle", mode: a.regex ? "regex" : "contains", value: v };
    case "c":
    case "color":
    case "colors":
    case "id":
    case "identity":
    case "ci":
    case "commander": {
      const cq = parseColorQuery(v);
      if (!cq) return err(`Unknown colour "${v}".`);
      const field = key === "c" || key === "color" || key === "colors" ? "colors" : "identity";
      return { t: "colors", field, op: clampOp(a.op), q: cq };
    }
    case "produces": {
      const cq = parseColorQuery(v);
      if (!cq) return err(`Unknown colour "${v}".`);
      return { t: "produces", op: a.op, q: cq };
    }
    case "m":
    case "mana":
      return { t: "mana", op: a.op, symbols: normaliseManaQuery(v) };
    case "r":
    case "rarity": {
      const r = RARITIES[v.toLowerCase()];
      if (!r) return err(`Unknown rarity "${v}".`);
      return { t: "rarity", op: a.op, value: r };
    }
    case "s":
    case "set":
    case "e":
    case "edition":
      return { t: "set", value: v.toLowerCase() };
    case "f":
    case "format":
    case "legal":
    case "banned":
    case "restricted": {
      const format = FORMAT_ALIASES[v.toLowerCase()] ?? v.toLowerCase();
      const status = key === "banned" ? "banned" : key === "restricted" ? "restricted" : "legal";
      return { t: "legal", format, status };
    }
    case "is":
    case "not": {
      const val = v.toLowerCase();
      if (!IS_VALUES.has(val)) return err(`Unknown is: value "${v}".`);
      if (val === "token") q.includeExtras = true;
      if (val === "digital") q.includeDigital = true;
      if (PRINTING_IS.has(val)) q.printingFilters = true;
      const p: Predicate = { t: "is", value: val === "gc" ? "gamechanger" : val };
      return key === "not" ? { t: "not", child: p } : p;
    }
    case "usd":
    case "eur":
    case "tix": {
      const n = Number(v);
      if (!Number.isFinite(n)) return err(`Invalid price "${v}".`);
      return { t: "price", currency: key, op: a.op, value: n };
    }
    case "k":
    case "kw":
    case "keyword":
      return { t: "keyword", value: v };
    case "a":
    case "artist":
      return { t: "artist", value: v };
    case "year": {
      const n = Number(v);
      if (!Number.isInteger(n)) return err(`Invalid year "${v}".`);
      return { t: "year", op: a.op, value: n };
    }
    case "otag":
    case "oracletag":
    case "function":
    case "tag":
      return { t: "tag", value: v.toLowerCase() };
    case "game":
      if (v.toLowerCase() !== "paper") q.includeDigital = true;
      return { t: "game", value: v.toLowerCase() };
    case "include":
      if (v.toLowerCase() === "extras") q.includeExtras = true;
      return { t: "true" };
    case "order":
    case "sort": {
      const o = normaliseOrder(v);
      if (!o) return err(`Unknown order "${v}".`);
      q.order = o;
      return { t: "true" };
    }
    case "dir":
    case "direction":
      if (v === "asc" || v === "desc" || v === "auto") q.direction = v;
      else q.errors.push(`Unknown direction "${v}".`);
      return { t: "true" };
    case "unique":
      if (v === "cards" || v === "prints" || v === "art") q.unique = v;
      return { t: "true" };
    default: {
      const nf = NUM_FIELDS[key];
      if (nf) {
        const other = NUM_FIELDS[v.toLowerCase()];
        if (other) return { t: "numField", field: nf, op: a.op, other };
        const n = Number(v);
        if (!Number.isFinite(n)) return err(`Invalid number "${v}" for ${key}.`);
        return { t: "num", field: nf, op: a.op, value: n };
      }
      return err(`Unknown keyword "${key}".`);
    }
  }
}

function normaliseOrder(v: string): OrderField | null {
  const map: Record<string, OrderField> = {
    cmc: "mv",
    manavalue: "mv",
    pow: "power",
    tou: "toughness",
    date: "released",
    edhrec: "edhrec",
    colors: "color",
  };
  const o = map[v.toLowerCase()] ?? v.toLowerCase();
  return (ORDER_FIELDS as readonly string[]).includes(o) ? (o as OrderField) : null;
}

/** Flattens nested and/or and drops trivially-true children. */
export function simplify(p: Predicate): Predicate {
  if (p.t === "and" || p.t === "or") {
    const kids: Predicate[] = [];
    for (const c of p.children.map(simplify)) {
      if (c.t === p.t) kids.push(...c.children);
      else if (p.t === "and" && c.t === "true") continue;
      else kids.push(c);
    }
    if (p.t === "or" && kids.some((k) => k.t === "true")) return { t: "true" };
    if (kids.length === 0) return { t: "true" };
    if (kids.length === 1) return kids[0]!;
    return { t: p.t, children: kids };
  }
  if (p.t === "not") {
    const c = simplify(p.child);
    if (c.t === "not") return c.child;
    return { t: "not", child: c };
  }
  return p;
}
