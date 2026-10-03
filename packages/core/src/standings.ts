/* Standings, ported from index.html standings/tieAtCutoff. Win +3, loss -1 per player. */
import type { Pair } from './scheduler';

export interface PlayedMatch {
  t1: Pair;
  t2: Pair;
  /** 1 or 2 when decided; null/undefined when not played. */
  winner?: 1 | 2 | null;
  s1?: number | null;
  s2?: number | null;
}

export interface StandingRow {
  name: string;
  /** played */
  p: number;
  w: number;
  l: number;
  pts: number;
  /** points scored minus points conceded */
  diff: number;
  /** points for */
  pf: number;
}

/**
 * @param players player names; match pairs index into this array
 * @param upTo only matches with index < upTo count (default: all)
 */
export function standings(
  players: readonly string[],
  matches: readonly PlayedMatch[],
  upTo: number = Infinity,
): StandingRow[] {
  const rows: StandingRow[] = players.map((name) => ({ name, p: 0, w: 0, l: 0, pts: 0, diff: 0, pf: 0 }));
  matches.forEach((m, i) => {
    if (i >= upTo || !m.winner) return;
    const win = m.winner === 1 ? m.t1 : m.t2;
    const lose = m.winner === 1 ? m.t2 : m.t1;
    const hasSc = Number.isFinite(m.s1) && Number.isFinite(m.s2);
    const s1 = m.s1 as number;
    const s2 = m.s2 as number;
    const ws = hasSc ? (m.winner === 1 ? s1 : s2) : 0;
    const ls = hasSc ? (m.winner === 1 ? s2 : s1) : 0;
    const d = ws - ls;
    for (const p of win) {
      const r = rows[p] as StandingRow;
      r.p++;
      r.w++;
      r.pts += 3;
      r.diff += d;
      r.pf += ws;
    }
    for (const p of lose) {
      const r = rows[p] as StandingRow;
      r.p++;
      r.l++;
      r.pts -= 1;
      r.diff -= d;
      r.pf += ls;
    }
  });
  rows.sort(
    (a, b) => b.pts - a.pts || b.w - a.w || b.diff - a.diff || b.pf - a.pf || a.name.localeCompare(b.name),
  );
  return rows;
}

/** True when 4th and 5th are level on pts, wins, diff and pf. */
export function tieAtCutoff(rows: readonly StandingRow[]): boolean {
  if (rows.length < 5) return false;
  const a = rows[3] as StandingRow;
  const b = rows[4] as StandingRow;
  return a.pts === b.pts && a.w === b.w && a.diff === b.diff && a.pf === b.pf;
}
