import { deleteSetting, getSetting, lastSuccessfulRun, setSetting, userScope } from "@mtg/db";
import { bracketConfigSchema, DEFAULT_BRACKET_CONFIG } from "@mtg/mtg";
import { z } from "zod";
import { body, route } from "@/server/http";

export const GET = route(async ({ db, user }) => {
  const scope = userScope(user.id);
  const [currency, combos, brackets, bulk, fixtures] = await Promise.all([
    getSetting<"eur" | "usd">(db, scope, "currency"),
    getSetting<boolean>(db, scope, "combos.enabled"),
    getSetting<unknown>(db, "global", "brackets"),
    lastSuccessfulRun(db, "bulk"),
    lastSuccessfulRun(db, "fixtures"),
  ]);
  return {
    currency: currency ?? "eur",
    combosEnabled: combos ?? false,
    brackets: brackets ?? DEFAULT_BRACKET_CONFIG,
    bracketsCustomised: brackets !== null,
    aiConfigured: !!process.env.ANTHROPIC_API_KEY,
    ingest: { bulk, fixtures },
  };
});

const patch = z.object({
  currency: z.enum(["eur", "usd"]).optional(),
  combosEnabled: z.boolean().optional(),
  brackets: z.union([bracketConfigSchema, z.null()]).optional(),
});

export const PUT = route(async ({ req, db, user }) => {
  const p = await body(req, patch);
  const scope = userScope(user.id);
  if (p.currency) await setSetting(db, scope, "currency", p.currency);
  if (p.combosEnabled !== undefined) await setSetting(db, scope, "combos.enabled", p.combosEnabled);
  if (p.brackets === null) await deleteSetting(db, "global", "brackets");
  else if (p.brackets) await setSetting(db, "global", "brackets", p.brackets);
  return { ok: true };
});
