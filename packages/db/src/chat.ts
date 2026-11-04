import type { DeckOp } from "@mtg/mtg";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getCardsByIds, hitsFor } from "./cards";
import type { Db } from "./client";
import { applyOps, getDeckRow, NotFoundError } from "./decks";
import { changeSetItems, changeSets, chatMessages, chatThreads } from "./schema";

export type ThreadRow = typeof chatThreads.$inferSelect;
export type MessageRow = typeof chatMessages.$inferSelect;

export async function listThreads(db: Db, userId: string, deckId: string | null) {
  return db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.userId, userId),
        deckId ? eq(chatThreads.deckId, deckId) : sql`${chatThreads.deckId} is null`,
      ),
    )
    .orderBy(desc(chatThreads.updatedAt));
}

export async function createThread(
  db: Db,
  userId: string,
  deckId: string | null,
  model: string,
  title = "New chat",
) {
  if (deckId) await getDeckRow(db, userId, deckId);
  const [t] = await db.insert(chatThreads).values({ userId, deckId, model, title }).returning();
  return t!;
}

export async function getThread(db: Db, userId: string, threadId: string) {
  const [t] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)));
  if (!t) throw new NotFoundError("Thread not found");
  return t;
}

export async function updateThread(
  db: Db,
  userId: string,
  threadId: string,
  patch: { title?: string; model?: string },
) {
  await getThread(db, userId, threadId);
  const [t] = await db
    .update(chatThreads)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(chatThreads.id, threadId))
    .returning();
  return t!;
}

export async function deleteThread(db: Db, userId: string, threadId: string) {
  await getThread(db, userId, threadId);
  await db.delete(chatThreads).where(eq(chatThreads.id, threadId));
}

export async function listMessages(db: Db, threadId: string): Promise<MessageRow[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
}

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export async function appendMessage(
  db: Db,
  threadId: string,
  role: "user" | "assistant",
  content: unknown[],
  model: string | null,
  usage?: UsageRecord,
) {
  const [m] = await db
    .insert(chatMessages)
    .values({ threadId, role, content, model, ...(usage ?? {}), createdAt: new Date() })
    .returning();
  if (usage) {
    await db
      .update(chatThreads)
      .set({
        inputTokens: sql`${chatThreads.inputTokens} + ${usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens}`,
        outputTokens: sql`${chatThreads.outputTokens} + ${usage.outputTokens}`,
        costUsd: sql`${chatThreads.costUsd} + ${usage.costUsd}`,
        updatedAt: new Date(),
      })
      .where(eq(chatThreads.id, threadId));
  }
  return m!;
}

/** Total AI cost for a deck across its threads. */
export async function deckAiCost(
  db: Db,
  deckId: string,
): Promise<{ costUsd: number; inputTokens: number; outputTokens: number }> {
  const [r] = await db
    .select({
      costUsd: sql<number>`coalesce(sum(${chatThreads.costUsd}), 0)::float`,
      inputTokens: sql<number>`coalesce(sum(${chatThreads.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${chatThreads.outputTokens}), 0)::int`,
    })
    .from(chatThreads)
    .where(eq(chatThreads.deckId, deckId));
  return r ?? { costUsd: 0, inputTokens: 0, outputTokens: 0 };
}

/* ───────────── Change sets (AI proposals) ───────────── */

export type ChangeAction = "add" | "remove" | "move" | "swap";
export interface ChangeItemInput {
  action: ChangeAction;
  oracleId: string;
  toOracleId?: string | null;
  qty: number;
  fromZone?: string | null;
  toZone?: string | null;
  category?: string | null;
  reason: string;
}

export async function createChangeSet(
  db: Db,
  userId: string,
  deckId: string,
  threadId: string | null,
  summary: string,
  items: ChangeItemInput[],
) {
  await getDeckRow(db, userId, deckId);
  return db.transaction(async (tx) => {
    const [cs] = await tx.insert(changeSets).values({ deckId, threadId, summary }).returning();
    if (items.length)
      await tx.insert(changeSetItems).values(
        items.map((it, i) => ({
          changeSetId: cs!.id,
          position: i,
          action: it.action,
          oracleId: it.oracleId,
          toOracleId: it.toOracleId ?? null,
          qty: it.qty,
          fromZone: it.fromZone ?? null,
          toZone: it.toZone ?? null,
          category: it.category ?? null,
          reason: it.reason,
        })),
      );
    return cs!;
  });
}

export async function listChangeSets(db: Db, userId: string, deckId: string, status?: string) {
  await getDeckRow(db, userId, deckId);
  const sets = await db
    .select()
    .from(changeSets)
    .where(and(eq(changeSets.deckId, deckId), status ? eq(changeSets.status, status) : sql`true`))
    .orderBy(desc(changeSets.createdAt))
    .limit(50);
  if (!sets.length) return [];
  const items = await db
    .select()
    .from(changeSetItems)
    .where(
      inArray(
        changeSetItems.changeSetId,
        sets.map((s) => s.id),
      ),
    )
    .orderBy(asc(changeSetItems.position));
  const ids = [...new Set(items.flatMap((i) => [i.oracleId, i.toOracleId].filter((x): x is string => !!x)))];
  const hits = new Map((await hitsFor(db, ids)).map((h) => [h.card.id, h]));
  return sets.map((s) => ({
    ...s,
    items: items
      .filter((i) => i.changeSetId === s.id)
      .map((i) => ({
        ...i,
        card: hits.get(i.oracleId) ?? null,
        toCard: i.toOracleId ? (hits.get(i.toOracleId) ?? null) : null,
      })),
  }));
}

export function itemToOps(i: {
  action: string;
  oracleId: string;
  toOracleId: string | null;
  qty: number;
  fromZone: string | null;
  toZone: string | null;
  category: string | null;
}): DeckOp[] {
  const from = (i.fromZone ?? "mainboard") as "mainboard";
  const to = (i.toZone ?? "mainboard") as "mainboard";
  const cats = i.category ? [i.category] : undefined;
  switch (i.action) {
    case "add":
      return [{ op: "add", oracleId: i.oracleId, qty: i.qty, zone: to, categories: cats }];
    case "remove":
      return [{ op: "remove", oracleId: i.oracleId, zone: from, qty: i.qty }];
    case "move":
      return [{ op: "move", oracleId: i.oracleId, from, to, qty: i.qty }];
    case "swap":
      return i.toOracleId
        ? [
            { op: "remove", oracleId: i.oracleId, zone: from, qty: i.qty },
            { op: "add", oracleId: i.toOracleId, qty: i.qty, zone: from, categories: cats },
          ]
        : [];
    default:
      return [];
  }
}

/** Accepts and/or rejects items of a change set; accepted items are applied as one AI-sourced deck event. */
export async function resolveChangeSet(
  db: Db,
  userId: string,
  changeSetId: string,
  accept: string[] | "all",
  reject: string[] | "rest" = [],
) {
  const [cs] = await db.select().from(changeSets).where(eq(changeSets.id, changeSetId));
  if (!cs) throw new NotFoundError("Change set not found");
  await getDeckRow(db, userId, cs.deckId);
  const items = await db
    .select()
    .from(changeSetItems)
    .where(eq(changeSetItems.changeSetId, changeSetId))
    .orderBy(asc(changeSetItems.position));
  const pending = items.filter((i) => i.status === "pending");
  const acceptIds = new Set(accept === "all" ? pending.map((i) => i.id) : accept);
  const toApply = pending.filter((i) => acceptIds.has(i.id));
  const toReject =
    reject === "rest"
      ? pending.filter((i) => !acceptIds.has(i.id))
      : pending.filter((i) => reject.includes(i.id));
  let eventId: number | null = null;
  if (toApply.length) {
    const names = new Map(
      (
        await getCardsByIds(
          db,
          toApply.flatMap((i) => [i.oracleId, i.toOracleId].filter((x): x is string => !!x)),
        )
      ).map((c) => [c.id, c.name]),
    );
    const summary =
      `AI: ${cs.summary || toApply.map((i) => `${i.action} ${names.get(i.oracleId) ?? ""}`).join(", ")}`.slice(
        0,
        300,
      );
    const r = await applyOps(db, userId, cs.deckId, toApply.flatMap(itemToOps), {
      source: "ai",
      summary,
      changeSetId,
    });
    eventId = r.eventId;
    await db
      .update(changeSetItems)
      .set({ status: "accepted" })
      .where(
        inArray(
          changeSetItems.id,
          toApply.map((i) => i.id),
        ),
      );
  }
  if (toReject.length)
    await db
      .update(changeSetItems)
      .set({ status: "rejected" })
      .where(
        inArray(
          changeSetItems.id,
          toReject.map((i) => i.id),
        ),
      );
  const after = await db
    .select({ status: changeSetItems.status })
    .from(changeSetItems)
    .where(eq(changeSetItems.changeSetId, changeSetId));
  const statuses = new Set(after.map((a) => a.status));
  const status = statuses.has("pending")
    ? "pending"
    : statuses.size === 1
      ? statuses.has("accepted")
        ? "applied"
        : "rejected"
      : "partial";
  await db
    .update(changeSets)
    .set({ status, resolvedAt: status === "pending" ? null : new Date() })
    .where(eq(changeSets.id, changeSetId));
  return { deckId: cs.deckId, status, applied: toApply.length, rejected: toReject.length, eventId };
}
