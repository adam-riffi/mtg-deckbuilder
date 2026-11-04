export interface FormatRules {
  id: string;
  name: string;
  /** Key in Scryfall's legalities object. */
  legalityKey: string;
  minMain: number;
  /** Exact deck size for commander-style formats (includes commanders). */
  exactSize?: number;
  maxSideboard: number;
  maxCopies: number;
  commander: boolean;
  /** Max number of cards in the command zone (2 with partners/backgrounds). */
  maxCommanders: number;
  /** Commander must be this rarity (Pauper Commander-style); undefined = any. */
  commanderRarity?: string;
  /** Planeswalkers may be commanders (Brawl). */
  planeswalkerCommanders?: boolean;
}

export const FORMATS: readonly FormatRules[] = [
  {
    id: "commander",
    name: "Commander",
    legalityKey: "commander",
    minMain: 100,
    exactSize: 100,
    maxSideboard: 0,
    maxCopies: 1,
    commander: true,
    maxCommanders: 2,
  },
  {
    id: "standard",
    name: "Standard",
    legalityKey: "standard",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "pioneer",
    name: "Pioneer",
    legalityKey: "pioneer",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "modern",
    name: "Modern",
    legalityKey: "modern",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "legacy",
    name: "Legacy",
    legalityKey: "legacy",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "vintage",
    name: "Vintage",
    legalityKey: "vintage",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "pauper",
    name: "Pauper",
    legalityKey: "pauper",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "premodern",
    name: "Premodern",
    legalityKey: "premodern",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "historic",
    name: "Historic",
    legalityKey: "historic",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "timeless",
    name: "Timeless",
    legalityKey: "timeless",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "alchemy",
    name: "Alchemy",
    legalityKey: "alchemy",
    minMain: 60,
    maxSideboard: 15,
    maxCopies: 4,
    commander: false,
    maxCommanders: 0,
  },
  {
    id: "duel",
    name: "Duel Commander",
    legalityKey: "duel",
    minMain: 100,
    exactSize: 100,
    maxSideboard: 0,
    maxCopies: 1,
    commander: true,
    maxCommanders: 2,
  },
  {
    id: "brawl",
    name: "Brawl",
    legalityKey: "brawl",
    minMain: 100,
    exactSize: 100,
    maxSideboard: 0,
    maxCopies: 1,
    commander: true,
    maxCommanders: 1,
    planeswalkerCommanders: true,
  },
  {
    id: "standardbrawl",
    name: "Standard Brawl",
    legalityKey: "standardbrawl",
    minMain: 60,
    exactSize: 60,
    maxSideboard: 0,
    maxCopies: 1,
    commander: true,
    maxCommanders: 1,
    planeswalkerCommanders: true,
  },
  {
    id: "paupercommander",
    name: "Pauper Commander",
    legalityKey: "paupercommander",
    minMain: 100,
    exactSize: 100,
    maxSideboard: 0,
    maxCopies: 1,
    commander: true,
    maxCommanders: 2,
    commanderRarity: "uncommon",
  },
  {
    id: "oathbreaker",
    name: "Oathbreaker",
    legalityKey: "oathbreaker",
    minMain: 60,
    exactSize: 60,
    maxSideboard: 0,
    maxCopies: 1,
    commander: true,
    maxCommanders: 2,
    planeswalkerCommanders: true,
  },
  {
    id: "casual",
    name: "Casual (no rules)",
    legalityKey: "",
    minMain: 0,
    maxSideboard: 999,
    maxCopies: 999,
    commander: false,
    maxCommanders: 0,
  },
];

export type FormatId = string;

export function getFormat(id: string): FormatRules {
  return FORMATS.find((f) => f.id === id) ?? FORMATS.find((f) => f.id === "casual")!;
}

export const FORMAT_IDS = FORMATS.map((f) => f.id);
