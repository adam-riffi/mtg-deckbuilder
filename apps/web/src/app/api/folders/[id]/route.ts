import { deleteFolder, updateFolder } from "@mtg/db";
import { z } from "zod";
import { body, route } from "@/server/http";

export const PATCH = route<{ id: string }>(async ({ req, db, user, params }) => {
  const patch = await body(
    req,
    z.object({
      name: z.string().trim().min(1).max(80).optional(),
      parentId: z.string().uuid().nullable().optional(),
    }),
  );
  return { folder: await updateFolder(db, user.id, params.id, patch) };
});

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await deleteFolder(db, user.id, params.id);
  return { ok: true };
});
