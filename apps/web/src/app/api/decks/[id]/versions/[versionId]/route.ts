import { getDeck, getVersion, hydrate, restoreVersion } from "@mtg/db";
import type { DeckLine } from "@mtg/mtg";
import { route } from "@/server/http";

type P = { id: string; versionId: string };

export const GET = route<P>(async ({ db, user, params }) => {
  const v = await getVersion(db, user.id, params.id, params.versionId);
  return {
    version: { id: v.id, name: v.name, createdAt: v.createdAt },
    entries: await hydrate(db, v.snapshot.cards as DeckLine[]),
  };
});

/** Restore this version (undoable). */
export const POST = route<P>(async ({ db, user, params }) => {
  const r = await restoreVersion(db, user.id, params.id, params.versionId);
  return { summary: r.summary, ...(await getDeck(db, user.id, params.id)) };
});
