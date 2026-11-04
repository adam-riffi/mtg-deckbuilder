import { deckPriceHistory, getDeckRow } from "@mtg/db";
import { route } from "@/server/http";

export const GET = route<{ id: string }>(async ({ db, user, params }) => {
  await getDeckRow(db, user.id, params.id);
  return { points: await deckPriceHistory(db, params.id) };
});
