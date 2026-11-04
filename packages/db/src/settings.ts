import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import { settings } from "./schema";

export const userScope = (userId: string) => `user:${userId}`;

export async function getSetting<T>(db: Db, scope: string, key: string): Promise<T | null> {
  const [r] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.scope, scope), eq(settings.key, key)));
  return (r?.value as T) ?? null;
}

export async function setSetting(db: Db, scope: string, key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ scope, key, value })
    .onConflictDoUpdate({ target: [settings.scope, settings.key], set: { value, updatedAt: new Date() } });
}

export async function deleteSetting(db: Db, scope: string, key: string): Promise<void> {
  await db.delete(settings).where(and(eq(settings.scope, scope), eq(settings.key, key)));
}
