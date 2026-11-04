/**
 * Eval cases. Each case sets up a deck (commander by exact name, optional starting cards), sends one prompt,
 * then checks the assistant's output. Card names here must exist in the ingested card data.
 */
export interface EvalCase {
  id: string;
  prompt: string;
  format?: string;
  commander?: string;
  cards?: string[];
  budget?: { amount: number; currency: "eur" | "usd" };
  targetBracket?: number;
  /** Expect a change set to be proposed. */
  expectProposal?: boolean;
  /** Max total price of cards the proposal adds (in the budget currency). */
  maxAddedPrice?: number;
  /** Expect the assistant to ask a clarifying question instead of building. */
  expectQuestion?: boolean;
}

export const CASES: EvalCase[] = [
  {
    id: "ramp-simic",
    commander: "Tatyova, Benthic Druid",
    prompt: "Suggest 5 ramp cards for this deck and propose adding them.",
    expectProposal: true,
  },
  {
    id: "draw-mono-b",
    commander: "Meren of Clan Nel Toth",
    prompt: "Add 4 card draw spells that fit my colours.",
    expectProposal: true,
  },
  {
    id: "removal-budget",
    commander: "Krenko, Mob Boss",
    prompt: "Propose 5 removal spells, each under €2.",
    budget: { amount: 10, currency: "eur" },
    maxAddedPrice: 10,
    expectProposal: true,
  },
  {
    id: "wipes-white",
    commander: "Light-Paws, Emperor's Voice",
    prompt: "Add three board wipes.",
    expectProposal: true,
  },
  {
    id: "identity-trap",
    commander: "Krenko, Mob Boss",
    prompt: "Add Counterspell and Swords to Plowshares to my deck.",
    expectProposal: false,
  },
  {
    id: "bracket-2",
    commander: "Edgar Markov",
    targetBracket: 2,
    prompt: "Suggest 5 strong upgrades that keep me in bracket 2.",
    expectProposal: true,
  },
  {
    id: "bracket-3-gc",
    commander: "Korvold, Fae-Cursed King",
    targetBracket: 3,
    prompt: "Add the best Game Changers you can while staying in bracket 3.",
    expectProposal: true,
  },
  {
    id: "mana-base",
    commander: "Niv-Mizzet, Parun",
    prompt: "Build me a 36-land mana base for this deck.",
    expectProposal: true,
  },
  {
    id: "cuts",
    commander: "Talrand, Sky Summoner",
    cards: ["Sol Ring", "Arcane Signet", "Counterspell", "Brainstorm", "Ponder", "Grizzly Bears"],
    prompt: "Which card is weakest here? Propose cutting it with a reason.",
    expectProposal: true,
  },
  {
    id: "swap",
    commander: "Talrand, Sky Summoner",
    cards: ["Opt", "Mind Stone"],
    prompt: "Swap Opt for a better cantrip.",
    expectProposal: true,
  },
  {
    id: "explain-combo",
    commander: "Kinnan, Bonder Prodigy",
    prompt: "Explain how Basalt Monolith combos with Kinnan. Don't change the deck.",
    expectProposal: false,
  },
  { id: "underspecified", prompt: "Build me a deck.", expectQuestion: true, expectProposal: false },
  {
    id: "full-build-brief",
    commander: "Lathril, Blade of the Elves",
    budget: { amount: 100, currency: "eur" },
    targetBracket: 2,
    prompt: "Build the full 99 for Lathril: elves tribal, bracket 2, €100 total.",
    maxAddedPrice: 100,
    expectProposal: true,
  },
  {
    id: "partner",
    commander: "Thrasios, Triton Hero",
    prompt: "Suggest a partner commander for Thrasios and propose adding it to the command zone.",
    expectProposal: true,
  },
  {
    id: "standard-conversion",
    format: "modern",
    cards: ["Lightning Bolt", "Mountain"],
    prompt: "Propose 4 more burn spells legal in Modern.",
    expectProposal: true,
  },
  {
    id: "primer",
    commander: "Prossh, Skyraider of Kher",
    prompt: "Write a short primer (game plan and key cards) for this commander.",
    expectProposal: false,
  },
  {
    id: "curve",
    commander: "Omnath, Locus of Creation",
    cards: ["Sol Ring", "Cultivate", "Kodama's Reach"],
    prompt: "Analyse my curve and land count. Don't propose changes.",
    expectProposal: false,
  },
  {
    id: "pauper-legal",
    format: "pauper",
    cards: ["Lightning Bolt"],
    prompt: "Propose 4 common red creatures legal in Pauper.",
    expectProposal: true,
  },
  {
    id: "owned-cards",
    commander: "Tatyova, Benthic Druid",
    prompt:
      "Check whether I own Rampant Growth and Cultivate, then suggest ramp using owned cards if possible.",
    expectProposal: false,
  },
  {
    id: "no-hallucination",
    commander: "Atraxa, Praetors' Voice",
    prompt: "Tell me about the card 'Praetor's Grand Hydra of Doom' and add it if it's good.",
    expectProposal: false,
  },
];
