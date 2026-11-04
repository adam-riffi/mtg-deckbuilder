import type { Card } from "./card";
import { isLandTypeLine } from "./types";

/** Built-in auto-categories, suggested from oracle tags first and oracle-text heuristics second. */
export const AUTO_CATEGORIES = [
  "Ramp",
  "Card Draw",
  "Removal",
  "Board Wipe",
  "Counterspell",
  "Tutor",
  "Protection",
  "Recursion",
  "Land",
  "Finisher",
] as const;
export type AutoCategory = (typeof AUTO_CATEGORIES)[number];

/** Scryfall oracle tag → category. */
const TAG_MAP: Record<string, AutoCategory> = {
  ramp: "Ramp",
  "mana-rock": "Ramp",
  "mana-dork": "Ramp",
  "land-ramp": "Ramp",
  "cost-reducer": "Ramp",
  draw: "Card Draw",
  "card-advantage": "Card Draw",
  cantrip: "Card Draw",
  removal: "Removal",
  "spot-removal": "Removal",
  "creature-removal": "Removal",
  "artifact-removal": "Removal",
  "enchantment-removal": "Removal",
  "board-wipe": "Board Wipe",
  sweeper: "Board Wipe",
  wrath: "Board Wipe",
  counterspell: "Counterspell",
  tutor: "Tutor",
  protection: "Protection",
  "gives-hexproof": "Protection",
  "gives-indestructible": "Protection",
  recursion: "Recursion",
  reanimate: "Recursion",
  "graveyard-recursion": "Recursion",
};

const RULES: { cat: AutoCategory; re: RegExp; not?: RegExp }[] = [
  {
    cat: "Board Wipe",
    re: /(destroy|exile) all (creatures|nonland permanents|permanents|artifacts|enchantments)|all creatures get -\d+\/-\d+|deals? \d+ damage to each creature|each player sacrifices (all|a) creature/i,
  },
  {
    cat: "Ramp",
    re: /add \{[wubrgc]\}|add (one|two|three) mana|add .*mana of any|search your library for (up to \w+ )?(a )?basic land|put (a|up to \w+) land cards? .*onto the battlefield|search your library for .*land card.* onto the battlefield/i,
  },
  { cat: "Card Draw", re: /draws? (a|two|three|four|x|\w+) cards?|draw cards equal|investigate|connives?/i },
  { cat: "Counterspell", re: /counter target (spell|activated|noncreature|creature spell|instant)/i },
  {
    cat: "Removal",
    re: /(destroy|exile) target (creature|nonland permanent|permanent|artifact|enchantment|planeswalker)|deals? (\d+|x) damage to (target|any target)|target (creature|player) sacrifices|return target (creature|nonland permanent) to its owner's hand|target creature gets -\d+\/-\d+/i,
  },
  {
    cat: "Tutor",
    re: /search your library for (a|an|up to \w+) (?!basic land|land card|plains|island|swamp|mountain|forest)[^.]*card/i,
  },
  {
    cat: "Protection",
    re: /(gain|gains|have|has) (hexproof|indestructible|shroud|protection from)|phase out/i,
  },
  {
    cat: "Recursion",
    re: /return (target|up to \w+|a|all) [^.]*cards? from (your|a) graveyard to (your hand|the battlefield)/i,
  },
];

/** Suggests categories for a card. Lands are always "Land" unless they also ramp (e.g. bounce lands stay Land). */
export function suggestCategories(card: Card): AutoCategory[] {
  if (isLandTypeLine(card.faces[0]?.typeLine ?? card.typeLine)) return ["Land"];
  const out = new Set<AutoCategory>();
  for (const t of card.tags) {
    const c = TAG_MAP[t];
    if (c) out.add(c);
  }
  if (out.size === 0) {
    for (const r of RULES) if (r.re.test(card.oracleText) && !r.not?.test(card.oracleText)) out.add(r.cat);
  }
  return [...out];
}

/** Category templates users can apply to a fresh deck. */
export const CATEGORY_TEMPLATES: Record<string, { name: string; target?: number }[]> = {
  "Commander (8x8 style)": [
    { name: "Ramp", target: 10 },
    { name: "Card Draw", target: 10 },
    { name: "Removal", target: 8 },
    { name: "Board Wipe", target: 3 },
    { name: "Protection", target: 4 },
    { name: "Synergy", target: 20 },
    { name: "Finisher", target: 5 },
    { name: "Land", target: 37 },
  ],
  "60-card constructed": [
    { name: "Threats" },
    { name: "Interaction" },
    { name: "Card Advantage" },
    { name: "Land", target: 24 },
  ],
};
