import Anthropic from "@anthropic-ai/sdk";
import { getModel, type TokenUsage } from "./models";

export type ContentBlock = Anthropic.Beta.BetaContentBlock;
export type MessageParam = Anthropic.Beta.BetaMessageParam;
export type ToolDef = Anthropic.Beta.BetaTool;

export interface TurnRequest {
  model: string;
  system: string;
  tools: ToolDef[];
  messages: MessageParam[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface TurnResult {
  content: ContentBlock[];
  stopReason: string | null;
  usage: TokenUsage;
  servedBy: string;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; id: string; name: string }
  | { type: "thinking" };

/** Provider interface so the agent loop does not depend on one vendor SDK. */
export interface ChatProvider {
  turn(req: TurnRequest, onEvent: (e: StreamEvent) => void): Promise<TurnResult>;
  complete(req: {
    model: string;
    system?: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<{ text: string; usage: TokenUsage }>;
}

export class ProviderUnavailableError extends Error {}

/** Anthropic implementation: streaming, prompt caching, retries, refusal fallback. The key never leaves the server. */
export class AnthropicProvider implements ChatProvider {
  private client: Anthropic;
  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey)
      throw new ProviderUnavailableError(
        "ANTHROPIC_API_KEY is not set. Add it to .env to enable the assistant.",
      );
    this.client = new Anthropic({ apiKey, maxRetries: 4 });
  }

  async turn(req: TurnRequest, onEvent: (e: StreamEvent) => void): Promise<TurnResult> {
    const m = getModel(req.model);
    // Cache breakpoints: last tool definition, the system prompt, and top-level auto-caching of the message history.
    const tools = req.tools.map((t, i) =>
      i === req.tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t,
    );
    const stream = this.client.beta.messages.stream(
      {
        model: m.id,
        max_tokens: req.maxTokens ?? 32000,
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        tools,
        messages: req.messages,
        cache_control: { type: "ephemeral" },
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: m.effort },
        ...(m.serverFallback
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      },
      { signal: req.signal ?? undefined },
    );
    for await (const ev of stream) {
      if (ev.type === "content_block_start") {
        if (ev.content_block.type === "tool_use")
          onEvent({ type: "tool_start", id: ev.content_block.id, name: ev.content_block.name });
        if (ev.content_block.type === "thinking") onEvent({ type: "thinking" });
      } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        onEvent({ type: "text", text: ev.delta.text });
      }
    }
    const msg = await stream.finalMessage();
    return {
      content: msg.content,
      stopReason: msg.stop_reason,
      servedBy: msg.model,
      usage: {
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }

  async complete(req: { model: string; system?: string; prompt: string; maxTokens?: number }) {
    const m = getModel(req.model);
    const res = await this.client.messages.create({
      model: m.id,
      max_tokens: req.maxTokens ?? 1024,
      ...(req.system ? { system: req.system } : {}),
      output_config: { effort: "low" },
      messages: [{ role: "user", content: req.prompt }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return {
      text,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Anthropic.APIUserAbortError || (e instanceof Error && e.name === "AbortError");
}

export { Anthropic };
