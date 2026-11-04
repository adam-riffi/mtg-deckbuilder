import { createFolder, listFolders } from "@mtg/db";
import { z } from "zod";
import { body, route } from "@/server/http";

export const GET = route(async ({ db, user }) => ({ folders: await listFolders(db, user.id) }));

export const POST = route(async ({ req, db, user }) => {
  const { name, parentId } = await body(
    req,
    z.object({ name: z.string().trim().min(1).max(80), parentId: z.string().uuid().nullish() }),
  );
  return { folder: await createFolder(db, user.id, name, parentId ?? null) };
});
