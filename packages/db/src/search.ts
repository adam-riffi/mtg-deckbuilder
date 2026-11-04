import type { ColorQuery } from "@mtg/mtg";
import { EXTRA_LAYOUTS, rarityRank } from "@mtg/mtg";
import type { NumField, Op, Predicate, SearchQuery } from "@mtg/mtg/search";
import { type SQL, sql } from "drizzle-orm";

/** Normalises text the same way names are stored in oracle_cards.name_search. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const like = (v: string) => `%${normalizeName(v).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

function opSql(op: Op): SQL {
  switch (op) {
    case ":":
    case "=":
      return sql.raw("=");
    case "!=":
      return sql.raw("<>");
    default:
      return sql.raw(op);
  }
}

const NUM_COL: Record<NumField, string> = {
  mv: "o.cmc",
  power: "o.power_num",
  toughness: "o.toughness_num",
  loyalty: "o.loyalty_num",
  defense: "o.defense_num",
};

function colorSql(col: string, field: "colors" | "identity", op: Op, q: ColorQuery): SQL {
  const c = sql.raw(col);
  const popcount = sql`length(replace(${c}::bit(5)::text, '0', ''))`;
  if (q.kind === "count") return sql`${popcount} ${opSql(op === ":" ? "=" : op)} ${q.count}`;
  if (q.kind === "colorless") return op === "!=" ? sql`${c} <> 0` : sql`${c} = 0`;
  if (q.kind === "multicolor") return op === "!=" ? sql`${popcount} < 2` : sql`${popcount} >= 2`;
  const m = q.mask;
  const inv = ~m & 31;
  const eff: Op = op === ":" ? (field === "identity" ? "<=" : ">=") : op;
  const subset = sql`(${c} & ${inv}) = 0`;
  const superset = sql`(${c} & ${m}) = ${m}`;
  switch (eff) {
    case "=":
      return sql`${c} = ${m}`;
    case "!=":
      return sql`${c} <> ${m}`;
    case "<=":
      return subset;
    case "<":
      return sql`(${subset} and ${c} <> ${m})`;
    case ">=":
      return superset;
    case ">":
      return sql`(${superset} and ${c} <> ${m})`;
    default:
      return sql`false`;
  }
}

const printingExists = (cond: SQL) =>
  sql`exists (select 1 from printings p where p.oracle_id = o.id and ${cond})`;

function symbolCount(sym: string): SQL {
  const token = `{${sym}}`;
  return sql`((length(coalesce(o.mana_cost, '')) - length(replace(coalesce(o.mana_cost, ''), ${token}, ''))) / ${token.length})`;
}

function manaSql(op: Op, symbols: string[]): SQL {
  const need = new Map<string, number>();
  let generic = 0;
  for (const s of symbols) {
    if (/^\d+$/.test(s)) generic += Number(s);
    else need.set(s, (need.get(s) ?? 0) + 1);
  }
  const parts: SQL[] = [];
  const cmp = op === "=" ? sql.raw("=") : sql.raw(">=");
  for (const [s, n] of need) parts.push(sql`${symbolCount(s)} ${cmp} ${n}`);
  if (generic > 0 || op === "=")
    parts.push(
      sql`coalesce((select sum(m[1]::int) from regexp_matches(coalesce(o.mana_cost, ''), '\\{(\\d+)\\}', 'g') as m), 0) ${cmp} ${generic}`,
    );
  return parts.length ? sql.join(parts, sql` and `) : sql`true`;
}

function isSql(v: string): SQL {
  switch (v) {
    case "commander":
      return sql`((o.type_line ~* '^legendary[^/]*creature' ) or o.oracle_text ~* 'can be your commander' or o.type_line ~* 'legendary enchantment.*background')`;
    case "partner":
      return sql`(o.oracle_text ~* '\\mpartner\\M')`;
    case "companion":
      return sql`('Companion' = any(o.keywords))`;
    case "background":
      return sql`(o.type_line ~* 'legendary enchantment.*background')`;
    case "dfc":
      return sql`o.layout in ('transform','modal_dfc','meld','reversible_card')`;
    case "mdfc":
      return sql`o.layout = 'modal_dfc'`;
    case "saga":
      return sql`(o.layout = 'saga' or o.type_line ~ '\\mSaga\\M')`;
    case "transform":
    case "split":
    case "flip":
    case "meld":
    case "adventure":
    case "leveler":
    case "class":
      return sql`o.layout = ${v}`;
    case "token":
      return sql`o.layout in ('token','double_faced_token')`;
    case "spell":
      return sql`(o.type_line !~ '\\mLand\\M' and o.layout <> all(${sql.raw(arrayLiteral(EXTRA_LAYOUTS))}))`;
    case "permanent":
      return sql`(o.type_line !~ '\\m(Instant|Sorcery)\\M' or o.type_line ~ ' // .*(Creature|Artifact|Enchantment|Land|Planeswalker)')`;
    case "historic":
      return sql`(o.type_line ~ '\\m(Legendary|Artifact|Saga)\\M')`;
    case "vanilla":
      return sql`(o.type_line ~ '\\mCreature\\M' and btrim(o.oracle_text) = '')`;
    case "frenchvanilla":
      return sql`(o.type_line ~ '\\mCreature\\M' and btrim(o.oracle_text) <> '' and o.oracle_text ~ '^([A-Z][a-z]+( [a-z]+)?(, [a-z]+( [a-z]+)?)*\\n?)+$')`;
    case "modal":
      return sql`(o.oracle_text ~* 'choose (one|two|three|one or more|any number)' or o.layout = 'modal_dfc')`;
    case "reserved":
      return sql`o.reserved`;
    case "gamechanger":
      return sql`o.game_changer`;
    case "land":
      return sql`(o.type_line ~ '\\mLand\\M')`;
    case "basic":
      return sql`(o.type_line ~ '\\mBasic\\M')`;
    case "legendary":
      return sql`(o.type_line ~ '\\mLegendary\\M')`;
    case "creature":
      return sql`(o.type_line ~ '\\mCreature\\M')`;
    case "multicolor":
      return sql`array_length(o.colors, 1) > 1`;
    case "colorless":
      return sql`coalesce(array_length(o.colors, 1), 0) = 0`;
    case "hybrid":
      return sql`(coalesce(o.mana_cost, '') ~ '\\{[WUBRG2]/[WUBRG]\\}')`;
    case "phyrexian":
      return sql`(coalesce(o.mana_cost, '') ~ '/P\\}')`;
    case "foil":
    case "nonfoil":
    case "etched":
      return printingExists(sql`${v} = any(p.finishes)`);
    case "promo":
      return printingExists(sql`p.promo`);
    case "digital":
      return sql`(${printingExists(sql`p.digital`)} or (array_length(o.games, 1) > 0 and not ('paper' = any(o.games))))`;
    case "fullart":
      return printingExists(sql`p.full_art`);
    case "reprint":
      return sql`(select count(*) from printings p where p.oracle_id = o.id) > 1`;
    default:
      return sql`false`;
  }
}

function arrayLiteral(values: readonly string[]): string {
  return `array[${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(",")}]::text[]`;
}

function textSql(col: SQL, mode: "contains" | "regex", value: string): SQL {
  if (mode === "regex") return sql`${col} ~* ${value}`;
  if (value.includes("~")) {
    // "~" stands for the card's own name.
    const v = `%${value.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    return sql`replace(lower(${col}), lower(o.name), '~') like ${v}`;
  }
  return sql`lower(${col}) like ${like(value)}`;
}

/** Compiles a predicate tree to a SQL boolean expression over `oracle_cards o`. */
export function compilePredicate(p: Predicate): SQL {
  switch (p.t) {
    case "true":
      return sql`true`;
    case "false":
      return sql`false`;
    case "and":
      return sql`(${sql.join(p.children.map(compilePredicate), sql` and `)})`;
    case "or":
      return sql`(${sql.join(p.children.map(compilePredicate), sql` or `)})`;
    case "not":
      return sql`not coalesce(${compilePredicate(p.child)}, false)`;
    case "name":
      if (p.mode === "exact")
        return sql`(lower(o.name) = lower(${p.value}) or exists (select 1 from jsonb_array_elements(o.faces) f where lower(f->>'name') = lower(${p.value})))`;
      if (p.mode === "regex") return sql`o.name ~* ${p.value}`;
      return sql`o.name_search like ${like(p.value)}`;
    case "text":
      if (p.field === "type") return textSql(sql`o.type_line`, p.mode, p.value);
      if (p.field === "oracle")
        return textSql(p.mode === "regex" ? sql`o.oracle_text` : sql`o.oracle_search`, p.mode, p.value);
      return textSql(sql`o.oracle_text`, p.mode, p.value);
    case "colors":
      return colorSql(p.field === "colors" ? "o.colors_mask" : "o.identity_mask", p.field, p.op, p.q);
    case "produces":
      return colorSql("o.produced_mask", "colors", p.op, p.q);
    case "num":
      return sql`${sql.raw(NUM_COL[p.field])} ${opSql(p.op)} ${p.value}`;
    case "numField":
      return sql`${sql.raw(NUM_COL[p.field])} ${opSql(p.op)} ${sql.raw(NUM_COL[p.other])}`;
    case "mana":
      return manaSql(p.op, p.symbols);
    case "keyword":
      return sql`exists (select 1 from unnest(o.keywords) k where lower(k) = lower(${p.value}))`;
    case "legal":
      return p.status === "legal"
        ? sql`(o.legalities->>${p.format}) in ('legal', 'restricted')`
        : sql`(o.legalities->>${p.format}) = ${p.status}`;
    case "price": {
      const col = sql.raw(
        p.currency === "usd" ? "o.min_usd" : p.currency === "eur" ? "o.min_eur" : "o.min_tix",
      );
      return sql`${col} ${opSql(p.op)} ${p.value}`;
    }
    case "tag":
      return sql`${p.value} = any(o.tags)`;
    case "game":
      return sql`${p.value} = any(o.games)`;
    case "rarity":
      return printingExists(sql`p.rarity_rank ${opSql(p.op)} ${rarityRank(p.value)}`);
    case "set":
      return printingExists(sql`p.set_code = ${p.value}`);
    case "artist":
      return printingExists(sql`lower(p.artist) like ${like(p.value)}`);
    case "year":
      return printingExists(sql`extract(year from p.released_at) ${opSql(p.op)} ${p.value}`);
    case "is":
      return isSql(p.value);
  }
}

const ORDER_SQL: Record<SearchQuery["order"], { col: string; dir: "asc" | "desc" }> = {
  name: { col: "o.name", dir: "asc" },
  mv: { col: "o.cmc", dir: "asc" },
  power: { col: "o.power_num", dir: "desc" },
  toughness: { col: "o.toughness_num", dir: "desc" },
  usd: { col: "o.min_usd", dir: "asc" },
  eur: { col: "o.min_eur", dir: "asc" },
  tix: { col: "o.min_tix", dir: "asc" },
  rarity: { col: "o.max_rarity", dir: "desc" },
  color: { col: "o.colors_mask", dir: "asc" },
  edhrec: { col: "o.edhrec_rank", dir: "asc" },
  released: { col: "o.first_released", dir: "desc" },
  set: { col: "o.first_released", dir: "desc" },
};

/** Full WHERE clause including default exclusions (extras, digital-only cards). */
export function compileWhere(q: SearchQuery): SQL {
  const parts: SQL[] = [compilePredicate(q.where)];
  if (!q.includeExtras) parts.push(sql`o.layout <> all(${sql.raw(arrayLiteral(EXTRA_LAYOUTS))})`);
  if (!q.includeDigital)
    parts.push(sql`(coalesce(array_length(o.games, 1), 0) = 0 or 'paper' = any(o.games))`);
  return sql.join(parts, sql` and `);
}

export function compileOrder(q: SearchQuery): SQL {
  const o = ORDER_SQL[q.order];
  const dir = q.direction === "auto" ? o.dir : q.direction;
  return sql`${sql.raw(o.col)} ${sql.raw(dir)} nulls last, o.name asc`;
}
