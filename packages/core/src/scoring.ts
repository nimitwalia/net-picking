/* Score validation, ported from index.html checkScore. Messages preserved verbatim. */

/**
 * A game ends when a side has reached `to` AND leads by 2. Nothing else is a final score.
 * Returns an error message, or null if (a, b) is a valid final score.
 */
export function checkScore(a: number, b: number, to: number): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0)
    return 'Enter both scores as whole numbers.';
  const rule = `This game is to ${to}, win by 2.`;
  if (a === b) return `${rule} ${a}–${b} is a tie, so play on.`;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < to) return `${rule} The winning side needs at least ${to}.`;
  if (hi === to && lo > to - 2)
    return `${rule} ${hi}–${lo} is not final: play on until one side leads by 2.`;
  if (hi > to && hi - lo < 2)
    return `${rule} ${hi}–${lo} is not final: play on until one side leads by 2.`;
  if (hi > to && hi - lo > 2)
    return `${rule} Past ${to} the game only continues from ${to - 1}–${to - 1} and ends once a side leads by 2. The closest valid score is ${Math.max(to, lo + 2)}–${lo}.`;
  return null;
}
