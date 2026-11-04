import type { CardDetail, CardHit, DeckRow } from "@mtg/db";
import type { DeckEntry } from "@mtg/mtg";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

/** Deck payload as serialised over JSON (dates become strings). */
export interface DeckPayload {
  deck: Omit<DeckRow, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
  entries: DeckEntry[];
}

export interface SearchResponse {
  total: number;
  tookMs: number;
  errors: string[];
  hits: CardHit[];
}

export type { CardDetail, CardHit };
