import { AnthropicProvider, type ChatEvent, MODELS, ProviderUnavailableError, runChatTurn } from "@mtg/ai";
import { getDb, getThread } from "@mtg/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().trim().min(1).max(20_000),
  model: z.enum(Object.keys(MODELS) as [string, ...string[]]).optional(),
  currency: z.enum(["eur", "usd"]).optional(),
});

/** Streams one assistant turn as server-sent events. Closing the request (client cancel) aborts the model call. */
export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { threadId } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = getDb();
  try {
    await getThread(db, user.id, threadId);
  } catch {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  let provider: AnthropicProvider;
  try {
    provider = new AnthropicProvider();
  } catch (e) {
    if (e instanceof ProviderUnavailableError)
      return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // client went away
        }
      };
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {}
      }, 15_000);
      try {
        await runChatTurn({
          db,
          provider,
          userId: user.id,
          threadId,
          text: parsed.data.text,
          model: parsed.data.model,
          currency: parsed.data.currency,
          signal: abort.signal,
          emit: send,
        });
      } catch (e) {
        // Never echo request details or the API key; log server-side without secrets.
        console.error("chat turn failed:", e instanceof Error ? e.message : "unknown error");
        send({
          type: "error",
          message:
            e instanceof Error ? e.message.replace(/sk-ant-[\w-]+/g, "[redacted]") : "The assistant failed.",
        });
      } finally {
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
