import { colorMask } from "./colors";
import { canBeCommander, canPair, copyLimitOverride } from "./commander";
import { commanders, countCards, type DeckEntry, deckColorIdentity, entriesIn } from "./deck";
import { type FormatRules, getFormat } from "./formats";

export type IssueSeverity = "error" | "warning";
export interface LegalityIssue {
  severity: IssueSeverity;
  code:
    | "deck_size"
    | "sideboard_size"
    | "copies"
    | "banned"
    | "not_legal"
    | "restricted"
    | "color_identity"
    | "no_commander"
    | "too_many_commanders"
    | "invalid_commander"
    | "invalid_pair"
    | "commander_rarity"
    | "companion";
  message: string;
  cardIds: string[];
}

export interface LegalityReport {
  format: string;
  legal: boolean;
  issues: LegalityIssue[];
}

/** Validates a deck against a format: size, copies, bans, colour identity and commander rules. */
export function validateDeck(entries: readonly DeckEntry[], formatId: string): LegalityReport {
  const f = getFormat(formatId);
  const issues: LegalityIssue[] = [];
  const played = entriesIn(entries, ["commander", "mainboard"]);
  if (f.id === "casual") return { format: f.id, legal: true, issues };

  // Size
  const size = countCards(entries, ["commander", "mainboard"]);
  if (f.exactSize !== undefined && size !== f.exactSize) {
    issues.push({
      severity: "error",
      code: "deck_size",
      message: `Deck has ${size} cards; ${f.name} requires exactly ${f.exactSize}.`,
      cardIds: [],
    });
  } else if (size < f.minMain) {
    issues.push({
      severity: "error",
      code: "deck_size",
      message: `Deck has ${size} cards; ${f.name} requires at least ${f.minMain}.`,
      cardIds: [],
    });
  }
  const sb = countCards(entries, ["sideboard"]);
  if (sb > f.maxSideboard && !f.commander) {
    issues.push({
      severity: "error",
      code: "sideboard_size",
      message: `Sideboard has ${sb} cards; maximum is ${f.maxSideboard}.`,
      cardIds: [],
    });
  }

  // Copies (mainboard + sideboard + commander count together)
  const byName = new Map<string, { qty: number; entry: DeckEntry }>();
  for (const e of entriesIn(entries, ["commander", "mainboard", "sideboard", "companion"])) {
    const cur = byName.get(e.card.name);
    byName.set(e.card.name, { qty: (cur?.qty ?? 0) + e.qty, entry: e });
  }
  for (const [name, { qty, entry }] of byName) {
    const override = copyLimitOverride(entry.card);
    if (override === null) continue;
    const restricted = entry.card.legalities[f.legalityKey] === "restricted";
    const limit = restricted ? 1 : (override ?? f.maxCopies);
    if (qty > limit) {
      issues.push({
        severity: "error",
        code: restricted ? "restricted" : "copies",
        message: `${qty} copies of ${name}; limit is ${limit}${restricted ? " (restricted)" : ""}.`,
        cardIds: [entry.card.id],
      });
    }
  }

  // Bans / not legal
  for (const e of entriesIn(entries, ["commander", "mainboard", "sideboard", "companion"])) {
    const status = e.card.legalities[f.legalityKey] ?? "not_legal";
    if (status === "banned") {
      issues.push({
        severity: "error",
        code: "banned",
        message: `${e.card.name} is banned in ${f.name}.`,
        cardIds: [e.card.id],
      });
    } else if (status === "not_legal") {
      issues.push({
        severity: "error",
        code: "not_legal",
        message: `${e.card.name} is not legal in ${f.name}.`,
        cardIds: [e.card.id],
      });
    }
  }

  if (f.commander) issues.push(...commanderIssues(entries, f));

  // Companion: must fit colour identity in commander formats; condition is card-specific and only warned about.
  for (const e of entriesIn(entries, ["companion"])) {
    if (!e.card.keywords.some((k) => k.toLowerCase() === "companion")) {
      issues.push({
        severity: "error",
        code: "companion",
        message: `${e.card.name} does not have Companion.`,
        cardIds: [e.card.id],
      });
    }
  }
  void played;
  return { format: f.id, legal: !issues.some((i) => i.severity === "error"), issues: dedupe(issues) };
}

function commanderIssues(entries: readonly DeckEntry[], f: FormatRules): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const cmd = commanders(entries);
  const cmdCards = cmd.flatMap((e) => Array.from({ length: e.qty }, () => e.card));
  if (cmdCards.length === 0) {
    issues.push({ severity: "error", code: "no_commander", message: "No commander selected.", cardIds: [] });
    return issues;
  }
  if (cmdCards.length > f.maxCommanders) {
    issues.push({
      severity: "error",
      code: "too_many_commanders",
      message: `${cmdCards.length} commanders; ${f.name} allows at most ${f.maxCommanders}.`,
      cardIds: cmdCards.map((c) => c.id),
    });
  }
  for (const c of cmdCards) {
    const isBg = /background/i.test(c.typeLine);
    if (!canBeCommander(c, f) && !(isBg && cmdCards.length === 2)) {
      issues.push({
        severity: "error",
        code: "invalid_commander",
        message: `${c.name} cannot be a commander.`,
        cardIds: [c.id],
      });
    }
    if (f.commanderRarity && f.id === "paupercommander") {
      // Rarity is a printing property; checked against the selected printing when available.
      const e = cmd.find((x) => x.card.id === c.id);
      if (e?.printing && e.printing.rarity !== f.commanderRarity) {
        issues.push({
          severity: "warning",
          code: "commander_rarity",
          message: `${c.name} printing is not ${f.commanderRarity}.`,
          cardIds: [c.id],
        });
      }
    }
  }
  if (cmdCards.length === 2) {
    const [a, b] = cmdCards as [(typeof cmdCards)[0], (typeof cmdCards)[0]];
    const pair = canPair(a!, b!);
    if (!pair.ok)
      issues.push({ severity: "error", code: "invalid_pair", message: pair.reason, cardIds: [a!.id, b!.id] });
  }
  const identity = colorMask(deckColorIdentity(entries));
  for (const e of entriesIn(entries, ["mainboard", "sideboard", "companion"])) {
    const m = colorMask(e.card.colorIdentity);
    if ((m & ~identity) !== 0) {
      issues.push({
        severity: "error",
        code: "color_identity",
        message: `${e.card.name} is outside the commander's colour identity.`,
        cardIds: [e.card.id],
      });
    }
  }
  return issues;
}

function dedupe(issues: LegalityIssue[]): LegalityIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.code}:${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
