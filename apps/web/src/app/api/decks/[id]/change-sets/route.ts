import { listChangeSets } from "@mtg/db";
import { route, searchParams } from "@/server/http";

export const GET = route<{ id: string }>(async ({ req, db, user, params }) => {
  const status = searchParams(req).get("status") ?? undefined;
  return { changeSets: await listChangeSets(db, user.id, params.id, status) };
});
