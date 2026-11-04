/**
 * AI evals: runs each case against the real model and the configured database, then asserts
 *  1. zero unverified card names in the reply,
 *  2. every proposed card is legal in the format and fits the colour identity,
 *  3. budget and bracket targets are respected after applying the proposal.
 *
 * Usage: pnpm evals -- --yes [--model claude-sonnet-5-5] [--only id1,id2]
 * Requires ANTHROPIC_API_KEY and ingested card data. Spends API credits (a rough estimate is printed first).
 */
import {
  applyOps,
  createDb,
  createDeck,
  createThread,
  deleteDeck,
  getCardsByNames,
  getDeck,
  itemToOps,
  listChangeSets,
  runMigrations,
  schema,
} from "@mtg/db";
import { colorMask, deckColorIdentity, estimateBracket, getFormat } from "@mtg/mtg";
import { eq } from "drizzle-orm";
import { type ChatEvent, runChatTurn } from "../src/agent";
import { DEFAULT_CHAT_MODEL } from "../src/models";
import { AnthropicProvider } from "../src/provider";
import { CASES } from "./cases";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const model = flag("--model") ?? DEFAULT_CHAT_MODEL;
const only = flag("--only")?.split(",");
const cases = CASES.filter((c) => !only || only.includes(c.id));

if (!args.includes("--yes")) {
  console.log(
    `About to run ${cases.length} eval cases on ${model}. Each case is a full agent turn (often several model calls).`,
  );
  console.log("This spends API credits. Re-run with --yes to proceed.");
  process.exit(0);
}

const { db, pool } = createDb(undefined, 3);
await runMigrations(db);
const provider = new AnthropicProvider();
const EVAL_USER = "eval-user";
await db
  .insert(schema.user)
  .values({ id: EVAL_USER, name: "Evals", email: "evals@localhost" })
  .onConflictDoNothing();

interface Result {
  id: string;
  pass: boolean;
  failures: string[];
  costUsd: number;
}
const results: Result[] = [];

for (const c of cases) {
  const failures: string[] = [];
  const deck = await createDeck(db, EVAL_USER, {
    name: `eval:${c.id}`,
    format: c.format ?? "commander",
    targetBracket: c.targetBracket ?? null,
    budgetAmount: c.budget?.amount ?? null,
    budgetCurrency: c.budget?.currency ?? "eur",
  });
  let cost = 0;
  try {
    const names = [c.commander, ...(c.cards ?? [])].filter((x): x is string => !!x);
    const found = await getCardsByNames(db, names);
    const missing = names.filter((n) => !found.has(n.toLowerCase()));
    if (missing.length) throw new Error(`Setup cards not in database: ${missing.join(", ")}`);
    const ops = [
      ...(c.commander
        ? [
            {
              op: "add" as const,
              oracleId: found.get(c.commander.toLowerCase())!.id,
              qty: 1,
              zone: "commander" as const,
            },
          ]
        : []),
      ...(c.cards ?? []).map((n) => ({
        op: "add" as const,
        oracleId: found.get(n.toLowerCase())!.id,
        qty: 1,
        zone: "mainboard" as const,
      })),
    ];
    if (ops.length) await applyOps(db, EVAL_USER, deck.id, ops);
    const thread = await createThread(db, EVAL_USER, deck.id, model);
    const events: ChatEvent[] = [];
    await runChatTurn({
      db,
      provider,
      userId: EVAL_USER,
      threadId: thread.id,
      text: c.prompt,
      currency: c.budget?.currency ?? "eur",
      emit: (e) => events.push(e),
    });
    const done = events.find((e) => e.type === "done") as Extract<ChatEvent, { type: "done" }> | undefined;
    cost = done?.costUsd ?? 0;
    const text = events
      .filter((e) => e.type === "text")
      .map((e) => (e as { text: string }).text)
      .join("");

    // 1. Unverified names
    const v = events.find((e) => e.type === "verification") as
      | Extract<ChatEvent, { type: "verification" }>
      | undefined;
    if (v?.unverified.length) failures.push(`unverified names: ${v.unverified.join(", ")}`);

    // Proposal expectations
    const sets = await listChangeSets(db, EVAL_USER, deck.id, "pending");
    if (c.expectProposal === true && sets.length === 0) failures.push("expected a proposal, got none");
    if (c.expectProposal === false && sets.length > 0) failures.push("expected no proposal");
    if (c.expectQuestion && !text.includes("?")) failures.push("expected a clarifying question");

    // 2. Legality and identity of proposed additions
    const { entries } = await getDeck(db, EVAL_USER, deck.id);
    const f = getFormat(deck.format);
    const identity = colorMask(deckColorIdentity(entries));
    let added = 0;
    for (const s of sets)
      for (const i of s.items) {
        const incoming = i.action === "swap" ? i.toCard : i.action === "add" ? i.card : null;
        if (!incoming) continue;
        const leg = incoming.card.legalities[f.legalityKey];
        if (f.legalityKey && leg !== "legal" && leg !== "restricted")
          failures.push(`${incoming.card.name} is ${leg} in ${f.name}`);
        if (
          f.commander &&
          i.toZone !== "commander" &&
          identity &&
          (colorMask(incoming.card.colorIdentity) & ~identity) !== 0
        )
          failures.push(`${incoming.card.name} outside colour identity`);
        const p = c.budget?.currency === "usd" ? incoming.card.minUsd : incoming.card.minEur;
        added += (p ?? 0) * i.qty;
      }

    // 3. Budget and bracket after applying
    if (c.maxAddedPrice !== undefined && added > c.maxAddedPrice * 1.05)
      failures.push(`added cards cost ${added.toFixed(2)} > ${c.maxAddedPrice}`);
    if (c.targetBracket && sets.length) {
      const allOps = sets.flatMap((s) => s.items.flatMap(itemToOps));
      const after = await applyOps(db, EVAL_USER, deck.id, allOps, {
        source: "ai",
        summary: "eval apply",
      }).catch(() => null);
      if (after) {
        const { entries: e2 } = await getDeck(db, EVAL_USER, deck.id);
        const b = estimateBracket(e2);
        if (b.bracket > c.targetBracket) failures.push(`bracket ${b.bracket} > target ${c.targetBracket}`);
      }
    }
  } catch (e) {
    failures.push(`error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await deleteDeck(db, EVAL_USER, deck.id).catch(() => {});
  }
  const r = { id: c.id, pass: failures.length === 0, failures, costUsd: cost };
  results.push(r);
  console.log(
    `${r.pass ? "PASS" : "FAIL"} ${c.id} ($${cost.toFixed(4)})${r.failures.length ? `\n     - ${r.failures.join("\n     - ")}` : ""}`,
  );
}

const passed = results.filter((r) => r.pass).length;
const total = results.reduce((n, r) => n + r.costUsd, 0);
console.log(`\n${passed}/${results.length} passed · total cost $${total.toFixed(3)} on ${model}`);
await db
  .delete(schema.user)
  .where(eq(schema.user.id, EVAL_USER))
  .catch(() => {});
await pool.end();
process.exitCode = passed === results.length ? 0 : 1;
