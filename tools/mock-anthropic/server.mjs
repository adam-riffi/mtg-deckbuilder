#!/usr/bin/env node
/**
 * Mock Anthropic Messages API for local end-to-end tests of the assistant (no API key, no network).
 *
 * It speaks enough of the streaming protocol for the official SDK and plays a fixed script:
 *   turn 1 (user text)                 -> short text + tool_use search_cards
 *   turn 2 (tool_result search_cards)  -> tool_use propose_changes with the first cards returned
 *   turn 3 (tool_result propose_*)     -> closing text naming the proposed cards as [[Card Name]]
 * Non-streaming requests (thread titles) return a short text.
 *
 * Usage:  node tools/mock-anthropic/server.mjs [port]      (default 8787)
 * Then run the app with ANTHROPIC_API_KEY=mock ANTHROPIC_BASE_URL=http://127.0.0.1:8787
 */
import http from "node:http";

const port = Number(process.argv[2] ?? process.env.MOCK_ANTHROPIC_PORT ?? 8787);

function lastUserBlocks(messages) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return [];
  return typeof last.content === "string" ? [{ type: "text", text: last.content }] : last.content;
}

function toolResult(blocks, name) {
  for (const b of blocks) {
    if (b.type !== "tool_result") continue;
    const text =
      typeof b.content === "string" ? b.content : (b.content ?? []).map((c) => c.text ?? "").join("");
    try {
      const parsed = JSON.parse(text);
      if (name === "search_cards" && Array.isArray(parsed.cards)) return parsed;
      if (name === "propose_changes" && "created" in parsed) return parsed;
    } catch {}
  }
  return null;
}

/** Decides the assistant content for this request. */
function script(body) {
  const blocks = lastUserBlocks(body.messages ?? []);
  const search = toolResult(blocks, "search_cards");
  const proposal = toolResult(blocks, "propose_changes");
  if (proposal) {
    const names = (global.__lastProposed ?? []).map((n) => `[[${n}]]`).join(" and ");
    return {
      stop: "end_turn",
      blocks: [
        {
          type: "text",
          text: `Done. I proposed adding ${names || "nothing"}. Review the change set and accept the lines you like.`,
        },
      ],
    };
  }
  if (search) {
    const picks = search.cards.filter((c) => !/land/i.test(c.type ?? "")).slice(0, 2);
    global.__lastProposed = picks.map((c) => c.name);
    const changes = picks.map((c) => ({
      action: "add",
      card: c.name,
      qty: 1,
      to_zone: "mainboard",
      category: "Mock",
      reason: `${c.name} fits the plan (mock reason).`,
    }));
    return {
      stop: "tool_use",
      blocks: [
        {
          type: "tool_use",
          id: "toolu_mock_2",
          name: "propose_changes",
          input: { summary: "Mock proposal", changes },
        },
      ],
    };
  }
  const userText = blocks
    .filter((b) => b.type === "text" && !String(b.text).startsWith("<deck_summary>"))
    .map((b) => b.text)
    .join("\n");
  const query = /ramp/i.test(userText) ? "otag:ramp" : "t:creature";
  return {
    stop: "tool_use",
    blocks: [
      { type: "text", text: "Let me look at a few cards first." },
      { type: "tool_use", id: "toolu_mock_1", name: "search_cards", input: { query, limit: 5 } },
    ],
  };
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function streamResponse(res, model, { stop, blocks }) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const usage = {
    input_tokens: 1200,
    output_tokens: 1,
    cache_creation_input_tokens: 800,
    cache_read_input_tokens: 400,
  };
  sse(res, "message_start", {
    type: "message_start",
    message: {
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage,
    },
  });
  let i = 0;
  const next = () => {
    if (i >= blocks.length) {
      sse(res, "message_delta", {
        type: "message_delta",
        delta: { stop_reason: stop, stop_sequence: null },
        usage: { output_tokens: 60 },
      });
      sse(res, "message_stop", { type: "message_stop" });
      res.end();
      return;
    }
    const b = blocks[i];
    const index = i;
    i++;
    if (b.type === "text") {
      sse(res, "content_block_start", {
        type: "content_block_start",
        index,
        content_block: { type: "text", text: "" },
      });
      const words = b.text.split(/(?<=\s)/);
      let w = 0;
      const tick = setInterval(() => {
        if (w < words.length)
          sse(res, "content_block_delta", {
            type: "content_block_delta",
            index,
            delta: { type: "text_delta", text: words[w++] },
          });
        else {
          clearInterval(tick);
          sse(res, "content_block_stop", { type: "content_block_stop", index });
          next();
        }
      }, 25);
    } else {
      sse(res, "content_block_start", {
        type: "content_block_start",
        index,
        content_block: { type: "tool_use", id: b.id, name: b.name, input: {} },
      });
      sse(res, "content_block_delta", {
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) },
      });
      sse(res, "content_block_stop", { type: "content_block_stop", index });
      setTimeout(next, 30);
    }
  };
  next();
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ type: "error", error: { type: "not_found_error", message: "mock: unknown route" } }),
    );
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const model = body.model ?? "claude-sonnet-5-5";
    if (body.stream) {
      streamResponse(res, model, script(body));
      return;
    }
    const text = (lastUserBlocks(body.messages ?? []).find((b) => b.type === "text")?.text ?? "").slice(
      0,
      40,
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "msg_mock_title",
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text: `Mock chat: ${text}` }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 6,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
    );
  });
});

server.listen(port, "127.0.0.1", () => console.log(`mock anthropic listening on http://127.0.0.1:${port}`));
