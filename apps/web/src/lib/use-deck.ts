"use client";

import { applyDeckOps, type Card, type DeckEntry, type DeckLine, type DeckOp, type Printing } from "@mtg/mtg";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { api, type DeckPayload } from "./api";

/** Cards seen in search results etc., so optimistic adds can render immediately. */
const cardCache = new Map<string, { card: Card; printing?: Printing | null }>();
export function rememberCard(card: Card, printing?: Printing | null) {
  if (cardCache.has(card.id) && !printing) return;
  cardCache.set(card.id, { card, printing: printing ?? cardCache.get(card.id)?.printing ?? null });
}

export const deckKey = (id: string) => ["deck", id] as const;

export function entriesToLines(entries: DeckEntry[]): DeckLine[] {
  return entries.map((e) => ({
    oracleId: e.cardId,
    zone: e.zone,
    qty: e.qty,
    printingId: e.printingId,
    categories: e.categories,
    tags: e.tags,
    finish: e.finish,
  }));
}

/** Applies ops locally (same pure function as the server) for optimistic UI. */
export function optimisticEntries(entries: DeckEntry[], ops: DeckOp[]): DeckEntry[] {
  const known = new Map<string, { card: Card; printing: Printing | null }>();
  for (const e of entries) known.set(e.cardId, { card: e.card, printing: e.printing });
  const { lines } = applyDeckOps(entriesToLines(entries), ops);
  const out: DeckEntry[] = [];
  for (const l of lines) {
    const cached = cardCache.get(l.oracleId);
    const k =
      known.get(l.oracleId) ??
      (cached ? { card: cached.card, printing: cached.printing ?? null } : undefined);
    if (!k) continue;
    const printing =
      l.printingId && k.printing?.id !== l.printingId && cached?.printing?.id === l.printingId
        ? cached.printing
        : k.printing;
    out.push({
      id: `${l.zone}:${l.oracleId}`,
      cardId: l.oracleId,
      printingId: l.printingId,
      qty: l.qty,
      zone: l.zone,
      categories: l.categories,
      tags: l.tags,
      finish: l.finish,
      card: k.card,
      printing: printing ?? null,
    });
  }
  return out;
}

export function useDeck(deckId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: deckKey(deckId),
    queryFn: () => api<DeckPayload>(`/api/decks/${deckId}`),
  });

  const setData = useCallback((d: DeckPayload) => qc.setQueryData(deckKey(deckId), d), [qc, deckId]);

  const mutation = useMutation({
    mutationFn: (vars: { ops: DeckOp[]; summary?: string }) =>
      api<DeckPayload & { summary: string }>(`/api/decks/${deckId}/ops`, { method: "POST", json: vars }),
    onMutate: async ({ ops }) => {
      await qc.cancelQueries({ queryKey: deckKey(deckId) });
      const prev = qc.getQueryData<DeckPayload>(deckKey(deckId));
      if (prev) qc.setQueryData(deckKey(deckId), { ...prev, entries: optimisticEntries(prev.entries, ops) });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(deckKey(deckId), ctx.prev);
      toast.error(`Change failed: ${e.message}`);
    },
    onSuccess: (d) => {
      setData({ deck: d.deck, entries: d.entries });
      qc.invalidateQueries({ queryKey: ["history", deckId] });
    },
  });

  const historyAction = useMutation({
    mutationFn: (kind: "undo" | "redo") =>
      api<DeckPayload & { applied: boolean; summary: string | null }>(`/api/decks/${deckId}/${kind}`, {
        method: "POST",
      }),
    onSuccess: (d, kind) => {
      setData({ deck: d.deck, entries: d.entries });
      qc.invalidateQueries({ queryKey: ["history", deckId] });
      if (d.applied && d.summary) toast(d.summary);
      else toast(kind === "undo" ? "Nothing to undo" : "Nothing to redo");
    },
  });

  const patchMeta = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api<{ deck: DeckPayload["deck"] }>(`/api/decks/${deckId}`, { method: "PATCH", json: patch }),
    onMutate: (patch) => {
      const prev = qc.getQueryData<DeckPayload>(deckKey(deckId));
      if (prev) qc.setQueryData(deckKey(deckId), { ...prev, deck: { ...prev.deck, ...patch } });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(deckKey(deckId), ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (r) => {
      const prev = qc.getQueryData<DeckPayload>(deckKey(deckId));
      if (prev) qc.setQueryData(deckKey(deckId), { ...prev, deck: r.deck });
      qc.invalidateQueries({ queryKey: ["decks"] });
    },
  });

  return {
    ...query,
    apply: (ops: DeckOp[], summary?: string) => mutation.mutate({ ops, summary }),
    applyAsync: (ops: DeckOp[], summary?: string) => mutation.mutateAsync({ ops, summary }),
    undo: () => historyAction.mutate("undo"),
    redo: () => historyAction.mutate("redo"),
    patchMeta: (patch: Record<string, unknown>) => patchMeta.mutate(patch),
    setData,
    pending: mutation.isPending,
  };
}

/** Minimal printing object from a search hit (enough for images while the server responds). */
export function hitPrinting(hit: {
  card: Card;
  image: Printing["imageUris"];
  faceImages: Printing["faceImageUris"];
  printingId: string | null;
  setCode: string | null;
}): Printing | null {
  if (!hit.printingId) return null;
  return {
    id: hit.printingId,
    oracleId: hit.card.id,
    name: hit.card.name,
    setCode: hit.setCode ?? "",
    setName: "",
    collectorNumber: "",
    rarity: "common",
    lang: "en",
    releasedAt: "",
    artist: null,
    imageUris: hit.image,
    faceImageUris: hit.faceImages,
    finishes: ["nonfoil"],
    prices: {
      usd: hit.card.minUsd,
      usdFoil: null,
      usdEtched: null,
      eur: hit.card.minEur,
      eurFoil: null,
      tix: null,
    },
    promo: false,
    digital: false,
    fullArt: false,
    frame: null,
    borderColor: null,
    frameEffects: [],
    promoTypes: [],
    illustrationId: null,
    scryfallUri: null,
    games: [],
  };
}
