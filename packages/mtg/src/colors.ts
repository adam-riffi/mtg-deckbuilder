/** Colour letters in WUBRG order. */
export const COLORS = ["W", "U", "B", "R", "G"] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_NAMES: Record<Color, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const BIT: Record<Color, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 };

export function isColor(c: string): c is Color {
  return (COLORS as readonly string[]).includes(c);
}

/** Bitmask (W=1,U=2,B=4,R=8,G=16) for fast subset/superset checks in SQL and JS. */
export function colorMask(colors: readonly string[]): number {
  let m = 0;
  for (const c of colors) {
    const u = c.toUpperCase();
    if (isColor(u)) m |= BIT[u];
  }
  return m;
}

export function maskToColors(mask: number): Color[] {
  return COLORS.filter((c) => (mask & BIT[c]) !== 0);
}

export function popcount(mask: number): number {
  let n = 0;
  let m = mask;
  while (m) {
    n += m & 1;
    m >>= 1;
  }
  return n;
}

export function sortColors(colors: readonly string[]): Color[] {
  return maskToColors(colorMask(colors));
}

/** Named colour combinations accepted by Scryfall-style queries (c:azorius, id:esper…). */
const NAMED: Record<string, string> = {
  white: "w",
  blue: "u",
  black: "b",
  red: "r",
  green: "g",
  azorius: "wu",
  dimir: "ub",
  rakdos: "br",
  gruul: "rg",
  selesnya: "gw",
  orzhov: "wb",
  izzet: "ur",
  golgari: "bg",
  boros: "rw",
  simic: "gu",
  bant: "gwu",
  esper: "wub",
  grixis: "ubr",
  jund: "brg",
  naya: "rgw",
  abzan: "wbg",
  jeskai: "urw",
  sultai: "bgu",
  mardu: "rwb",
  temur: "gur",
  silverquill: "wb",
  prismari: "ur",
  witherbloom: "bg",
  lorehold: "rw",
  quandrix: "gu",
  yore: "wubr",
  "yore-tiller": "wubr",
  glint: "ubrg",
  "glint-eye": "ubrg",
  dune: "brgw",
  "dune-brood": "brgw",
  ink: "rgwu",
  "ink-treader": "rgwu",
  witch: "gwub",
  "witch-maw": "gwub",
  wubrg: "wubrg",
  rainbow: "wubrg",
  fivecolor: "wubrg",
};

export type ColorQuery =
  | { kind: "colors"; mask: number }
  | { kind: "colorless" }
  | { kind: "multicolor" }
  | { kind: "count"; count: number };

/** Parses the value side of c:/id: (e.g. "wu", "azorius", "c", "m", "2"). Returns null if invalid. */
export function parseColorQuery(raw: string): ColorQuery | null {
  const v = raw.toLowerCase().trim();
  if (v === "") return null;
  if (/^\d$/.test(v)) return { kind: "count", count: Number(v) };
  if (v === "c" || v === "colorless") return { kind: "colorless" };
  if (v === "m" || v === "multicolor" || v === "multi") return { kind: "multicolor" };
  const named = NAMED[v];
  const letters = named ?? v;
  if (!/^[wubrg]+$/.test(letters)) return null;
  return { kind: "colors", mask: colorMask(letters.split("")) };
}

/** Human label for a colour identity, e.g. "Azorius (WU)". */
export function colorIdentityLabel(colors: readonly string[]): string {
  const sorted = sortColors(colors).join("").toLowerCase();
  if (sorted === "") return "Colorless";
  for (const [name, letters] of Object.entries(NAMED)) {
    if (name.includes("-") || name === "rainbow" || name === "fivecolor") continue;
    if (sortColors(letters.split("")).join("").toLowerCase() === sorted && letters.length > 1) {
      return `${name[0]!.toUpperCase()}${name.slice(1)} (${sorted.toUpperCase()})`;
    }
  }
  return sorted.length === 1 ? COLOR_NAMES[sorted.toUpperCase() as Color] : sorted.toUpperCase();
}
