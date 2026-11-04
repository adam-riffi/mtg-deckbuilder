import { z } from "zod";
import type { Card, Finish, Printing } from "./card";
import { type Color, sortColors } from "./colors";

export const ZONES = ["commander", "mainboard", "sideboard", "maybeboard", "companion"] as const;
export type Zone = (typeof ZONES)[number];
export const zoneSchema = z.enum(ZONES);

export const ZONE_LABELS: Record<Zone, string> = {
  commander: "Commander",
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  maybeboard: "Maybeboard",
  companion: "Companion",
};

/** Zones that count towards deck size and legality. */
export const PLAYED_ZONES: readonly Zone[] = ["commander", "mainboard"];

export const deckCardSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  printingId: z.string().nullable(),
  qty: z.number().int().min(1).max(999),
  zone: zoneSchema,
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  finish: z.enum(["nonfoil", "foil", "etched"]).default("nonfoil"),
});
export type DeckCard = z.infer<typeof deckCardSchema>;

export interface DeckEntry extends DeckCard {
  card: Card;
  printing: Printing | null;
}

export interface DeckModel {
  id: string;
  name: string;
  format: string;
  entries: DeckEntry[];
  budget?: { amount: number; currency: "eur" | "usd" } | null;
  targetBracket?: number | null;
}

export function entriesIn(entries: readonly DeckEntry[], zones: readonly Zone[]): DeckEntry[] {
  return entries.filter((e) => zones.includes(e.zone));
}

export function countCards(entries: readonly DeckEntry[], zones: readonly Zone[] = PLAYED_ZONES): number {
  return entriesIn(entries, zones).reduce((n, e) => n + e.qty, 0);
}

export function commanders(entries: readonly DeckEntry[]): DeckEntry[] {
  return entries.filter((e) => e.zone === "commander");
}

/** Deck colour identity: union of commanders' identities (or of all played cards if no commander). */
export function deckColorIdentity(entries: readonly DeckEntry[]): Color[] {
  const cmd = commanders(entries);
  const src = cmd.length > 0 ? cmd : entriesIn(entries, PLAYED_ZONES);
  return sortColors(src.flatMap((e) => e.card.colorIdentity));
}

export const finishSchema = z.enum(["nonfoil", "foil", "etched"]);
export type { Finish };
