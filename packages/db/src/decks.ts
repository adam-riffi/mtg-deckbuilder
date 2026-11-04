import {
  applyDeckOps,
  type Card,
  type DeckEntry,
  type DeckLine,
  type DeckOp,
  describeOps,
  type Printing,
  type Zone,
} from "@mtg/mtg";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getCardsByIds, getPrintingsByIds } from "./cards";
import type { Db } from "./client";
import {
  type DeckSnapshot,
  deckCards,
  deckEvents,
  decks,
  deckVersions,
  folders,
  oracleCards,
} from "./schema";

export type DeckRow = typeof decks.$inferSelect;
export type EventSource = "user" | "ai" | "import" | "system";

export interface DeckWithCards {
  deck: DeckRow;
  entries: DeckEntry[];
}

export class NotFoundError extends Error {}

const toLine = (r: typeof deckCards.$inferSelect): DeckLine => ({
  oracleId: r.oracleId,
  zone: r.zone as Zone,
  qty: r.qty,
  printingId: r.printingId,
  categories: r.categories,
  tags: r.tags,
  finish: r.finish as DeckLine["finish"],
});

export async function listDecks(
  db: Db,
  userId: string,
  opts: { folderId?: string | null; packages?: boolean } = {},
) {
  const conds = [eq(decks.userId, userId)];
  if (opts.folderId !== undefined)
    conds.push(opts.folderId === null ? isNull(decks.folderId) : eq(decks.folderId, opts.folderId));
  if (opts.packages !== undefined) conds.push(eq(decks.isPackage, opts.packages));
  const rows = await db
    .select({
      deck: decks,
      count: sql<number>`coalesce((select sum(qty) from deck_cards dc where dc.deck_id = "decks"."id" and dc.zone in ('commander','mainboard')), 0)::int`,
      commanders: sql<
        string[]
      >`coalesce((select array_agg(o.name order by o.name) from deck_cards dc join oracle_cards o on o.id = dc.oracle_id where dc.deck_id = "decks"."id" and dc.zone = 'commander'), '{}')`,
      identity: sql<number>`coalesce((select bit_or(o.identity_mask) from deck_cards dc join oracle_cards o on o.id = dc.oracle_id where dc.deck_id = "decks"."id" and dc.zone in (case when exists (select 1 from deck_cards c2 where c2.deck_id = "decks"."id" and c2.zone = 'commander') then 'commander' else 'mainboard' end)), 0)::int`,
      cover: sql<
        string | null
      >`(select coalesce(p.image_uris->>'art_crop', p.face_image_uris->0->>'art_crop') from printings p where p.id = coalesce("decks"."cover_printing_id", (select coalesce(dc.printing_id, o.default_printing_id) from deck_cards dc join oracle_cards o on o.id = dc.oracle_id where dc.deck_id = "decks"."id" order by (dc.zone = 'commander') desc, dc.added_at limit 1)))`,
      priceEur: sql<number>`coalesce((select sum(dc.qty * coalesce(p.eur, p.eur_foil, o.min_eur)) from deck_cards dc join oracle_cards o on o.id = dc.oracle_id left join printings p on p.id = dc.printing_id where dc.deck_id = "decks"."id" and dc.zone in ('commander','mainboard')), 0)::float`,
      priceUsd: sql<number>`coalesce((select sum(dc.qty * coalesce(p.usd, p.usd_foil, o.min_usd)) from deck_cards dc join oracle_cards o on o.id = dc.oracle_id left join printings p on p.id = dc.printing_id where dc.deck_id = "decks"."id" and dc.zone in ('commander','mainboard')), 0)::float`,
    })
    .from(decks)
    .where(and(...conds))
    .orderBy(desc(decks.updatedAt));
  return rows;
}

export async function createDeck(
  db: Db,
  userId: string,
  input: Partial<typeof decks.$inferInsert> & { name: string },
): Promise<DeckRow> {
  const [row] = await db
    .insert(decks)
    .values({ ...input, userId })
    .returning();
  return row!;
}

export async function getDeckRow(db: Db, userId: string, deckId: string): Promise<DeckRow> {
  const [row] = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, deckId), eq(decks.userId, userId)));
  if (!row) throw new NotFoundError("Deck not found");
  return row;
}

export async function getDeckLines(db: Db, deckId: string): Promise<DeckLine[]> {
  const rows = await db
    .select()
    .from(deckCards)
    .where(eq(deckCards.deckId, deckId))
    .orderBy(deckCards.addedAt);
  return rows.map(toLine);
}

/**
 * Joins lines with card and printing data. Lines without a chosen printing get the card's default
 * printing attached (for images and prices) while keeping printingId null.
 */
export async function hydrate(db: Db, lines: DeckLine[]): Promise<DeckEntry[]> {
  const ids = [...new Set(lines.map((l) => l.oracleId))];
  const cards = await getCardsByIds(db, ids);
  const defaults = ids.length
    ? await db
        .select({ id: oracleCards.id, p: oracleCards.defaultPrintingId })
        .from(oracleCards)
        .where(inArray(oracleCards.id, ids))
    : [];
  const defaultOf = new Map(defaults.map((d) => [d.id, d.p]));
  const printIds = new Set<string>();
  for (const l of lines) {
    const p = l.printingId ?? defaultOf.get(l.oracleId);
    if (p) printIds.add(p);
  }
  const prints = await getPrintingsByIds(db, [...printIds]);
  const cById = new Map<string, Card>(cards.map((c) => [c.id, c]));
  const pById = new Map<string, Printing>(prints.map((p) => [p.id, p]));
  const out: DeckEntry[] = [];
  for (const l of lines) {
    const card = cById.get(l.oracleId);
    if (!card) continue;
    const pid = l.printingId ?? defaultOf.get(l.oracleId) ?? null;
    out.push({
      id: `${l.zone}:${l.oracleId}`,
      cardId: l.oracleId,
      printingId: l.printingId,
      qty: l.qty,
      zone: l.zone,
      categories: l.categories,
      tags: l.tags,
      finish: l.finish,
      card,
      printing: pid ? (pById.get(pid) ?? null) : null,
    });
  }
  return out;
}

export async function getDeck(db: Db, userId: string, deckId: string): Promise<DeckWithCards> {
  const deck = await getDeckRow(db, userId, deckId);
  return { deck, entries: await hydrate(db, await getDeckLines(db, deckId)) };
}

export async function updateDeckMeta(
  db: Db,
  userId: string,
  deckId: string,
  patch: Partial<
    Pick<
      typeof decks.$inferInsert,
      | "name"
      | "format"
      | "description"
      | "primer"
      | "tags"
      | "folderId"
      | "targetBracket"
      | "budgetAmount"
      | "budgetCurrency"
      | "coverPrintingId"
      | "autoApplyAi"
      | "categoryOrder"
      | "isPackage"
    >
  >,
): Promise<DeckRow> {
  await getDeckRow(db, userId, deckId);
  const [row] = await db
    .update(decks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(decks.id, deckId))
    .returning();
  return row!;
}

export async function deleteDeck(db: Db, userId: string, deckId: string): Promise<void> {
  await getDeckRow(db, userId, deckId);
  await db.delete(decks).where(eq(decks.id, deckId));
}

/** Writes the new line set by diffing against the current rows. */
async function persistLines(db: Db, deckId: string, before: DeckLine[], after: DeckLine[]): Promise<void> {
  const k = (l: DeckLine) => `${l.zone}|${l.oracleId}`;
  const b = new Map(before.map((l) => [k(l), l]));
  const a = new Map(after.map((l) => [k(l), l]));
  for (const [key, l] of b) {
    if (!a.has(key))
      await db
        .delete(deckCards)
        .where(
          and(eq(deckCards.deckId, deckId), eq(deckCards.oracleId, l.oracleId), eq(deckCards.zone, l.zone)),
        );
  }
  for (const [key, l] of a) {
    const prev = b.get(key);
    if (!prev) {
      await db.insert(deckCards).values({
        deckId,
        oracleId: l.oracleId,
        zone: l.zone,
        qty: l.qty,
        printingId: l.printingId,
        categories: l.categories,
        tags: l.tags,
        finish: l.finish,
      });
    } else if (JSON.stringify(prev) !== JSON.stringify(l)) {
      await db
        .update(deckCards)
        .set({
          qty: l.qty,
          printingId: l.printingId,
          categories: l.categories,
          tags: l.tags,
          finish: l.finish,
        })
        .where(
          and(eq(deckCards.deckId, deckId), eq(deckCards.oracleId, l.oracleId), eq(deckCards.zone, l.zone)),
        );
    }
  }
}

async function cardNames(db: Db, ids: string[]): Promise<(id: string) => string> {
  const cards = await getCardsByIds(db, [...new Set(ids)]);
  const m = new Map(cards.map((c) => [c.id, c.name]));
  return (id) => m.get(id) ?? "Unknown card";
}

const opIds = (ops: readonly DeckOp[]) => ops.map((o) => (o.op === "put" ? o.line.oracleId : o.oracleId));

export interface ApplyResult {
  eventId: number | null;
  lines: DeckLine[];
  summary: string;
}

/** Applies operations atomically and records an event with its inverse. */
export async function applyOps(
  db: Db,
  userId: string,
  deckId: string,
  ops: DeckOp[],
  opts: { source?: EventSource; kind?: string; summary?: string; changeSetId?: string; refId?: number } = {},
): Promise<ApplyResult> {
  await getDeckRow(db, userId, deckId);
  // Validate oracle ids exist (prevents FK errors and unverified cards).
  const ids = [...new Set(opIds(ops))];
  const known = new Set((await getCardsByIds(db, ids)).map((c) => c.id));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length) throw new NotFoundError(`Unknown card id(s): ${missing.join(", ")}`);
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const before = await getDeckLines(t, deckId);
    const { lines, inverse } = applyDeckOps(before, ops);
    if (JSON.stringify(before) === JSON.stringify(lines))
      return { eventId: null, lines, summary: "No change" };
    await persistLines(t, deckId, before, lines);
    const summary = opts.summary ?? describeOps(ops, await cardNames(t, ids));
    const [ev] = await t
      .insert(deckEvents)
      .values({
        deckId,
        userId,
        source: opts.source ?? "user",
        kind: opts.kind ?? "edit",
        summary,
        payload: { ops, inverse },
        changeSetId: opts.changeSetId ?? null,
        refId: opts.refId ?? null,
      })
      .returning({ id: deckEvents.id });
    await t.update(decks).set({ updatedAt: new Date() }).where(eq(decks.id, deckId));
    return { eventId: ev!.id, lines, summary };
  });
}

/** Undoes the most recent edit (or redo) that has not been undone. */
export async function undo(db: Db, userId: string, deckId: string): Promise<ApplyResult | null> {
  await getDeckRow(db, userId, deckId);
  const [ev] = await db
    .select()
    .from(deckEvents)
    .where(
      and(
        eq(deckEvents.deckId, deckId),
        isNull(deckEvents.undoneAt),
        inArray(deckEvents.kind, ["edit", "redo", "import", "restore"]),
      ),
    )
    .orderBy(desc(deckEvents.id))
    .limit(1);
  if (!ev) return null;
  const res = await applyOps(db, userId, deckId, ev.payload.inverse as DeckOp[], {
    kind: "undo",
    source: "user",
    summary: `Undo: ${ev.summary}`,
    refId: ev.id,
  });
  await db.update(deckEvents).set({ undoneAt: new Date() }).where(eq(deckEvents.id, ev.id));
  return res;
}

/** Redoes the most recently undone event, provided no new edit happened since. */
export async function redo(db: Db, userId: string, deckId: string): Promise<ApplyResult | null> {
  await getDeckRow(db, userId, deckId);
  const [last] = await db
    .select()
    .from(deckEvents)
    .where(eq(deckEvents.deckId, deckId))
    .orderBy(desc(deckEvents.id))
    .limit(1);
  // Walk back over undo events to find the target of the latest undo not yet redone.
  if (!last || (last.kind !== "undo" && last.kind !== "redo")) return null;
  const undos = await db
    .select()
    .from(deckEvents)
    .where(and(eq(deckEvents.deckId, deckId), eq(deckEvents.kind, "undo")))
    .orderBy(desc(deckEvents.id));
  for (const u of undos) {
    if (!u.refId) continue;
    const [target] = await db.select().from(deckEvents).where(eq(deckEvents.id, u.refId));
    if (!target || target.redoneAt) continue;
    // Only redo if nothing but undo/redo happened after the target was undone.
    const [newer] = await db
      .select({ id: deckEvents.id })
      .from(deckEvents)
      .where(
        and(
          eq(deckEvents.deckId, deckId),
          sql`${deckEvents.id} > ${u.id}`,
          inArray(deckEvents.kind, ["edit", "import", "restore"]),
        ),
      )
      .limit(1);
    if (newer) return null;
    const res = await applyOps(db, userId, deckId, target.payload.ops as DeckOp[], {
      kind: "redo",
      source: "user",
      summary: `Redo: ${target.summary}`,
      refId: target.id,
    });
    await db.update(deckEvents).set({ redoneAt: new Date() }).where(eq(deckEvents.id, target.id));
    return res;
  }
  return null;
}

export async function listEvents(db: Db, userId: string, deckId: string, limit = 100) {
  await getDeckRow(db, userId, deckId);
  return db
    .select()
    .from(deckEvents)
    .where(eq(deckEvents.deckId, deckId))
    .orderBy(desc(deckEvents.id))
    .limit(limit);
}

function snapshotOf(deck: DeckRow, lines: DeckLine[]): DeckSnapshot {
  return { name: deck.name, format: deck.format, cards: lines.map((l) => ({ ...l })) };
}

export async function createVersion(
  db: Db,
  userId: string,
  deckId: string,
  name: string,
  source: EventSource = "user",
) {
  const deck = await getDeckRow(db, userId, deckId);
  const [row] = await db
    .insert(deckVersions)
    .values({ deckId, name, source, snapshot: snapshotOf(deck, await getDeckLines(db, deckId)) })
    .returning();
  return row!;
}

export async function listVersions(db: Db, userId: string, deckId: string) {
  await getDeckRow(db, userId, deckId);
  return db
    .select()
    .from(deckVersions)
    .where(eq(deckVersions.deckId, deckId))
    .orderBy(desc(deckVersions.createdAt));
}

export async function getVersion(db: Db, userId: string, deckId: string, versionId: string) {
  await getDeckRow(db, userId, deckId);
  const [v] = await db
    .select()
    .from(deckVersions)
    .where(and(eq(deckVersions.id, versionId), eq(deckVersions.deckId, deckId)));
  if (!v) throw new NotFoundError("Version not found");
  return v;
}

/** Restores a version as a single undoable event. */
export async function restoreVersion(
  db: Db,
  userId: string,
  deckId: string,
  versionId: string,
): Promise<ApplyResult> {
  const v = await getVersion(db, userId, deckId, versionId);
  const current = await getDeckLines(db, deckId);
  const target = v.snapshot.cards as DeckLine[];
  const keep = new Set(target.map((l) => `${l.zone}|${l.oracleId}`));
  const ops: DeckOp[] = [
    ...current
      .filter((l) => !keep.has(`${l.zone}|${l.oracleId}`))
      .map((l): DeckOp => ({ op: "remove", oracleId: l.oracleId, zone: l.zone })),
    ...target.map((line): DeckOp => ({ op: "put", line })),
  ];
  return applyOps(db, userId, deckId, ops, { kind: "restore", summary: `Restored version "${v.name}"` });
}

/** Copies a deck (or package) with all its cards. */
export async function cloneDeck(db: Db, userId: string, deckId: string, name?: string): Promise<DeckRow> {
  const src = await getDeckRow(db, userId, deckId);
  const lines = await getDeckLines(db, deckId);
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
  const copy = await createDeck(db, userId, { ...rest, name: name ?? `${src.name} (copy)` });
  if (lines.length) await db.insert(deckCards).values(lines.map((l) => ({ ...l, deckId: copy.id })));
  return copy;
}

/* ───────────── Folders ───────────── */

export async function listFolders(db: Db, userId: string) {
  return db.select().from(folders).where(eq(folders.userId, userId)).orderBy(folders.name);
}

export async function createFolder(db: Db, userId: string, name: string, parentId: string | null = null) {
  const [f] = await db.insert(folders).values({ userId, name, parentId }).returning();
  return f!;
}

export async function updateFolder(
  db: Db,
  userId: string,
  id: string,
  patch: { name?: string; parentId?: string | null },
) {
  const [f] = await db
    .update(folders)
    .set(patch)
    .where(and(eq(folders.id, id), eq(folders.userId, userId)))
    .returning();
  if (!f) throw new NotFoundError("Folder not found");
  return f;
}

/** Deletes a folder; its decks move to the root (FK set null), child folders move up. */
export async function deleteFolder(db: Db, userId: string, id: string) {
  const [f] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, userId)));
  if (!f) throw new NotFoundError("Folder not found");
  await db.update(folders).set({ parentId: f.parentId }).where(eq(folders.parentId, id));
  await db.delete(folders).where(eq(folders.id, id));
}
