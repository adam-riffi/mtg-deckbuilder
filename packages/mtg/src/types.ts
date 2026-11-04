export const CARD_TYPES = [
  "Creature",
  "Planeswalker",
  "Battle",
  "Artifact",
  "Enchantment",
  "Instant",
  "Sorcery",
  "Land",
  "Kindred",
  "Tribal",
] as const;

/** Display order used when grouping a deck by type. */
export const TYPE_GROUP_ORDER = [
  "Commander",
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Land",
  "Other",
] as const;
export type TypeGroup = (typeof TYPE_GROUP_ORDER)[number];

export interface ParsedTypeLine {
  supertypes: string[];
  types: string[];
  subtypes: string[];
}

const SUPERTYPES = new Set(["Basic", "Legendary", "Snow", "World", "Ongoing", "Elite", "Host"]);

/** Parses the front face of a type line, e.g. "Legendary Creature — Elf Druid". */
export function parseTypeLine(typeLine: string): ParsedTypeLine {
  const front = typeLine.split(" // ")[0] ?? "";
  const [left = "", right = ""] = front.split(/\s+[—-]\s+/);
  const words = left.trim().split(/\s+/).filter(Boolean);
  return {
    supertypes: words.filter((w) => SUPERTYPES.has(w)),
    types: words.filter((w) => !SUPERTYPES.has(w)),
    subtypes: right.trim().split(/\s+/).filter(Boolean),
  };
}

/**
 * Primary type for grouping, following Archidekt/Moxfield precedence:
 * Creature beats Artifact/Enchantment/Land; Land only when nothing else applies.
 */
export function primaryType(typeLine: string): TypeGroup {
  const { types } = parseTypeLine(typeLine);
  for (const t of [
    "Creature",
    "Planeswalker",
    "Battle",
    "Instant",
    "Sorcery",
    "Artifact",
    "Enchantment",
  ] as const) {
    if (types.includes(t)) return t;
  }
  if (types.includes("Land")) return "Land";
  return "Other";
}

export function isLandTypeLine(typeLine: string): boolean {
  return parseTypeLine(typeLine).types.includes("Land");
}

export function hasType(typeLine: string, type: string): boolean {
  return typeLine.toLowerCase().includes(type.toLowerCase());
}
