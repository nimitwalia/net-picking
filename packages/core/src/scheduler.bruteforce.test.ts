import { describe, expect, it } from 'vitest';
import { buildSchedule, mulberry32, validMatchCounts } from './index';

// Exhaustive minimum of partner repeats over all valid schedules (every player plays exactly m
// matches). Match order does not affect partner repeats, so we search multisets of matches.
// Repeats = total partnerships - distinct partnerships.
function optimalPartnerRepeats(N: number, m: number): number {
  const total = (N * m) / 4;
  const quads: number[][] = [];
  for (let a = 0; a < N; a++)
    for (let b = a + 1; b < N; b++)
      for (let c = b + 1; c < N; c++) for (let d = c + 1; d < N; d++) quads.push([a, b, c, d]);
  // Each match = a quad plus one of 3 splits -> two partner pairs.
  const matches: [number, number, number[]][] = [];
  for (const [a, b, c, d] of quads as [number, number, number, number][]) {
    const splits: [number, number, number, number][] = [
      [a, b, c, d],
      [a, c, b, d],
      [a, d, b, c],
    ];
    for (const [p, q, r, s] of splits) matches.push([p * N + q, r * N + s, [a, b, c, d]]);
  }
  const need = new Array(N).fill(m) as number[];
  const pairCount = new Map<number, number>();
  let best = Infinity;
  const rec = (start: number, left: number, repeats: number) => {
    if (repeats >= best) return;
    if (left === 0) {
      best = repeats;
      return;
    }
    for (let i = start; i < matches.length; i++) {
      const [p1, p2, ps] = matches[i]!;
      if (ps.some((p) => need[p]! === 0)) continue;
      let add = 0;
      for (const k of [p1, p2]) {
        if ((pairCount.get(k) ?? 0) >= 1) add++;
        pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
      }
      for (const p of ps) need[p]!--;
      rec(i, left - 1, repeats + add);
      for (const p of ps) need[p]!++;
      for (const k of [p1, p2]) pairCount.set(k, pairCount.get(k)! - 1);
    }
  };
  rec(0, total, 0);
  return best;
}

const SEEDS = [1, 2, 3, 42, 2024, 99991];

describe('scheduler partner repeats are optimal (brute force, N = 4..7)', { timeout: 600000 }, () => {
  for (let N = 4; N <= 7; N++) {
    for (const m of validMatchCounts(N)) {
      it(`N=${N} m=${m}`, () => {
        const opt = optimalPartnerRepeats(N, m);
        for (const seed of SEEDS) {
          let t = 0;
          const s = buildSchedule(N, m, 1e9, { random: mulberry32(seed), now: () => t++ });
          expect(s, `N=${N} m=${m} seed=${seed}`).not.toBeNull();
          expect(s!.stats.partnerRepeats, `N=${N} m=${m} seed=${seed} optimal=${opt}`).toBe(opt);
        }
      });
    }
  }
});
