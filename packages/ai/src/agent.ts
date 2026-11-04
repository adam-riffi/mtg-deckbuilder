import { appendMessage, type Db, getDeck, getThread, listMessages, updateThread } from "@mtg/db";
import { addUsage, BACKGROUND_MODEL, costUsd, getModel, type TokenUsage, ZERO_USAGE } from "./models";
import { SYSTEM_PROMPT, TITLE_PROMPT } from "./prompt";
import {
  type Anthropic,
  type ChatProvider,
  type ContentBlock,
  isAbortError,
  type MessageParam,
} from "./provider";
import { deckSummary } from "./summary";
import { runTool, TOOL_DEFS, type ToolContext, unverifiedMentions } from "./tools";

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "thinking" }
  | { type: "tool"; id: string; name: string; status: "start" | "done" | "error"; detail?: string }
  | { type: "change_set"; id: string }
  | { type: "usage"; model: string; servedBy: string; usage: TokenUsage; costUsd: number }
  | { type: "verification"; unverified: string[] }
  | { type: "title"; title: string }
  | { type: "done"; stopReason: string | null; costUsd: number; usage: TokenUsage }
  | { type: "error"; message: string };

const MAX_ITERATIONS = 16;

/** Collects every "name" string found in a tool result (to rebuild the verified-card set from history). */
function collectNames(v: unknown, out: Set<string>) {
  if (Array.isArray(v)) for (const x of v) collectNames(x, out);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "name" && typeof x === "string") {
        out.add(x.toLowerCase());
        for (const part of x.split(" // ")) out.add(part.toLowerCase());
      } else collectNames(x, out);
    }
  }
}

type StoredBlock = { type: string; id?: string; tool_use_id?: string; content?: unknown; text?: string };

/**
 * Rebuilds API messages from storage. History is append-only (thinking blocks are passed back unchanged);
 * an interrupted tool call gets a synthetic "cancelled" result so the conversation stays valid.
 */
export function buildHistory(
  rows: { role: string; content: unknown[] }[],
  verified: Set<string>,
): MessageParam[] {
  const out: MessageParam[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const blocks = r.content as StoredBlock[];
    out.push({
      role: r.role as "user" | "assistant",
      content: r.content as Anthropic.Beta.BetaMessageContentParam,
    });
    if (r.role === "user") {
      for (const b of blocks) {
        if (b.type === "tool_result" && typeof b.content === "string") {
          try {
            collectNames(JSON.parse(b.content), verified);
          } catch {}
        }
      }
    }
    if (r.role === "assistant") {
      const uses = blocks.filter((b) => b.type === "tool_use").map((b) => b.id!);
      const next = rows[i + 1];
      const answered = new Set(
        next?.role === "user"
          ? (next.content as StoredBlock[]).filter((b) => b.type === "tool_result").map((b) => b.tool_use_id)
          : [],
      );
      const missing = uses.filter((id) => !answered.has(id));
      if (missing.length)
        out.push({
          role: "user",
          content: missing.map((id) => ({
            type: "tool_result" as const,
            tool_use_id: id,
            content: "Cancelled by the user.",
            is_error: true,
          })),
        });
    }
  }
  return out;
}

export interface RunTurnInput {
  db: Db;
  provider: ChatProvider;
  userId: string;
  threadId: string;
  text: string;
  currency?: "eur" | "usd";
  signal?: AbortSignal;
  emit: (e: ChatEvent) => void;
  /** Overrides the thread's model for this turn. */
  model?: string;
}

/** Runs one user turn: streams the reply, executes tools server-side, persists every message with usage and cost. */
export async function runChatTurn(input: RunTurnInput): Promise<void> {
  const { db, provider, userId, threadId, emit, signal } = input;
  const thread = await getThread(db, userId, threadId);
  if (!thread.deckId) throw new Error("Chat threads must belong to a deck");
  const model = getModel(input.model ?? thread.model).id;
  const { deck, entries } = await getDeck(db, userId, thread.deckId);
  const verified = new Set<string>();
  const history = buildHistory(await listMessages(db, threadId), verified);
  for (const e of entries) {
    verified.add(e.card.name.toLowerCase());
    for (const p of e.card.name.split(" // ")) verified.add(p.toLowerCase());
  }

  const summary = deckSummary(deck, entries, input.currency ?? "eur");
  const userContent = [
    { type: "text" as const, text: `<deck_summary>\n${summary}\n</deck_summary>` },
    { type: "text" as const, text: input.text },
  ];
  await appendMessage(db, threadId, "user", userContent, null);
  const messages: MessageParam[] = [...history, { role: "user", content: userContent }];
  if (thread.title === "New chat") void titleThread(input, model).catch(() => {});

  const ctx: ToolContext = {
    db,
    userId,
    deckId: thread.deckId,
    threadId,
    currency: input.currency ?? "eur",
    verified,
    onChangeSet: (id) => emit({ type: "change_set", id }),
  };
  let total: TokenUsage = ZERO_USAGE;
  let totalCost = 0;
  let stopReason: string | null = null;
  let prose = "";

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const res = await provider.turn(
        { model, system: SYSTEM_PROMPT, tools: TOOL_DEFS, messages, signal },
        (e) => {
          if (e.type === "text") {
            prose += e.text;
            emit({ type: "text", text: e.text });
          } else if (e.type === "thinking") emit({ type: "thinking" });
          else emit({ type: "tool", id: e.id, name: e.name, status: "start" });
        },
      );
      const cost = costUsd(model, res.usage);
      total = addUsage(total, res.usage);
      totalCost += cost;
      stopReason = res.stopReason;
      await appendMessage(db, threadId, "assistant", res.content as unknown[], res.servedBy, {
        ...res.usage,
        costUsd: cost,
      });
      emit({ type: "usage", model, servedBy: res.servedBy, usage: res.usage, costUsd: cost });
      messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaMessageContentParam });

      const uses = res.content.filter(
        (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
      );
      if (res.stopReason !== "tool_use" || uses.length === 0) break;
      // All tool results go back in one user message (keeps parallel tool use working).
      const results = await Promise.all(
        uses.map(async (u) => {
          const r = await runTool(u.name, u.input, ctx);
          emit({
            type: "tool",
            id: u.id,
            name: u.name,
            status: r.isError ? "error" : "done",
            detail: r.isError ? JSON.stringify(r.result).slice(0, 200) : undefined,
          });
          return {
            type: "tool_result" as const,
            tool_use_id: u.id,
            content: JSON.stringify(r.result),
            ...(r.isError ? { is_error: true } : {}),
          };
        }),
      );
      await appendMessage(db, threadId, "user", results, null);
      messages.push({ role: "user", content: results });
      if (signal?.aborted) break;
      if (iter === MAX_ITERATIONS - 1) stopReason = "max_iterations";
    }
  } catch (e) {
    if (isAbortError(e) || signal?.aborted) {
      emit({ type: "done", stopReason: "cancelled", costUsd: totalCost, usage: total });
      return;
    }
    throw e;
  }
  emit({ type: "verification", unverified: unverifiedMentions(prose, verified) });
  emit({ type: "done", stopReason, costUsd: totalCost, usage: total });
}

/** Names a new thread with the background model; the cost is recorded on the thread. */
async function titleThread(input: RunTurnInput, _chatModel: string) {
  const r = await input.provider.complete({
    model: BACKGROUND_MODEL,
    system: TITLE_PROMPT,
    prompt: input.text.slice(0, 2000),
    maxTokens: 40,
  });
  const title = r.text
    .trim()
    .replace(/^["']|["'.]$/g, "")
    .slice(0, 80);
  if (!title) return;
  await updateThread(input.db, input.userId, input.threadId, { title });
  await appendCost(input, r.usage);
  input.emit({ type: "title", title });
}

async function appendCost(input: RunTurnInput, usage: TokenUsage) {
  const { db } = input;
  const { chatThreads } = (await import("@mtg/db")).schema;
  const { eq, sql } = await import("drizzle-orm");
  await db
    .update(chatThreads)
    .set({
      costUsd: sql`${chatThreads.costUsd} + ${costUsd(BACKGROUND_MODEL, usage)}`,
      inputTokens: sql`${chatThreads.inputTokens} + ${usage.inputTokens}`,
      outputTokens: sql`${chatThreads.outputTokens} + ${usage.outputTokens}`,
    })
    .where(eq(chatThreads.id, input.threadId));
}
