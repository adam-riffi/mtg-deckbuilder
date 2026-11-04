"use client";

import type { DeckEntry, Zone } from "@mtg/mtg";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { api, type CardHit, type DeckPayload } from "./api";
import { deckKey, hitPrinting, rememberCard } from "./use-deck";

export interface ChangeItem {
  id: string;
  action: "add" | "remove" | "move" | "swap";
  oracleId: string;
  toOracleId: string | null;
  qty: number;
  fromZone: Zone | null;
  toZone: Zone | null;
  category: string | null;
  reason: string;
  status: "pending" | "accepted" | "rejected";
  card: CardHit | null;
  toCard: CardHit | null;
}
export interface ChangeSet {
  id: string;
  threadId: string | null;
  summary: string;
  status: string;
  createdAt: string;
  items: ChangeItem[];
}

function ghostEntry(hit: CardHit, zone: Zone, qty: number, category: string | null): DeckEntry {
  rememberCard(hit.card, hitPrinting(hit));
  return {
    id: `ghost:${zone}:${hit.card.id}`,
    cardId: hit.card.id,
    printingId: null,
    qty,
    zone,
    categories: category ? [category] : [],
    tags: [],
    finish: "nonfoil",
    card: hit.card,
    printing: hitPrinting(hit),
  };
}

/** Pending AI change sets for a deck, with ghost entries for the editor and accept/reject actions. */
export function useChangeSets(deckId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["change-sets", deckId],
    queryFn: () => api<{ changeSets: ChangeSet[] }>(`/api/decks/${deckId}/change-sets`),
  });
  const sets = query.data?.changeSets ?? [];

  const { ghostAdds, ghostRemoves } = useMemo(() => {
    const adds: DeckEntry[] = [];
    const removes = new Set<string>();
    for (const s of sets)
      for (const i of s.items) {
        if (i.status !== "pending" || !i.card) continue;
        const from = i.fromZone ?? "mainboard";
        const to = i.toZone ?? "mainboard";
        if (i.action === "add") adds.push(ghostEntry(i.card, to, i.qty, i.category));
        if (i.action === "remove") removes.add(`${from}:${i.oracleId}`);
        if (i.action === "move") {
          removes.add(`${from}:${i.oracleId}`);
          adds.push(ghostEntry(i.card, to, i.qty, i.category));
        }
        if (i.action === "swap") {
          removes.add(`${from}:${i.oracleId}`);
          if (i.toCard) adds.push(ghostEntry(i.toCard, from, i.qty, i.category));
        }
      }
    // De-duplicate ghost adds of the same card/zone.
    const uniq = new Map(adds.map((a) => [a.id, a]));
    return { ghostAdds: [...uniq.values()], ghostRemoves: removes };
  }, [sets]);

  const resolve = useMutation({
    mutationFn: (v: { id: string; accept: string[] | "all"; reject: string[] | "rest" }) =>
      api<DeckPayload & { result: { applied: number; rejected: number; status: string } }>(
        `/api/change-sets/${v.id}`,
        { method: "POST", json: { accept: v.accept, reject: v.reject } },
      ),
    onSuccess: (d) => {
      qc.setQueryData(deckKey(deckId), { deck: d.deck, entries: d.entries });
      qc.invalidateQueries({ queryKey: ["change-sets", deckId] });
      qc.invalidateQueries({ queryKey: ["history", deckId] });
      if (d.result.applied)
        toast.success(
          `Applied ${d.result.applied} AI change${d.result.applied === 1 ? "" : "s"}. Undo is available.`,
        );
      else if (d.result.rejected)
        toast(`Rejected ${d.result.rejected} change${d.result.rejected === 1 ? "" : "s"}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return {
    sets,
    pending: sets.filter((s) => s.status === "pending"),
    ghostAdds,
    ghostRemoves,
    refresh: () => qc.invalidateQueries({ queryKey: ["change-sets", deckId] }),
    acceptAll: (id: string) => resolve.mutateAsync({ id, accept: "all", reject: [] }),
    rejectAll: (id: string) => resolve.mutateAsync({ id, accept: [], reject: "rest" }),
    acceptItem: (id: string, itemId: string) => resolve.mutateAsync({ id, accept: [itemId], reject: [] }),
    rejectItem: (id: string, itemId: string) => resolve.mutateAsync({ id, accept: [], reject: [itemId] }),
    resolving: resolve.isPending,
  };
}

export type ChangeSetsApi = ReturnType<typeof useChangeSets>;
