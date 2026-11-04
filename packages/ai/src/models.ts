/**
 * Model configuration. IDs and prices live here (not in code paths) so they can be updated in one place.
 * Prices are USD per million tokens (Anthropic first-party API). Cache writes (5-minute TTL) cost 1.25× input.
 */
export interface ModelConfig {
  id: string;
  label: string;
  role: string;
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  /** Server-side refusal fallback ("default" routing) is available for this model on the Claude API. */
  serverFallback: boolean;
  /** Default effort for chat turns on this model. */
  effort: "low" | "medium" | "high";
}

export const MODELS: Record<string, ModelConfig> = {
  "claude-sonnet-5-5": {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    role: "Default: everyday deckbuilding",
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.2,
    serverFallback: true,
    effort: "medium",
  },
  "claude-opus-5-5": {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    role: "Complex full builds",
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadPerMTok: 0.2,
    serverFallback: true,
    effort: "high",
  },
  "claude-haiku-5-5": {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    role: "Background tasks (titles, auto-categorisation)",
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    // Not listed in our pricing source; assumed at the usual 10% of input.
    cacheReadPerMTok: 0.01,
    serverFallback: false,
    effort: "low",
  },
};

export const DEFAULT_CHAT_MODEL = "claude-sonnet-5-5";
export const BUILD_MODEL = "claude-opus-5-5";
export const BACKGROUND_MODEL = "claude-haiku-5-5";

export function getModel(id: string | null | undefined): ModelConfig {
  return MODELS[id ?? ""] ?? MODELS[DEFAULT_CHAT_MODEL]!;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function costUsd(model: string, u: TokenUsage): number {
  const m = getModel(model);
  return (
    (u.inputTokens * m.inputPerMTok +
      u.cacheWriteTokens * m.inputPerMTok * 1.25 +
      u.cacheReadTokens * m.cacheReadPerMTok +
      u.outputTokens * m.outputPerMTok) /
    1e6
  );
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
