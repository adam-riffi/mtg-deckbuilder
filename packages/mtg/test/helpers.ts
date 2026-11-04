import type { Card, Printing } from "../src/card";
import type { DeckEntry, Zone } from "../src/deck";

let n = 0;
/** Builds a test card. Values are test inputs, not authoritative card data. */
export function card(p: Partial<Card> & { name: string }): Card {
  n++;
  return {
    id: p.id ?? `oracle-${n}`,
    layout: "normal",
    manaCost: null,
    cmc: 0,
    typeLine: "Artifact",
    oracleText: "",
    colors: [],
    colorIdentity: [],
    keywords: [],
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    legalities: { commander: "legal", modern: "legal", vintage: "legal", legacy: "legal" },
    producedMana: [],
    faces: [],
    gameChanger: false,
    reserved: false,
    edhrecRank: null,
    tags: [],
    games: ["paper"],
    allParts: [],
    minUsd: 1,
    minEur: 1,
    minTix: null,
    firstReleased: "2020-01-01",
    ...p,
  };
}

export function printing(c: Card, p: Partial<Printing> = {}): Printing {
  return {
    id: `print-${c.id}-${p.setCode ?? "tst"}`,
    oracleId: c.id,
    name: c.name,
    setCode: "tst",
    setName: "Test Set",
    collectorNumber: "1",
    rarity: "rare",
    lang: "en",
    releasedAt: "2020-01-01",
    artist: "Test Artist",
    imageUris: null,
    faceImageUris: [],
    finishes: ["nonfoil", "foil"],
    prices: { usd: 1, usdFoil: 2, usdEtched: null, eur: 0.9, eurFoil: 1.8, tix: null },
    promo: false,
    digital: false,
    fullArt: false,
    frame: "2015",
    borderColor: "black",
    frameEffects: [],
    promoTypes: [],
    illustrationId: null,
    scryfallUri: null,
    games: ["paper"],
    ...p,
  };
}

export function entry(c: Card, qty = 1, zone: Zone = "mainboard", categories: string[] = []): DeckEntry {
  return {
    id: `e-${c.id}-${zone}`,
    cardId: c.id,
    printingId: null,
    qty,
    zone,
    categories,
    tags: [],
    finish: "nonfoil",
    card: c,
    printing: null,
  };
}

export const solRing = card({
  name: "Sol Ring",
  manaCost: "{1}",
  cmc: 1,
  typeLine: "Artifact",
  oracleText: "{T}: Add {C}{C}.",
  producedMana: ["C"],
  gameChanger: false,
  tags: ["mana-rock", "ramp"],
});
export const counterspell = card({
  name: "Counterspell",
  manaCost: "{U}{U}",
  cmc: 2,
  typeLine: "Instant",
  oracleText: "Counter target spell.",
  colors: ["U"],
  colorIdentity: ["U"],
});
export const lightningBolt = card({
  name: "Lightning Bolt",
  manaCost: "{R}",
  cmc: 1,
  typeLine: "Instant",
  oracleText: "Lightning Bolt deals 3 damage to any target.",
  colors: ["R"],
  colorIdentity: ["R"],
});
export const llanowar = card({
  name: "Llanowar Elves",
  manaCost: "{G}",
  cmc: 1,
  typeLine: "Creature — Elf Druid",
  oracleText: "{T}: Add {G}.",
  colors: ["G"],
  colorIdentity: ["G"],
  power: "1",
  toughness: "1",
  producedMana: ["G"],
});
export const forest = card({
  name: "Forest",
  typeLine: "Basic Land — Forest",
  oracleText: "({T}: Add {G}.)",
  colorIdentity: ["G"],
  producedMana: ["G"],
});
export const island = card({
  name: "Island",
  typeLine: "Basic Land — Island",
  oracleText: "({T}: Add {U}.)",
  colorIdentity: ["U"],
  producedMana: ["U"],
});
export const commanderGU = card({
  name: "Test Legend of Growth",
  manaCost: "{1}{G}{U}",
  cmc: 3,
  typeLine: "Legendary Creature — Elf Wizard",
  oracleText: "Whenever you cast a spell, draw a card.",
  colors: ["G", "U"],
  colorIdentity: ["G", "U"],
  power: "2",
  toughness: "3",
});
