/* Finals selection and team pairing, ported from index.html finalFour/pickTeams/finalTeams. */
import { tieAtCutoff, type StandingRow } from './standings';

export interface FinalTeams<T = StandingRow> {
  A: T[];
  B: T[];
}

/** Shape of a stored final: new-style `teams`, or legacy `seeds` (top four). */
export interface FinalsState<T = StandingRow> {
  teams?: FinalTeams<T> | null;
  seeds?: readonly T[] | null;
}

/** Top 4 rows; optionally swap 4th for 5th when level at the cutoff. Never re-sorts. */
export function finalFour(rows: readonly StandingRow[], tieSwap: boolean): StandingRow[] {
  if (rows.length < 4) throw new Error(`finalFour needs at least 4 rows, got ${rows.length}`);
  const four = rows.slice(0, 4);
  if (tieSwap && tieAtCutoff(rows)) four[3] = rows[4] as StandingRow;
  return four;
}

/** Split four rows into two teams with the closest summed strength; ties keep the earliest pairing. */
export function pickTeams(four: readonly StandingRow[]): FinalTeams {
  if (four.length < 4) throw new Error(`pickTeams needs at least 4 rows, got ${four.length}`);
  const st = (r: StandingRow) => r.pts + r.diff * 0.001;
  const opts: [number[], number[]][] = [
    [[0, 3], [1, 2]],
    [[0, 2], [1, 3]],
    [[0, 1], [2, 3]],
  ];
  let best: { a: number[]; b: number[]; d: number } | null = null;
  for (const [a, b] of opts) {
    const sa = a.reduce((t, i) => t + st(four[i] as StandingRow), 0);
    const sb = b.reduce((t, i) => t + st(four[i] as StandingRow), 0);
    const d = Math.abs(sa - sb);
    if (!best || d < best.d - 1e-9) best = { a, b, d };
  }
  const pick = best as { a: number[]; b: number[]; d: number };
  return {
    A: pick.a.map((i) => four[i] as StandingRow),
    B: pick.b.map((i) => four[i] as StandingRow),
  };
}

/** Teams of a stored final: `teams` if present, else legacy seeds [q0,q3] v [q1,q2]. */
export function resolveFinalTeams<T = StandingRow>(finals: FinalsState<T>): FinalTeams<T> {
  if (finals.teams) return { A: finals.teams.A, B: finals.teams.B };
  const q = finals.seeds as readonly T[];
  return { A: [q[0] as T, q[3] as T], B: [q[1] as T, q[2] as T] };
}
