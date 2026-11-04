import type { Card } from "./card";
import { frontFace } from "./card";
import type { FormatRules } from "./formats";

const lc = (s: string) => s.toLowerCase();

/** True if the card may be a commander in the given format (default: Commander). */
export function canBeCommander(card: Card, format?: FormatRules): boolean {
  const face = frontFace(card);
  const type = lc(face.typeLine);
  const text = lc(card.oracleText);
  if (text.includes("can be your commander")) return true;
  if (type.includes("legendary") && type.includes("creature")) return true;
  if (format?.planeswalkerCommanders && type.includes("legendary") && type.includes("planeswalker"))
    return true;
  if (isBackground(card)) return false;
  return false;
}

export function isBackground(card: Card): boolean {
  return /legendary enchantment\b.*\bbackground/i.test(frontFace(card).typeLine);
}

const hasKeyword = (card: Card, kw: string) => card.keywords.some((k) => lc(k) === lc(kw));

/** Name in "Partner with X" (null if absent). */
export function partnerWithName(card: Card): string | null {
  const m = /partner with ([^(\n]+?)(?:\s*\(|\n|$)/i.exec(card.oracleText);
  return m ? m[1]!.trim() : null;
}

/** "Partner—Survivors"-style variant, which only pairs with the same variant. */
export function partnerVariant(card: Card): string | null {
  const m = /^partner[—–-]([^(\n]+?)\s*(?:\(|$)/im.exec(card.oracleText);
  return m ? m[1]!.trim() : null;
}

export interface PairCheck {
  ok: boolean;
  reason: string;
}

/** Checks whether two commanders may be paired (partner, partner with, friends forever, backgrounds, Doctor). */
export function canPair(a: Card, b: Card): PairCheck {
  const pw = partnerWithName(a);
  const pwB = partnerWithName(b);
  if (pw || pwB) {
    if (pw && lc(pw) === lc(b.name)) return { ok: true, reason: `${a.name} has "Partner with ${b.name}".` };
    if (pwB && lc(pwB) === lc(a.name)) return { ok: true, reason: `${b.name} has "Partner with ${a.name}".` };
  }
  const va = partnerVariant(a);
  const vb = partnerVariant(b);
  if (va || vb) {
    if (va && vb && lc(va) === lc(vb)) return { ok: true, reason: `Both have Partner—${va}.` };
    return { ok: false, reason: "Partner variants must match." };
  }
  if (hasKeyword(a, "Partner") && hasKeyword(b, "Partner") && !pw && !pwB)
    return { ok: true, reason: "Both have Partner." };
  if (hasKeyword(a, "Friends forever") && hasKeyword(b, "Friends forever"))
    return { ok: true, reason: "Both have Friends forever." };
  const chooses = (c: Card) => /choose a background/i.test(c.oracleText);
  if ((chooses(a) && isBackground(b)) || (chooses(b) && isBackground(a)))
    return { ok: true, reason: "Commander with Choose a Background paired with a Background." };
  const companion = (c: Card) => /doctor's companion/i.test(c.oracleText);
  const timeLordDoctor = (c: Card) => /time lord doctor/i.test(frontFace(c).typeLine);
  if ((companion(a) && timeLordDoctor(b)) || (companion(b) && timeLordDoctor(a)))
    return { ok: true, reason: "Doctor's companion paired with a Time Lord Doctor." };
  return { ok: false, reason: `${a.name} and ${b.name} cannot be paired as commanders.` };
}

/** Number of copies a card may have regardless of the format's copy limit. null = unlimited. */
export function copyLimitOverride(card: Card): number | null | undefined {
  if (/\bbasic\b/i.test(frontFace(card).typeLine) && /\bland\b/i.test(frontFace(card).typeLine)) return null;
  if (/a deck can have any number of cards named/i.test(card.oracleText)) return null;
  const m = /a deck can have up to (\w+) cards named/i.exec(card.oracleText);
  if (m) {
    const words: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    const v = m[1]!.toLowerCase();
    return words[v] ?? (Number(v) || undefined);
  }
  return undefined;
}
