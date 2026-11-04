import { z } from "zod";

export const SCRYFALL_API = "https://api.scryfall.com";
const USER_AGENT =
  process.env.SCRYFALL_USER_AGENT ??
  "mtg-deckbuilder-local/0.1 (+https://github.com/adam-riffi/mtg-deckbuilder)";
/** Scryfall asks for 50–100 ms between requests (≤10/s). */
const MIN_INTERVAL_MS = 120;
let last = 0;

export async function scryfallFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const wait = last + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const headers = new Headers(init.headers);
  headers.set("User-Agent", USER_AGENT);
  headers.set("Accept", url.startsWith(SCRYFALL_API) ? "application/json;q=0.9,*/*;q=0.8" : "*/*");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 4) return res;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    return res;
  }
}

export const bulkItemSchema = z.looseObject({
  type: z.string(),
  updated_at: z.string(),
  download_uri: z.string(),
  size: z.number().optional(),
  content_encoding: z.string().optional(),
});
export type BulkItem = z.infer<typeof bulkItemSchema>;

export async function listBulkData(): Promise<BulkItem[]> {
  const res = await scryfallFetch(`${SCRYFALL_API}/bulk-data`);
  if (!res.ok) throw new Error(`Scryfall bulk-data request failed: ${res.status}`);
  const body = z.object({ data: z.array(bulkItemSchema) }).parse(await res.json());
  return body.data;
}

/** Streams a bulk file's body (gzip is decoded by fetch). */
export async function downloadBulk(item: BulkItem): Promise<AsyncIterable<Uint8Array>> {
  const res = await scryfallFetch(item.download_uri);
  if (!res.ok || !res.body) throw new Error(`Download failed for ${item.type}: ${res.status}`);
  return res.body as unknown as AsyncIterable<Uint8Array>;
}
