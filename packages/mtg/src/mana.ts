import { COLORS, type Color, isColor } from "./colors";

/** Splits a mana cost like "{2}{W}{U/P}" into its symbols ("2", "W", "U/P"). */
export function parseManaCost(cost: string | null | undefined): string[] {
  if (!cost) return [];
  const out: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null = re.exec(cost);
  while (m) {
    out.push(m[1]!.toUpperCase());
    m = re.exec(cost);
  }
  return out;
}

/** Mana value of a single symbol, following CR 202.3. */
export function symbolValue(sym: string): number {
  if (/^\d+$/.test(sym)) return Number(sym);
  if (sym === "X" || sym === "Y" || sym === "Z") return 0;
  if (sym === "½" || sym === "HW" || sym === "HR") return 0.5;
  if (sym === "∞") return 0;
  const parts = sym.split("/");
  // Hybrid with generic, e.g. {2/W}: counts the larger part (2).
  if (parts.length === 2 && /^\d+$/.test(parts[0]!)) return Number(parts[0]);
  return 1;
}

export function manaValue(cost: string | null | undefined): number {
  return parseManaCost(cost).reduce((n, s) => n + symbolValue(s), 0);
}

export type PipCounts = Record<Color, number> & { C: number };

export function emptyPips(): PipCounts {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

/** Counts coloured pips; hybrid symbols count once for each colour they contain. */
export function countPips(cost: string | null | undefined, into: PipCounts = emptyPips()): PipCounts {
  for (const sym of parseManaCost(cost)) {
    if (sym === "C") {
      into.C += 1;
      continue;
    }
    for (const part of sym.split("/")) {
      if (isColor(part)) into[part] += 1;
    }
  }
  return into;
}

/** Normalises a query value such as "2WW" or "{2}{W}{W}" into a sorted symbol multiset. */
export function normaliseManaQuery(q: string): string[] {
  if (q.includes("{")) return parseManaCost(q);
  const out: string[] = [];
  const s = q.toUpperCase();
  let i = 0;
  while (i < s.length) {
    const num = /^\d+/.exec(s.slice(i));
    if (num) {
      out.push(num[0]);
      i += num[0].length;
      continue;
    }
    out.push(s[i]!);
    i += 1;
  }
  return out;
}

/** True if `cost` contains at least the symbols in `query` (Scryfall m: semantics). */
export function manaCostContains(cost: string | null | undefined, query: string[]): boolean {
  const have = new Map<string, number>();
  for (const s of parseManaCost(cost)) have.set(s, (have.get(s) ?? 0) + 1);
  const need = new Map<string, number>();
  for (const s of query) need.set(s, (need.get(s) ?? 0) + 1);
  for (const [s, n] of need) {
    if (/^\d+$/.test(s)) {
      const generic = [...have.entries()]
        .filter(([k]) => /^\d+$/.test(k))
        .reduce((a, [k]) => a + Number(k), 0);
      if (generic < Number(s)) return false;
      continue;
    }
    if ((have.get(s) ?? 0) < n) return false;
  }
  return true;
}

export const MANA_COLORS: readonly (Color | "C")[] = [...COLORS, "C"];
