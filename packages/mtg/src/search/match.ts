import { type Card, EXTRA_LAYOUTS, type Printing, rarityRank, statNumber } from "../card";
import { type ColorQuery, colorMask, popcount } from "../colors";
import { canBeCommander, isBackground } from "../commander";
import { manaCostContains, parseManaCost } from "../mana";
import type { NumField, Op, Predicate, SearchQuery } from "./ast";

export function compare(a: number, op: Op, b: number): boolean {
  switch (op) {
    case ":":
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
  }
}

/**
 * Colour comparison with Scryfall semantics.
 * colors: ":" means "at least these colours"; identity: ":" means "fits within this identity".
 */
export function matchColors(mask: number, field: "colors" | "identity", op: Op, q: ColorQuery): boolean {
  if (q.kind === "count") return compare(popcount(mask), op === ":" ? "=" : op, q.count);
  if (q.kind === "colorless") return op === "!=" ? mask !== 0 : mask === 0;
  if (q.kind === "multicolor") return op === "!=" ? popcount(mask) < 2 : popcount(mask) >= 2;
  const qm = q.mask;
  const effective: Op = op === ":" ? (field === "identity" ? "<=" : ">=") : op;
  const subset = (mask & ~qm) === 0;
  const superset = (mask & qm) === qm;
  switch (effective) {
    case "=":
      return mask === qm;
    case "!=":
      return mask !== qm;
    case "<=":
      return subset;
    case "<":
      return subset && mask !== qm;
    case ">=":
      return superset;
    case ">":
      return superset && mask !== qm;
    default:
      return false;
  }
}

function numValue(card: Card, f: NumField): number | null {
  switch (f) {
    case "mv":
      return card.cmc;
    case "power":
      return statNumber(card.power);
    case "toughness":
      return statNumber(card.toughness);
    case "loyalty":
      return statNumber(card.loyalty);
    case "defense":
      return statNumber(card.defense);
  }
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function textMatch(hay: string, mode: "contains" | "regex", value: string, card: Card): boolean {
  if (mode === "regex") {
    try {
      return new RegExp(value, "i").test(hay);
    } catch {
      return false;
    }
  }
  // "~" stands for the card's own name, as on Scryfall.
  const v = norm(value.replace(/~/g, card.name));
  return norm(hay).includes(v);
}

/** In-memory evaluation of a predicate; mirrors the SQL compiler in @mtg/db. */
export function matchCard(p: Predicate, card: Card, printings: readonly Printing[] = []): boolean {
  switch (p.t) {
    case "true":
      return true;
    case "false":
      return false;
    case "and":
      return p.children.every((c) => matchCard(c, card, printings));
    case "or":
      return p.children.some((c) => matchCard(c, card, printings));
    case "not":
      return !matchCard(p.child, card, printings);
    case "name":
      if (p.mode === "exact")
        return norm(card.name) === norm(p.value) || card.faces.some((f) => norm(f.name) === norm(p.value));
      return textMatch(card.name, p.mode, p.value, card);
    case "text": {
      const hay = p.field === "type" ? card.typeLine : card.oracleText;
      if (p.field === "oracle" && p.mode === "contains") {
        // Reminder text is excluded from o: (Scryfall behaviour); fo: keeps it.
        return textMatch(hay.replace(/\([^)]*\)/g, ""), "contains", p.value, card);
      }
      return textMatch(hay, p.mode, p.value, card);
    }
    case "colors":
      return matchColors(
        colorMask(p.field === "colors" ? card.colors : card.colorIdentity),
        p.field,
        p.op,
        p.q,
      );
    case "produces":
      return matchColors(colorMask(card.producedMana), "colors", p.op, p.q);
    case "num": {
      const v = numValue(card, p.field);
      return v !== null && compare(v, p.op, p.value);
    }
    case "numField": {
      const a = numValue(card, p.field);
      const b = numValue(card, p.other);
      return a !== null && b !== null && compare(a, p.op, b);
    }
    case "mana":
      if (p.op === "=") return parseManaCost(card.manaCost).sort().join() === [...p.symbols].sort().join();
      return manaCostContains(card.manaCost, p.symbols);
    case "keyword":
      return card.keywords.some((k) => norm(k) === norm(p.value));
    case "legal":
      return (
        card.legalities[p.format] === p.status ||
        (p.status === "legal" && card.legalities[p.format] === "restricted")
      );
    case "price": {
      const v = p.currency === "usd" ? card.minUsd : p.currency === "eur" ? card.minEur : card.minTix;
      return v !== null && compare(v, p.op, p.value);
    }
    case "tag":
      return card.tags.includes(p.value);
    case "game":
      return card.games.includes(p.value);
    case "rarity":
      return printings.some((x) => compare(rarityRank(x.rarity), p.op, rarityRank(p.value)));
    case "set":
      return printings.some((x) => x.setCode === p.value);
    case "artist":
      return printings.some((x) => x.artist !== null && norm(x.artist).includes(norm(p.value)));
    case "year":
      return printings.some((x) => compare(Number(x.releasedAt.slice(0, 4)), p.op, p.value));
    case "is":
      return matchIs(p.value, card, printings);
  }
}

const has = (s: string, re: RegExp) => re.test(s);

export function matchIs(v: string, card: Card, printings: readonly Printing[]): boolean {
  const type = card.typeLine;
  switch (v) {
    case "commander":
      return canBeCommander(card) || isBackground(card);
    case "partner":
      return card.keywords.some((k) => /^partner/i.test(k)) || /\bpartner\b/i.test(card.oracleText);
    case "companion":
      return card.keywords.some((k) => k.toLowerCase() === "companion");
    case "background":
      return isBackground(card);
    case "dfc":
      return ["transform", "modal_dfc", "meld", "reversible_card"].includes(card.layout);
    case "mdfc":
      return card.layout === "modal_dfc";
    case "transform":
    case "split":
    case "flip":
    case "meld":
    case "adventure":
    case "leveler":
    case "saga":
    case "class":
      return card.layout === v || (v === "saga" && has(type, /\bSaga\b/));
    case "token":
      return card.layout === "token" || card.layout === "double_faced_token";
    case "spell":
      return !has(type, /\bLand\b/) && !EXTRA_LAYOUTS.includes(card.layout);
    case "permanent":
      return (
        !has(type, /\b(Instant|Sorcery)\b/) ||
        has(type, / \/\/ .*(Creature|Artifact|Enchantment|Land|Planeswalker)/)
      );
    case "historic":
      return has(type, /\b(Legendary|Artifact|Saga)\b/);
    case "vanilla":
      return has(type, /\bCreature\b/) && card.oracleText.trim() === "";
    case "frenchvanilla":
      return (
        has(type, /\bCreature\b/) &&
        card.oracleText.trim() !== "" &&
        card.oracleText
          .split("\n")
          .every((l) => /^[A-Z][a-z]+( [a-z]+)?(, [a-z]+( [a-z]+)?)*$/.test(l.trim()))
      );
    case "modal":
      return (
        has(card.oracleText, /choose (one|two|three|one or more|any number)/i) || card.layout === "modal_dfc"
      );
    case "reserved":
      return card.reserved;
    case "gamechanger":
      return card.gameChanger;
    case "land":
      return has(type, /\bLand\b/);
    case "basic":
      return has(type, /\bBasic\b/);
    case "legendary":
      return has(type, /\bLegendary\b/);
    case "creature":
      return has(type, /\bCreature\b/);
    case "multicolor":
      return card.colors.length > 1;
    case "colorless":
      return card.colors.length === 0;
    case "hybrid":
      return /\{[WUBRG2]\/[WUBRG]\}/.test(card.manaCost ?? "");
    case "phyrexian":
      return /\/P\}/.test(card.manaCost ?? "");
    case "foil":
      return printings.some((x) => x.finishes.includes("foil"));
    case "nonfoil":
      return printings.some((x) => x.finishes.includes("nonfoil"));
    case "etched":
      return printings.some((x) => x.finishes.includes("etched"));
    case "promo":
      return printings.some((x) => x.promo);
    case "digital":
      return printings.some((x) => x.digital) || (card.games.length > 0 && !card.games.includes("paper"));
    case "fullart":
      return printings.some((x) => x.fullArt);
    case "reprint":
      return printings.length > 1;
    default:
      return false;
  }
}

/** Applies the default exclusions (extras, digital-only) the same way the SQL compiler does. */
export function matchQuery(q: SearchQuery, card: Card, printings: readonly Printing[] = []): boolean {
  if (!q.includeExtras && EXTRA_LAYOUTS.includes(card.layout)) return false;
  if (!q.includeDigital && card.games.length > 0 && !card.games.includes("paper")) return false;
  return matchCard(q.where, card, printings);
}
