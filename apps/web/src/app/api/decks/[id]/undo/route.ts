import { getDeck, undo } from "@mtg/db";
import { route } from "@/server/http";

export const POST = route<{ id: string }>(async ({ db, user, params }) => {
  const res = await undo(db, user.id, params.id);
  return { applied: !!res, summary: res?.summary ?? null, ...(await getDeck(db, user.id, params.id)) };
});
