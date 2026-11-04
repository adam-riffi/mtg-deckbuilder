import { deckCollectionOverlay, getDeckRow, listCollection } from "@mtg/db";
import { route } from "@/server/http";

/** Owned/missing quantities for each deck line and cost to complete. */
export const GET = route<{ id: string }>(async ({ db, user, params }) => {
  await getDeckRow(db, user.id, params.id);
  const { summary } = await listCollection(db, user.id, { limit: 1 });
  if (!summary.cards) return { enabled: false, rows: [] };
  return { enabled: true, rows: await deckCollectionOverlay(db, user.id, params.id) };
});
