import type { ColorQuery } from "../colors";

export type Op = ":" | "=" | "!=" | "<" | "<=" | ">" | ">=";

/** Raw syntax tree produced by the parser, before key interpretation. */
export type Ast =
  | { type: "and"; nodes: Ast[] }
  | { type: "or"; nodes: Ast[] }
  | { type: "not"; node: Ast }
  | {
      type: "term";
      key: string | null;
      op: Op;
      value: string;
      quoted: boolean;
      regex: boolean;
      exact: boolean;
    };

export type NumField = "mv" | "power" | "toughness" | "loyalty" | "defense";
export type TextField = "type" | "oracle" | "fullOracle";

/** Typed predicate tree; both the SQL compiler and the in-memory matcher consume this. */
export type Predicate =
  | { t: "and"; children: Predicate[] }
  | { t: "or"; children: Predicate[] }
  | { t: "not"; child: Predicate }
  | { t: "name"; mode: "contains" | "exact" | "regex"; value: string }
  | { t: "text"; field: TextField; mode: "contains" | "regex"; value: string }
  | { t: "colors"; field: "colors" | "identity"; op: Op; q: ColorQuery }
  | { t: "num"; field: NumField; op: Op; value: number }
  | { t: "numField"; field: NumField; op: Op; other: NumField }
  | { t: "rarity"; op: Op; value: string }
  | { t: "set"; value: string }
  | { t: "legal"; format: string; status: "legal" | "banned" | "restricted" }
  | { t: "is"; value: string }
  | { t: "price"; currency: "usd" | "eur" | "tix"; op: Op; value: number }
  | { t: "keyword"; value: string }
  | { t: "mana"; op: Op; symbols: string[] }
  | { t: "artist"; value: string }
  | { t: "year"; op: Op; value: number }
  | { t: "produces"; op: Op; q: ColorQuery }
  | { t: "tag"; value: string }
  | { t: "game"; value: string }
  | { t: "true" }
  | { t: "false" };

export const ORDER_FIELDS = [
  "name",
  "mv",
  "power",
  "toughness",
  "usd",
  "eur",
  "tix",
  "rarity",
  "color",
  "edhrec",
  "released",
  "set",
] as const;
export type OrderField = (typeof ORDER_FIELDS)[number];

export interface SearchQuery {
  where: Predicate;
  order: OrderField;
  direction: "asc" | "desc" | "auto";
  unique: "cards" | "prints" | "art";
  /** Include tokens, emblems, art series etc. */
  includeExtras: boolean;
  /** Include cards that exist only in digital games. */
  includeDigital: boolean;
  errors: string[];
  /** True if the query contains printing-level filters (set, rarity, artist…). */
  printingFilters: boolean;
}
