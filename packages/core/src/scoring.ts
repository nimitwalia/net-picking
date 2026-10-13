/* Score validation, ported from index.html checkScore. Messages preserved verbatim. */

/** Tie at match point: `golden` (house rule, not official) or `win2` (win by 2). */
export type TieRule = 'golden' | 'win2';

/**
 * win2: A game ends when a side has reached `to` AND leads by 2. Nothing else is a final score.
 * Returns an error message, or null if (a, b) is a valid final score.
 */
function checkWin2(a: number, b: number, to: number): string | null {
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

function checkGolden(a: number, b: number, to: number): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0)
    return 'Enter both scores as whole numbers.';
  const head = `This game is to ${to}, golden point.`;
  const ok = `A valid score has one side on exactly ${to} and the other lower, like ${to}–${to - 1}.`;
  if (a === b) return `${head} ${a}–${b} is a tie, which can't be a final score. ${ok}`;
  const hi = Math.max(a, b);
  if (hi < to) return `${head} ${a}–${b}: nobody has reached ${to} yet. ${ok}`;
  if (hi > to) return `${head} ${a}–${b} is too high: the game ends the moment a side reaches ${to}. ${ok}`;
  return null;
}

/**
 * Returns an error message, or null if (a, b) is a valid final score under the tie rule.
 * `win2` is the original behaviour; `golden` is the owner's house rule (not an official rule).
 */
export function checkScore(a: number, b: number, to: number, rule: TieRule = 'win2'): string | null {
  return rule === 'golden' ? checkGolden(a, b, to) : checkWin2(a, b, to);
}
