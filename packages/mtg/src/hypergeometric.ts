/** log of n choose k, stable for deck-sized numbers. */
function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  let r = 0;
  for (let i = 1; i <= k; i++) r += Math.log(n - k + i) - Math.log(i);
  return r;
}

/** P(X = k) when drawing `draws` cards from `population` containing `successes` hits. */
export function hypergeometricPmf(population: number, successes: number, draws: number, k: number): number {
  if (k < 0 || k > draws || k > successes || draws - k > population - successes) return 0;
  return Math.exp(
    logChoose(successes, k) + logChoose(population - successes, draws - k) - logChoose(population, draws),
  );
}

/** P(X ≥ atLeast). */
export function hypergeometricAtLeast(
  population: number,
  successes: number,
  draws: number,
  atLeast: number,
): number {
  let p = 0;
  for (let k = Math.max(0, atLeast); k <= Math.min(draws, successes); k++)
    p += hypergeometricPmf(population, successes, draws, k);
  return Math.min(1, Math.max(0, p));
}

/**
 * Cards seen by a given turn: opening hand (7) plus one draw per turn,
 * minus the first-turn draw when on the play.
 */
export function cardsSeenByTurn(
  turn: number,
  opts: { handSize?: number; onThePlay?: boolean; extraDraws?: number } = {},
): number {
  const hand = opts.handSize ?? 7;
  const draws = Math.max(0, turn - (opts.onThePlay === false ? 0 : 1));
  return hand + draws + (opts.extraDraws ?? 0);
}

export interface DrawChanceInput {
  deckSize: number;
  hits: number;
  turn: number;
  atLeast?: number;
  onThePlay?: boolean;
}

/** E.g. P(≥1 ramp by turn 3) for a 99-card library. */
export function drawChance({ deckSize, hits, turn, atLeast = 1, onThePlay = true }: DrawChanceInput): number {
  return hypergeometricAtLeast(
    deckSize,
    hits,
    Math.min(deckSize, cardsSeenByTurn(turn, { onThePlay })),
    atLeast,
  );
}
