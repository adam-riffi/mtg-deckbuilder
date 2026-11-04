import { autocomplete } from "@mtg/db";
import { route, searchParams } from "@/server/http";

export const GET = route(async ({ req, db }) => {
  const q = searchParams(req).get("q") ?? "";
  return { results: await autocomplete(db, q, 12) };
});
