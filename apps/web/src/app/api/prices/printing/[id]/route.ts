import { printingPriceHistory } from "@mtg/db";
import { route } from "@/server/http";

export const GET = route<{ id: string }>(async ({ db, params }) => ({
  points: await printingPriceHistory(db, params.id),
}));
