import { listEvents } from "@mtg/db";
import { route } from "@/server/http";

export const GET = route<{ id: string }>(async ({ db, user, params }) => {
  const events = await listEvents(db, user.id, params.id, 200);
  return {
    events: events.map((e) => ({
      id: e.id,
      source: e.source,
      kind: e.kind,
      summary: e.summary,
      createdAt: e.createdAt,
      undone: !!e.undoneAt && !e.redoneAt,
      changeSetId: e.changeSetId,
    })),
  };
});
