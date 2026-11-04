import type { CardFace, ImageUris, Legality, Prices, RelatedPart } from "@mtg/mtg";
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
const now = (name: string) => timestamp(name, { withTimezone: true, mode: "date" }).notNull().defaultNow();

/* ───────────── Auth (Better Auth core schema) ───────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Card data (from Scryfall) ───────────── */

export const oracleCards = pgTable(
  "oracle_cards",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    /** Lower-cased, accent-stripped name used for search. */
    nameSearch: text("name_search").notNull(),
    layout: text("layout").notNull(),
    manaCost: text("mana_cost"),
    cmc: real("cmc").notNull().default(0),
    typeLine: text("type_line").notNull(),
    oracleText: text("oracle_text").notNull().default(""),
    /** Oracle text with reminder text removed (for o:). */
    oracleSearch: text("oracle_search").notNull().default(""),
    colors: text("colors").array().notNull().default(sql`'{}'::text[]`),
    colorIdentity: text("color_identity").array().notNull().default(sql`'{}'::text[]`),
    colorsMask: integer("colors_mask").notNull().default(0),
    identityMask: integer("identity_mask").notNull().default(0),
    producedMask: integer("produced_mask").notNull().default(0),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    power: text("power"),
    toughness: text("toughness"),
    loyalty: text("loyalty"),
    defense: text("defense"),
    powerNum: real("power_num"),
    toughnessNum: real("toughness_num"),
    loyaltyNum: real("loyalty_num"),
    defenseNum: real("defense_num"),
    legalities: jsonb("legalities").$type<Record<string, Legality>>().notNull().default({}),
    producedMana: text("produced_mana").array().notNull().default(sql`'{}'::text[]`),
    faces: jsonb("faces").$type<CardFace[]>().notNull().default([]),
    allParts: jsonb("all_parts").$type<RelatedPart[]>().notNull().default([]),
    gameChanger: boolean("game_changer").notNull().default(false),
    reserved: boolean("reserved").notNull().default(false),
    edhrecRank: integer("edhrec_rank"),
    games: text("games").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    minUsd: doublePrecision("min_usd"),
    minEur: doublePrecision("min_eur"),
    minTix: doublePrecision("min_tix"),
    maxRarity: integer("max_rarity").notNull().default(0),
    firstReleased: date("first_released"),
    defaultPrintingId: uuid("default_printing_id"),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(type_line, '')), 'B') || setweight(to_tsvector('english', coalesce(oracle_text, '')), 'C')`,
    ),
    updatedAt: now("updated_at"),
  },
  (t) => [
    index("oracle_name_trgm").using("gin", sql`${t.nameSearch} gin_trgm_ops`),
    index("oracle_text_trgm").using("gin", sql`lower(${t.oracleSearch}) gin_trgm_ops`),
    index("oracle_type_trgm").using("gin", sql`lower(${t.typeLine}) gin_trgm_ops`),
    index("oracle_search_vector").using("gin", t.searchVector),
    index("oracle_tags").using("gin", t.tags),
    index("oracle_keywords").using("gin", t.keywords),
    index("oracle_legalities").using("gin", t.legalities),
    index("oracle_cmc").on(t.cmc),
    index("oracle_identity").on(t.identityMask),
    index("oracle_name").on(t.name),
  ],
);

export const printings = pgTable(
  "printings",
  {
    id: uuid("id").primaryKey(),
    oracleId: uuid("oracle_id")
      .notNull()
      .references(() => oracleCards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    setName: text("set_name").notNull(),
    collectorNumber: text("collector_number").notNull(),
    rarity: text("rarity").notNull(),
    rarityRank: integer("rarity_rank").notNull().default(0),
    lang: text("lang").notNull().default("en"),
    releasedAt: date("released_at").notNull(),
    artist: text("artist"),
    imageUris: jsonb("image_uris").$type<ImageUris | null>(),
    faceImageUris: jsonb("face_image_uris").$type<(ImageUris | null)[]>().notNull().default([]),
    finishes: text("finishes").array().notNull().default(sql`'{}'::text[]`),
    prices: jsonb("prices").$type<Prices>().notNull(),
    usd: doublePrecision("usd"),
    usdFoil: doublePrecision("usd_foil"),
    eur: doublePrecision("eur"),
    eurFoil: doublePrecision("eur_foil"),
    tix: doublePrecision("tix"),
    promo: boolean("promo").notNull().default(false),
    digital: boolean("digital").notNull().default(false),
    fullArt: boolean("full_art").notNull().default(false),
    frame: text("frame"),
    borderColor: text("border_color"),
    frameEffects: text("frame_effects").array().notNull().default(sql`'{}'::text[]`),
    promoTypes: text("promo_types").array().notNull().default(sql`'{}'::text[]`),
    illustrationId: uuid("illustration_id"),
    scryfallUri: text("scryfall_uri"),
    games: text("games").array().notNull().default(sql`'{}'::text[]`),
    updatedAt: now("updated_at"),
  },
  (t) => [
    index("printings_oracle").on(t.oracleId),
    index("printings_set").on(t.setCode, t.collectorNumber),
    index("printings_artist_trgm").using("gin", sql`lower(${t.artist}) gin_trgm_ops`),
  ],
);

export const rulings = pgTable(
  "rulings",
  {
    id: serial("id").primaryKey(),
    oracleId: uuid("oracle_id").notNull(),
    source: text("source").notNull(),
    publishedAt: date("published_at").notNull(),
    comment: text("comment").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [index("rulings_oracle").on(t.oracleId), uniqueIndex("rulings_hash").on(t.hash)],
);

export const cardTags = pgTable(
  "card_tags",
  {
    oracleId: uuid("oracle_id").notNull(),
    tag: text("tag").notNull(),
    source: text("source").notNull().default("scryfall"),
  },
  (t) => [primaryKey({ columns: [t.oracleId, t.tag] }), index("card_tags_tag").on(t.tag)],
);

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    printingId: uuid("printing_id").notNull(),
    day: date("day").notNull(),
    usd: doublePrecision("usd"),
    usdFoil: doublePrecision("usd_foil"),
    eur: doublePrecision("eur"),
    eurFoil: doublePrecision("eur_foil"),
    tix: doublePrecision("tix"),
  },
  (t) => [primaryKey({ columns: [t.printingId, t.day] })],
);

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  source: text("source").notNull(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  startedAt: now("started_at"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
  error: text("error"),
});

/* ───────────── Decks ───────────── */

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    createdAt: now("created_at"),
  },
  (t) => [index("folders_user").on(t.userId)],
);

export const decks = pgTable(
  "decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    format: text("format").notNull().default("commander"),
    description: text("description").notNull().default(""),
    primer: text("primer").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Reusable card package rather than a playable deck. */
    isPackage: boolean("is_package").notNull().default(false),
    targetBracket: integer("target_bracket"),
    budgetAmount: doublePrecision("budget_amount"),
    budgetCurrency: text("budget_currency").notNull().default("eur"),
    coverPrintingId: uuid("cover_printing_id"),
    autoApplyAi: boolean("auto_apply_ai").notNull().default(false),
    /** Category order and settings: [{ name, color?, includeInDeck }]. */
    categoryOrder: jsonb("category_order")
      .$type<{ name: string; includeInDeck?: boolean }[]>()
      .notNull()
      .default([]),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("decks_user").on(t.userId, t.updatedAt)],
);

export const deckCards = pgTable(
  "deck_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    oracleId: uuid("oracle_id")
      .notNull()
      .references(() => oracleCards.id),
    printingId: uuid("printing_id").references(() => printings.id, { onDelete: "set null" }),
    qty: integer("qty").notNull().default(1),
    zone: text("zone").notNull().default("mainboard"),
    categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    finish: text("finish").notNull().default("nonfoil"),
    addedAt: now("added_at"),
  },
  (t) => [
    index("deck_cards_deck").on(t.deckId),
    uniqueIndex("deck_cards_unique").on(t.deckId, t.oracleId, t.zone),
  ],
);

export const deckEvents = pgTable(
  "deck_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    source: text("source").notNull().default("user"),
    kind: text("kind").notNull(),
    summary: text("summary").notNull().default(""),
    /** Forward and inverse operations, so any event can be undone. */
    payload: jsonb("payload").$type<{ ops: unknown[]; inverse: unknown[] }>().notNull(),
    changeSetId: uuid("change_set_id"),
    /** Event this one undoes/redoes. kind: "edit" | "undo" | "redo" | "restore" | "import". */
    refId: bigint("ref_id", { mode: "number" }),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    redoneAt: timestamp("redone_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [index("deck_events_deck").on(t.deckId, t.id)],
);

export const deckVersions = pgTable(
  "deck_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: text("source").notNull().default("user"),
    snapshot: jsonb("snapshot").$type<DeckSnapshot>().notNull(),
    createdAt: now("created_at"),
  },
  (t) => [index("deck_versions_deck").on(t.deckId, t.createdAt)],
);

export interface DeckSnapshot {
  name: string;
  format: string;
  cards: {
    oracleId: string;
    printingId: string | null;
    qty: number;
    zone: string;
    categories: string[];
    tags: string[];
    finish: string;
  }[];
}

/* ───────────── Collection ───────────── */

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("My collection"),
  createdAt: now("created_at"),
});

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    printingId: uuid("printing_id")
      .notNull()
      .references(() => printings.id),
    oracleId: uuid("oracle_id").notNull(),
    finish: text("finish").notNull().default("nonfoil"),
    qty: integer("qty").notNull().default(1),
    condition: text("condition").notNull().default("NM"),
    language: text("language").notNull().default("en"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.printingId, t.finish, t.condition, t.language] }),
    index("collection_items_oracle").on(t.collectionId, t.oracleId),
  ],
);

/* ───────────── AI chat ───────────── */

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deckId: uuid("deck_id").references(() => decks.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("chat_threads_deck").on(t.deckId, t.updatedAt)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    /** Anthropic content blocks, including tool_use and tool_result. */
    content: jsonb("content").$type<unknown[]>().notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: now("created_at"),
  },
  (t) => [index("chat_messages_thread").on(t.threadId, t.createdAt)],
);

export const changeSets = pgTable(
  "change_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => chatThreads.id, { onDelete: "set null" }),
    summary: text("summary").notNull().default(""),
    status: text("status").notNull().default("pending"),
    createdAt: now("created_at"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("change_sets_deck").on(t.deckId, t.status)],
);

export const changeSetItems = pgTable(
  "change_set_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    changeSetId: uuid("change_set_id")
      .notNull()
      .references(() => changeSets.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    action: text("action").notNull(),
    oracleId: uuid("oracle_id").notNull(),
    /** For swap: the card coming in. */
    toOracleId: uuid("to_oracle_id"),
    qty: integer("qty").notNull().default(1),
    fromZone: text("from_zone"),
    toZone: text("to_zone"),
    category: text("category"),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("pending"),
  },
  (t) => [index("change_set_items_set").on(t.changeSetId)],
);

/* ───────────── Settings ───────────── */

export const settings = pgTable(
  "settings",
  {
    id: serial("id").primaryKey(),
    /** "global" for app-wide settings (e.g. bracket config overrides). */
    scope: text("scope").notNull().default("global"),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("settings_scope_key").on(t.scope, t.key)],
);
