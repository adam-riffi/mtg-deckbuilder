import { getCardDetail, NotFoundError } from "@mtg/db";
import { route } from "@/server/http";

export const GET = route<{ id: string }>(async ({ db, params }) => {
  const d = await getCardDetail(db, params.id);
  if (!d) throw new NotFoundError("Card not found");
  return d;
});
