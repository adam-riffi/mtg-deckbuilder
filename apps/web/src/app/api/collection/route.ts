import { listCollection } from "@mtg/db";
import { route, searchParams } from "@/server/http";

export const GET = route(async ({ req, db, user }) => {
  const sp = searchParams(req);
  return listCollection(db, user.id, {
    q: sp.get("q") ?? undefined,
    limit: Number(sp.get("limit") ?? 200),
    offset: Number(sp.get("offset") ?? 0),
  });
});
