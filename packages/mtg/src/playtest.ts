/**
 * Playtester engine: a pure reducer over game state, so it is easy to test and to undo.
 * Zones: library, hand, battlefield, graveyard, exile, command.
 */
export const PT_ZONES = ["library", "hand", "battlefield", "graveyard", "exile", "command"] as const;
export type PtZone = (typeof PT_ZONES)[number];

export interface PtCard {
  /** Unique instance id. */
  uid: string;
  cardId: string;
  name: string;
  image: string | null;
  backImage: string | null;
  tapped: boolean;
  faceDown: boolean;
  flipped: boolean;
  counters: Record<string, number>;
  token: boolean;
}

export interface PtState {
  zones: Record<PtZone, PtCard[]>;
  life: number;
  turn: number;
  mulligans: number;
  /** London mulligan: number of cards still to bottom after keeping. */
  toBottom: number;
  seed: number;
  log: string[];
}

export type PtAction =
  | { t: "draw"; n?: number }
  | { t: "shuffle" }
  | { t: "mulligan" }
  | { t: "keep" }
  | { t: "bottom"; uid: string }
  | { t: "move"; uid: string; to: PtZone; position?: "top" | "bottom" }
  | { t: "tap"; uid: string }
  | { t: "untap_all" }
  | { t: "flip"; uid: string }
  | { t: "counter"; uid: string; kind: string; delta: number }
  | { t: "token"; name: string; image?: string | null }
  | { t: "life"; delta: number }
  | { t: "next_turn" }
  | { t: "scry_resolve"; top: string[]; bottom: string[] }
  | { t: "mill"; n: number };

/** Deterministic PRNG (mulberry32) so games are reproducible from a seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(list: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const empty = (): Record<PtZone, PtCard[]> => ({
  library: [],
  hand: [],
  battlefield: [],
  graveyard: [],
  exile: [],
  command: [],
});

export function newGame(
  library: Omit<PtCard, "tapped" | "faceDown" | "flipped" | "counters" | "token">[],
  command: typeof library,
  opts: { life?: number; seed?: number; handSize?: number } = {},
): PtState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const mk = (c: (typeof library)[number]): PtCard => ({
    ...c,
    tapped: false,
    faceDown: false,
    flipped: false,
    counters: {},
    token: false,
  });
  const zones = empty();
  zones.library = shuffle(library.map(mk), seed);
  zones.command = command.map(mk);
  zones.hand = zones.library.splice(0, opts.handSize ?? 7);
  return {
    zones,
    life: opts.life ?? 20,
    turn: 1,
    mulligans: 0,
    toBottom: 0,
    seed,
    log: ["Game start: drew 7."],
  };
}

function find(s: PtState, uid: string): { zone: PtZone; index: number } | null {
  for (const z of PT_ZONES) {
    const i = s.zones[z].findIndex((c) => c.uid === uid);
    if (i >= 0) return { zone: z, index: i };
  }
  return null;
}

function clone(s: PtState): PtState {
  return {
    ...s,
    zones: Object.fromEntries(
      PT_ZONES.map((z) => [z, s.zones[z].map((c) => ({ ...c, counters: { ...c.counters } }))]),
    ) as PtState["zones"],
    log: [...s.log],
  };
}

let tokenSeq = 0;

export function playtestReducer(state: PtState, a: PtAction): PtState {
  const s = clone(state);
  const z = s.zones;
  switch (a.t) {
    case "draw": {
      const n = Math.min(a.n ?? 1, z.library.length);
      z.hand.push(...z.library.splice(0, n));
      s.log.push(`Drew ${n}.`);
      break;
    }
    case "shuffle":
      s.seed = (s.seed * 1103515245 + 12345) >>> 0;
      z.library = shuffle(z.library, s.seed);
      s.log.push("Shuffled library.");
      break;
    case "mulligan": {
      // London mulligan: shuffle hand back, draw 7, then bottom one card per mulligan taken.
      z.library.push(...z.hand.splice(0));
      s.seed = (s.seed * 1103515245 + 12345) >>> 0;
      z.library = shuffle(z.library, s.seed);
      z.hand = z.library.splice(0, 7);
      s.mulligans += 1;
      s.toBottom = s.mulligans;
      s.log.push(`Mulligan ${s.mulligans}: drew 7, put ${s.toBottom} on the bottom.`);
      break;
    }
    case "keep":
      s.log.push(`Kept ${z.hand.length - s.toBottom}.`);
      break;
    case "bottom": {
      const f = find(s, a.uid);
      if (f?.zone !== "hand") break;
      const [c] = z.hand.splice(f.index, 1);
      z.library.push(c!);
      s.toBottom = Math.max(0, s.toBottom - 1);
      break;
    }
    case "move": {
      const f = find(s, a.uid);
      if (!f) break;
      const [c] = z[f.zone].splice(f.index, 1);
      if (!c) break;
      if (c.token && a.to !== "battlefield") {
        s.log.push(`${c.name} token ceased to exist.`);
        break;
      }
      if (a.to !== "battlefield") {
        c.tapped = false;
        c.counters = {};
      }
      if (a.to === "library" && a.position !== "bottom") z.library.unshift(c);
      else z[a.to].push(c);
      s.log.push(`${c.name}: ${f.zone} → ${a.to}${a.to === "library" ? ` (${a.position ?? "top"})` : ""}.`);
      break;
    }
    case "tap": {
      const f = find(s, a.uid);
      if (f) z[f.zone][f.index]!.tapped = !z[f.zone][f.index]!.tapped;
      break;
    }
    case "untap_all":
      for (const c of z.battlefield) c.tapped = false;
      break;
    case "flip": {
      const f = find(s, a.uid);
      if (f) z[f.zone][f.index]!.flipped = !z[f.zone][f.index]!.flipped;
      break;
    }
    case "counter": {
      const f = find(s, a.uid);
      if (!f) break;
      const c = z[f.zone][f.index]!;
      const v = (c.counters[a.kind] ?? 0) + a.delta;
      if (v <= 0) delete c.counters[a.kind];
      else c.counters[a.kind] = v;
      break;
    }
    case "token":
      tokenSeq++;
      z.battlefield.push({
        uid: `token-${tokenSeq}-${Date.now()}`,
        cardId: "",
        name: a.name,
        image: a.image ?? null,
        backImage: null,
        tapped: false,
        faceDown: false,
        flipped: false,
        counters: {},
        token: true,
      });
      s.log.push(`Created ${a.name} token.`);
      break;
    case "life":
      s.life += a.delta;
      break;
    case "next_turn":
      s.turn += 1;
      for (const c of z.battlefield) c.tapped = false;
      if (z.library.length) z.hand.push(z.library.shift()!);
      s.log.push(`Turn ${s.turn}: untapped and drew.`);
      break;
    case "scry_resolve": {
      const pick = (uids: string[]) =>
        uids.map((u) => z.library.find((c) => c.uid === u)).filter((c): c is PtCard => !!c);
      const top = pick(a.top);
      const bottom = pick(a.bottom);
      const moved = new Set([...a.top, ...a.bottom]);
      const rest = z.library.filter((c) => !moved.has(c.uid));
      z.library = [...top, ...rest, ...bottom];
      s.log.push(`Scry ${top.length + bottom.length}: ${top.length} top, ${bottom.length} bottom.`);
      break;
    }
    case "mill": {
      const n = Math.min(a.n, z.library.length);
      z.graveyard.push(...z.library.splice(0, n));
      s.log.push(`Milled ${n}.`);
      break;
    }
  }
  if (s.log.length > 200) s.log = s.log.slice(-200);
  return s;
}
