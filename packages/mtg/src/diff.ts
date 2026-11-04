import type { Zone } from "./deck";

export interface DiffLine {
  cardId: string;
  printingId?: string | null;
  qty: number;
  zone: Zone;
  categories?: string[];
}

export interface DeckDiff {
  added: { cardId: string; zone: Zone; qty: number }[];
  removed: { cardId: string; zone: Zone; qty: number }[];
  changed: { cardId: string; zone: Zone; from: number; to: number }[];
  printingChanged: { cardId: string; zone: Zone; from: string | null; to: string | null }[];
}

const key = (l: { cardId: string; zone: Zone }) => `${l.zone}|${l.cardId}`;

/** Diffs two deck snapshots by (zone, card). */
export function diffDecks(a: readonly DiffLine[], b: readonly DiffLine[]): DeckDiff {
  const sum = (lines: readonly DiffLine[]) => {
    const m = new Map<string, { cardId: string; zone: Zone; qty: number; printingId: string | null }>();
    for (const l of lines) {
      const k = key(l);
      const cur = m.get(k);
      m.set(k, {
        cardId: l.cardId,
        zone: l.zone,
        qty: (cur?.qty ?? 0) + l.qty,
        printingId: l.printingId ?? cur?.printingId ?? null,
      });
    }
    return m;
  };
  const A = sum(a);
  const B = sum(b);
  const out: DeckDiff = { added: [], removed: [], changed: [], printingChanged: [] };
  for (const [k, x] of B) {
    const y = A.get(k);
    if (!y) out.added.push({ cardId: x.cardId, zone: x.zone, qty: x.qty });
    else {
      if (y.qty !== x.qty) out.changed.push({ cardId: x.cardId, zone: x.zone, from: y.qty, to: x.qty });
      if (y.printingId !== x.printingId)
        out.printingChanged.push({ cardId: x.cardId, zone: x.zone, from: y.printingId, to: x.printingId });
    }
  }
  for (const [k, y] of A) if (!B.has(k)) out.removed.push({ cardId: y.cardId, zone: y.zone, qty: y.qty });
  return out;
}

export function isEmptyDiff(d: DeckDiff): boolean {
  return !d.added.length && !d.removed.length && !d.changed.length && !d.printingChanged.length;
}
