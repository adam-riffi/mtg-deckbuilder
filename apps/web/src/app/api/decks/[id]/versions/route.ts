import { createVersion, listVersions } from "@mtg/db";
import { z } from "zod";
import { body, route } from "@/server/http";

export const GET = route<{ id: string }>(async ({ db, user, params }) => {
  const versions = await listVersions(db, user.id, params.id);
  return {
    versions: versions.map((v) => ({
      id: v.id,
      name: v.name,
      source: v.source,
      createdAt: v.createdAt,
      count: v.snapshot.cards
        .filter((c) => c.zone === "mainboard" || c.zone === "commander")
        .reduce((n, c) => n + c.qty, 0),
    })),
  };
});

export const POST = route<{ id: string }>(async ({ req, db, user, params }) => {
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(120) }));
  return { version: await createVersion(db, user.id, params.id, name) };
});
