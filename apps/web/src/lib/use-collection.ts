"use client";

import { useQuery } from "@tanstack/react-query";
import { useEditor } from "@/stores/editor-store";
import { api } from "./api";
import { formatPrice } from "./utils";

export interface OverlayRow {
  oracleId: string;
  zone: string;
  need: number;
  owned: number;
  missing: number;
  cheapestEur: number | null;
  cheapestUsd: number | null;
}

/** Owned/missing overlay for a deck (only active once the user has a non-empty collection). */
export function useCollectionOverlay(deckId: string) {
  const currency = useEditor((s) => s.currency);
  const q = useQuery({
    queryKey: ["collection-overlay", deckId],
    queryFn: () => api<{ enabled: boolean; rows: OverlayRow[] }>(`/api/decks/${deckId}/collection`),
  });
  const rows = q.data?.rows ?? [];
  const byEntry = new Map(rows.map((r) => [`${r.zone}:${r.oracleId}`, r]));
  const played = rows.filter((r) => r.zone === "mainboard" || r.zone === "commander");
  const missing = played.reduce((n, r) => n + r.missing, 0);
  const cost = played.reduce(
    (n, r) => n + r.missing * ((currency === "eur" ? r.cheapestEur : r.cheapestUsd) ?? 0),
    0,
  );
  return { enabled: !!q.data?.enabled, byEntry, missing, cost, costLabel: formatPrice(cost, currency) };
}
