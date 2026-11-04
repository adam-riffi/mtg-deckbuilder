import { searchCards } from "@mtg/db";
import { route, searchParams } from "@/server/http";

export const GET = route(async ({ req, db }) => {
  const sp = searchParams(req);
  const q = sp.get("q") ?? "";
  const limit = Number(sp.get("limit") ?? 60);
  const offset = Number(sp.get("offset") ?? 0);
  const r = await searchCards(db, q, { limit, offset });
  return { total: r.total, tookMs: r.tookMs, errors: r.query.errors, hits: r.hits };
});
