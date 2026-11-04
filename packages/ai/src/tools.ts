import {
  createChangeSet,
  type Db,
  getCardsByIds,
  getCardsByNames,
  getDeck,
  getSetting,
  ownedByOracle,
  searchCards,
  userScope,
} from "@mtg/db";
import {
  bracketConfigSchema,
  type Card,
  colorMask,
  computeStats,
  type DeckEntry,
  deckColorIdentity,
  estimateBracket,
  getFormat,
  validateDeck,
  ZONES,
} from "@mtg/mtg";
import { z } from "zod";
import type { ToolDef } from "./provider";

export interface ToolContext {
  db: Db;
  userId: string;
  deckId: string;
  threadId: string | null;
  currency: "eur" | "usd";
  /** Lower-cased names of cards seen in tool results this conversation (verification for the model's output). */
  verified: Set<string>;
  /** Called when a change set is created so the UI can show it immediately. */
  onChangeSet?: (id: string) => void;
}

const zone = z.enum(ZONES);

export const toolSchemas = {
  search_cards: z.object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe("Scryfall-syntax query, e.g. 'id<=simic otag:ramp mv<=3 f:commander'"),
    limit: z.number().int().min(1).max(50).default(20),
    order: z.string().optional().describe("name, mv, usd, eur, edhrec, rarity, released, power, toughness"),
  }),
  get_cards: z.object({
    names: z.array(z.string()).max(60).optional().describe("Exact card names"),
    ids: z.array(z.string()).max(60).optional().describe("Card ids from earlier tool results"),
  }),
  get_deck: z.object({ zone: zone.optional().describe("Only this zone") }),
  get_deck_stats: z.object({}),
  validate_deck: z.object({
    format: z.string().optional().describe("Validate against a different format (e.g. for conversions)"),
  }),
  propose_changes: z.object({
    summary: z.string().min(1).max(300).describe("One-line summary of the proposal"),
    changes: z
      .array(
        z.object({
          action: z.enum(["add", "remove", "move", "swap"]),
          card: z.string().min(1).describe("Exact card name (for swap: the card going out)"),
          to_card: z.string().optional().describe("swap only: exact name of the card coming in"),
          qty: z.number().int().min(1).max(99).default(1),
          from_zone: zone.optional().describe("remove/move/swap: zone the card is in (default mainboard)"),
          to_zone: zone.optional().describe("add/move: destination zone (default mainboard)"),
          category: z
            .string()
            .max(40)
            .optional()
            .describe("Category for added cards, e.g. Ramp, Card Draw, Removal"),
          reason: z.string().min(1).max(300),
        }),
      )
      .min(1)
      .max(120),
  }),
  check_collection: z.object({ cards: z.array(z.string()).min(1).max(150).describe("Exact card names") }),
  find_combos: z.object({}),
} as const;

export type ToolName = keyof typeof toolSchemas;

const DESCRIPTIONS: Record<ToolName, string> = {
  search_cards:
    "Search the card database with Scryfall syntax. Returns matching cards with id, mana cost, type, oracle text (shortened), price and Game Changer flag. Use this to discover cards before naming them.",
  get_cards:
    "Get full details for specific cards by exact name or id: oracle text for every face, mana value, types, colour identity, legality in the deck's format, prices, Game Changer flag. Unknown names are listed in not_found.",
  get_deck:
    "Get the current deck list: quantity, name, zone, categories, mana value and type for every card.",
  get_deck_stats:
    "Get deck statistics: mana curve by type, land count and guidance, average mana value, coloured pips versus mana sources, category counts and price breakdown.",
  validate_deck:
    "Validate legality (size, copies, colour identity, bans, commander rules) and estimate the Commander bracket with its explanation.",
  propose_changes:
    "Propose deck edits (add, remove, move between zones, or swap). Creates a pending change set the player reviews; it never edits the deck directly. Every card must be an exact, verified card name. Include a reason per change.",
  check_collection: "Check how many copies of each card the player owns in their collection.",
  find_combos:
    "Find known combos among the deck's cards (Commander Spellbook). Only available when enabled in Settings.",
};

/** Tool definitions in the order they are sent (deterministic, for prompt caching). */
export const TOOL_DEFS: ToolDef[] = (Object.keys(toolSchemas) as ToolName[]).map((name) => {
  const schema = z.toJSONSchema(toolSchemas[name], { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    name,
    description: DESCRIPTIONS[name],
    input_schema: { ...schema, type: "object" } as ToolDef["input_schema"],
    eager_input_streaming: true,
  };
});

const short = (s: string, n = 320) => (s.length > n ? `${s.slice(0, n)}…` : s);

function cardBrief(c: Card, format: string) {
  return {
    id: c.id,
    name: c.name,
    mana_cost: c.faces[0]?.manaCost ?? c.manaCost,
    mv: c.cmc,
    type: c.typeLine,
    text: short(c.oracleText),
    identity: c.colorIdentity.join("") || "C",
    legal: c.legalities[getFormat(format).legalityKey] ?? "not_legal",
    eur: c.minEur,
    usd: c.minUsd,
    game_changer: c.gameChanger || undefined,
  };
}

function cardFull(c: Card, format: string) {
  return {
    id: c.id,
    name: c.name,
    layout: c.layout,
    mana_cost: c.manaCost,
    mv: c.cmc,
    type: c.typeLine,
    faces: c.faces.length
      ? c.faces.map((f) => ({
          name: f.name,
          mana_cost: f.manaCost,
          type: f.typeLine,
          text: f.oracleText,
          pt: f.power ? `${f.power}/${f.toughness}` : undefined,
          loyalty: f.loyalty ?? undefined,
        }))
      : undefined,
    text: c.faces.length ? undefined : c.oracleText,
    pt: c.power ? `${c.power}/${c.toughness}` : undefined,
    loyalty: c.loyalty ?? undefined,
    colors: c.colors.join("") || "C",
    identity: c.colorIdentity.join("") || "C",
    keywords: c.keywords,
    legality: {
      [format]: c.legalities[getFormat(format).legalityKey] ?? "not_legal",
      commander: c.legalities.commander,
    },
    eur: c.minEur,
    usd: c.minUsd,
    game_changer: c.gameChanger,
    tags: c.tags.length ? c.tags : undefined,
  };
}

function remember(ctx: ToolContext, cards: { name: string }[]) {
  for (const c of cards) {
    ctx.verified.add(c.name.toLowerCase());
    for (const part of c.name.split(" // ")) ctx.verified.add(part.toLowerCase());
  }
}

function deckLine(e: DeckEntry) {
  return {
    qty: e.qty,
    name: e.card.name,
    zone: e.zone,
    categories: e.categories.length ? e.categories : undefined,
    mv: e.card.cmc,
    type: e.card.typeLine,
  };
}

async function resolveNames(ctx: ToolContext, names: string[]): Promise<Map<string, Card>> {
  const m = await getCardsByNames(ctx.db, names);
  remember(ctx, [...m.values()]);
  return m;
}

/** Executes a tool call. Input is validated with Zod; errors come back as { error } for the model to correct. */
export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<{ result: unknown; isError: boolean }> {
  const schema = toolSchemas[name as ToolName];
  if (!schema) return { result: { error: `Unknown tool ${name}` }, isError: true };
  const parsed = schema.safeParse(rawInput ?? {});
  if (!parsed.success)
    return {
      result: {
        error: "Invalid input",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      isError: true,
    };
  const input = parsed.data as never;
  try {
    return { result: await TOOLS[name as ToolName](input, ctx), isError: false };
  } catch (e) {
    return { result: { error: e instanceof Error ? e.message : String(e) }, isError: true };
  }
}

type Impl<K extends ToolName> = (
  input: z.infer<(typeof toolSchemas)[K]>,
  ctx: ToolContext,
) => Promise<unknown>;

const TOOLS: { [K in ToolName]: Impl<K> } = {
  async search_cards({ query, limit, order }, ctx) {
    const { deck } = await getDeck(ctx.db, ctx.userId, ctx.deckId);
    const q = order && !/\border:/.test(query) ? `${query} order:${order}` : query;
    const r = await searchCards(ctx.db, q, { limit });
    remember(
      ctx,
      r.hits.map((h) => h.card),
    );
    return {
      total: r.total,
      returned: r.hits.length,
      errors: r.query.errors.length ? r.query.errors : undefined,
      cards: r.hits.map((h) => cardBrief(h.card, deck.format)),
    };
  },

  async get_cards({ names = [], ids = [] }, ctx) {
    const { deck } = await getDeck(ctx.db, ctx.userId, ctx.deckId);
    const byName = await resolveNames(ctx, names);
    const byId = await getCardsByIds(ctx.db, ids);
    remember(ctx, byId);
    const all = new Map<string, Card>();
    for (const c of [...byName.values(), ...byId]) all.set(c.id, c);
    const notFound = names.filter((n) => !byName.has(n.toLowerCase().trim()));
    return {
      cards: [...all.values()].map((c) => cardFull(c, deck.format)),
      not_found: notFound.length ? notFound : undefined,
    };
  },

  async get_deck({ zone: z }, ctx) {
    const { deck, entries } = await getDeck(ctx.db, ctx.userId, ctx.deckId);
    remember(
      ctx,
      entries.map((e) => e.card),
    );
    const list = entries
      .filter((e) => !z || e.zone === z)
      .sort((a, b) => a.zone.localeCompare(b.zone) || a.card.name.localeCompare(b.card.name));
    return { name: deck.name, format: deck.format, cards: list.map(deckLine) };
  },

  async get_deck_stats(_input, ctx) {
    const { deck, entries } = await getDeck(ctx.db, ctx.userId, ctx.deckId);
    const s = computeStats(entries, { format: deck.format, currency: ctx.currency });
    return {
      total_cards: s.totalCards,
      lands: s.landCount,
      land_guidance: s.landGuidance,
      average_mv: Number(s.averageMv.toFixed(2)),
      curve: Object.fromEntries(s.curve.map((b) => [b.mv === 7 ? "7+" : String(b.mv), b.total])),
      types: s.typeCounts,
      pips: s.pips,
      sources: s.sources,
      categories: s.categoryCounts,
      price: {
        total: s.price.total,
        currency: s.price.currency,
        missing_prices: s.price.missing,
        top: s.price.top.slice(0, 5),
      },
    };
  },

  async validate_deck({ format }, ctx) {
    const { deck, entries } = await getDeck(ctx.db, ctx.userId, ctx.deckId);
    const f = format ?? deck.format;
    const r = validateDeck(entries, f);
    const cfg = bracketConfigSchema.safeParse(await getSetting(ctx.db, "global", "brackets")).data;
    const b = getFormat(f).commander ? estimateBracket(entries, { config: cfg }) : null;
    return {
      format: f,
      legal: r.legal,
      issues: r.issues.map((i) => ({ severity: i.severity, message: i.message })),
      bracket: b
        ? {
            estimate: b.bracket,
            name: b.name,
            game_changers: b.gameChangers.map((c) => c.name),
            reasons: b.reasons,
            target: deck.targetBracket,
          }
        : undefined,
    };
  },

  async propose_changes({ summary, changes }, ctx) {
    const { deck, entries } = await getDeck(ctx.db, ctx.userId, ctx.deckId);
    const names = changes.flatMap((c) => [c.card, c.to_card].filter((x): x is string => !!x));
    const found = await resolveNames(ctx, names);
    const errors: string[] = [];
    const warnings: string[] = [];
    const identity = colorMask(deckColorIdentity(entries));
    const f = getFormat(deck.format);
    const items = [];
    for (const [i, ch] of changes.entries()) {
      const card = found.get(ch.card.toLowerCase().trim());
      const toCard = ch.to_card ? found.get(ch.to_card.toLowerCase().trim()) : undefined;
      if (!card) {
        errors.push(`#${i + 1}: unknown card "${ch.card}" (use search_cards to find the exact name)`);
        continue;
      }
      if (ch.action === "swap" && !toCard) {
        errors.push(
          `#${i + 1}: swap needs a valid to_card${ch.to_card ? ` ("${ch.to_card}" not found)` : ""}`,
        );
        continue;
      }
      const incoming = ch.action === "swap" ? toCard! : ch.action === "add" ? card : null;
      if (
        (ch.action === "remove" || ch.action === "move" || ch.action === "swap") &&
        !entries.some((e) => e.cardId === card.id && e.zone === (ch.from_zone ?? "mainboard"))
      ) {
        errors.push(`#${i + 1}: ${card.name} is not in the ${ch.from_zone ?? "mainboard"}`);
        continue;
      }
      if (incoming) {
        if (f.commander && identity && (colorMask(incoming.colorIdentity) & ~identity) !== 0)
          warnings.push(`${incoming.name} is outside the commander's colour identity`);
        const leg = incoming.legalities[f.legalityKey];
        if (f.legalityKey && leg !== "legal" && leg !== "restricted")
          warnings.push(`${incoming.name} is ${leg ?? "not legal"} in ${f.name}`);
        if (
          f.maxCopies === 1 &&
          entries.some(
            (e) => e.cardId === incoming.id && (e.zone === "mainboard" || e.zone === "commander"),
          ) &&
          !/basic/i.test(incoming.typeLine)
        )
          warnings.push(`${incoming.name} is already in the deck (singleton)`);
      }
      items.push({
        action: ch.action,
        oracleId: card.id,
        toOracleId: toCard?.id ?? null,
        qty: ch.qty,
        fromZone: ch.action === "add" ? null : (ch.from_zone ?? "mainboard"),
        toZone: ch.action === "add" || ch.action === "move" ? (ch.to_zone ?? "mainboard") : null,
        category: ch.category ?? null,
        reason: ch.reason,
      });
    }
    if (!items.length) return { created: false, errors };
    const cs = await createChangeSet(ctx.db, ctx.userId, ctx.deckId, ctx.threadId, summary, items);
    ctx.onChangeSet?.(cs.id);
    return {
      created: true,
      change_set_id: cs.id,
      pending_items: items.length,
      note: "The player will review these changes in the app. Do not assume they are applied.",
      errors: errors.length ? errors : undefined,
      warnings: warnings.length ? warnings : undefined,
    };
  },

  async check_collection({ cards }, ctx) {
    const found = await resolveNames(ctx, cards);
    const owned = await ownedByOracle(
      ctx.db,
      ctx.userId,
      [...found.values()].map((c) => c.id),
    );
    return {
      cards: cards.map((n) => {
        const c = found.get(n.toLowerCase().trim());
        return c ? { name: c.name, owned: owned.get(c.id) ?? 0 } : { name: n, error: "not found" };
      }),
    };
  },

  async find_combos(_input, ctx) {
    const enabled = await getSetting<boolean>(ctx.db, userScope(ctx.userId), "combos.enabled");
    if (!enabled)
      return {
        enabled: false,
        message:
          "Combo lookup (Commander Spellbook) is disabled. The player can enable it in Settings after reviewing Commander Spellbook's terms.",
      };
    const { entries } = await getDeck(ctx.db, ctx.userId, ctx.deckId);
    const { findCombos } = await import("./combos");
    return findCombos(entries);
  },
};

/** Card names written as [[Name]] in the model's prose that were never verified by a tool call. */
export function unverifiedMentions(text: string, verified: Set<string>): string[] {
  const names = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.trim());
  return [...new Set(names.filter((n) => !verified.has(n.toLowerCase())))];
}
