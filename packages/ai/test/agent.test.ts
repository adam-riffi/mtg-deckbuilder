import type { Db } from "@mtg/db";
import {
  applyOps,
  createDeck,
  createThread,
  getCardsByNames,
  getDeckLines,
  ingestCardList,
  listChangeSets,
  listMessages,
  resolveChangeSet,
  schema,
} from "@mtg/db";
import { createTestDb } from "@mtg/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SAMPLE } from "../../db/test/sample";
import { buildHistory, type ChatEvent, runChatTurn } from "../src/agent";
import type { ChatProvider, TurnRequest, TurnResult } from "../src/provider";
import { unverifiedMentions } from "../src/tools";

/** Scripted provider: each call returns the next canned assistant turn. Records requests. */
class FakeProvider implements ChatProvider {
  requests: TurnRequest[] = [];
  constructor(private script: TurnResult["content"][]) {}
  async turn(req: TurnRequest, onEvent: (e: { type: "text"; text: string }) => void): Promise<TurnResult> {
    this.requests.push(structuredClone(req));
    const content = this.script.shift() ?? [{ type: "text", text: "done", citations: null }];
    for (const b of content) if (b.type === "text") onEvent({ type: "text", text: b.text });
    return {
      content,
      stopReason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
      servedBy: req.model,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }
  async complete() {
    return {
      text: "Simic ramp build",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }
}

const tool = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use" as const, id, name, input, caller: undefined }) as never;
const text = (t: string) => ({ type: "text" as const, text: t, citations: null }) as never;

let db: Db;
let close: () => Promise<void>;
let deckId: string;
const uid = "u1";

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await ingestCardList(db, SAMPLE);
  await db.insert(schema.user).values({ id: uid, name: "T", email: "t@x.y" });
  const d = await createDeck(db, uid, { name: "Simic", format: "commander" });
  deckId = d.id;
  const m = await getCardsByNames(db, ["test legend of growth", "forest"]);
  await applyOps(db, uid, deckId, [
    { op: "add", oracleId: m.get("test legend of growth")!.id, qty: 1, zone: "commander" },
    { op: "add", oracleId: m.get("forest")!.id, qty: 30, zone: "mainboard" },
  ]);
}, 60_000);
afterAll(async () => close?.());

describe("runChatTurn", () => {
  it("runs tools, creates a pending change set and never edits the deck", async () => {
    const provider = new FakeProvider([
      [text("Let me look."), tool("t1", "search_cards", { query: "t:creature id<=simic" })],
      [
        tool("t2", "propose_changes", {
          summary: "Add a mana elf",
          changes: [
            { action: "add", card: "Llanowar Elves", reason: "Ramp", category: "Ramp" },
            { action: "add", card: "Made Up Card", reason: "x" },
          ],
        }),
      ],
      [text("I proposed adding [[Llanowar Elves]]. Also consider [[Imaginary Dragon]].")],
    ]);
    const thread = await createThread(db, uid, deckId, "claude-sonnet-5-5");
    const events: ChatEvent[] = [];
    await runChatTurn({
      db,
      provider,
      userId: uid,
      threadId: thread.id,
      text: "Add some ramp",
      emit: (e) => events.push(e),
    });

    // Deck summary is in the user turn, not the system prompt; system and tools are identical each request.
    const first = provider.requests[0]!;
    const userBlocks = first.messages.at(-1)!.content as { text: string }[];
    expect(userBlocks[0]!.text).toContain("<deck_summary>");
    expect(userBlocks[0]!.text).toContain("Test Legend of Growth");
    expect(
      provider.requests.every(
        (r) => r.system === first.system && JSON.stringify(r.tools) === JSON.stringify(first.tools),
      ),
    ).toBe(true);

    // propose_changes reported the unknown card back to the model and created a change set for the rest.
    const toolResult = (provider.requests[2]!.messages.at(-1)!.content as { content: string }[])[0]!.content;
    expect(JSON.parse(toolResult)).toMatchObject({ created: true, pending_items: 1 });
    expect(toolResult).toContain("unknown card");

    const sets = await listChangeSets(db, uid, deckId, "pending");
    expect(sets).toHaveLength(1);
    expect(sets[0]!.items[0]!.card?.card.name).toBe("Llanowar Elves");
    expect((await getDeckLines(db, deckId)).length).toBe(2);
    expect(events.some((e) => e.type === "change_set")).toBe(true);

    // Unverified names in prose are flagged.
    const v = events.find((e) => e.type === "verification") as Extract<ChatEvent, { type: "verification" }>;
    expect(v.unverified).toEqual(["Imaginary Dragon"]);

    // Messages persisted: user, assistant, tool results, assistant, tool results, assistant.
    const rows = await listMessages(db, thread.id);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
    const done = events.find((e) => e.type === "done") as Extract<ChatEvent, { type: "done" }>;
    expect(done.costUsd).toBeCloseTo((3 * (100 * 2 + 50 * 10)) / 1e6, 10);

    // Accepting applies with source "ai".
    const r = await resolveChangeSet(db, uid, sets[0]!.id, "all");
    expect(r.status).toBe("applied");
    expect((await getDeckLines(db, deckId)).some((l) => l.categories.includes("Ramp"))).toBe(true);
  });

  it("validates tool input and returns errors to the model", async () => {
    const provider = new FakeProvider([[tool("t1", "search_cards", { query: "" })], [text("ok")]]);
    const thread = await createThread(db, uid, deckId, "claude-sonnet-5-5");
    await runChatTurn({ db, provider, userId: uid, threadId: thread.id, text: "hi", emit: () => {} });
    const res = (
      provider.requests[1]!.messages.at(-1)!.content as { content: string; is_error?: boolean }[]
    )[0]!;
    expect(res.is_error).toBe(true);
    expect(res.content).toContain("Invalid input");
  });
});

describe("history", () => {
  it("adds cancelled results for interrupted tool calls and collects verified names", () => {
    const verified = new Set<string>();
    const h = buildHistory(
      [
        { role: "user", content: [{ type: "text", text: "hi" }] },
        { role: "assistant", content: [{ type: "tool_use", id: "a", name: "get_deck", input: {} }] },
        { role: "user", content: [{ type: "text", text: "again" }] },
        { role: "assistant", content: [{ type: "tool_use", id: "b", name: "get_deck", input: {} }] },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "b",
              content: JSON.stringify({ cards: [{ name: "Fire // Ice" }] }),
            },
          ],
        },
      ],
      verified,
    );
    expect(h).toHaveLength(6);
    expect(h[2]).toMatchObject({ role: "user", content: [{ tool_use_id: "a", is_error: true }] });
    expect(verified.has("fire")).toBe(true);
    expect(unverifiedMentions("Try [[Fire]] and [[Ice Storm]]", verified)).toEqual(["Ice Storm"]);
  });
});
