import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildSchedule, mulberry32, validMatchCounts, type Match } from './index';

// Independent re-computation of the rule metrics from the raw matches.
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const partnerRepeats = (ms: Match[]) => {
  const seen = new Map<string, number>();
  for (const m of ms) for (const p of [m.t1, m.t2]) seen.set(key(p[0], p[1]), (seen.get(key(p[0], p[1])) ?? 0) + 1);
  return [...seen.values()].reduce((s, c) => s + Math.max(0, c - 1), 0);
};
const backToBack = (ms: Match[]) => {
  let n = 0;
  for (let i = 1; i < ms.length; i++) {
    const prev = new Set([...ms[i - 1]!.t1, ...ms[i - 1]!.t2]);
    for (const p of [...ms[i]!.t1, ...ms[i]!.t2]) if (prev.has(p)) n++;
  }
  return n;
};

// Deterministic fake clock: advances one "ms" per call, so the scheduler's time budget is a fixed
// number of attempts (a constant clock would force all 800 attempts and be very slow for big N).
const run = (N: number, m: number, seed: number) => {
  let t = 0;
  return buildSchedule(N, m, 10, { random: mulberry32(seed), now: () => t++ });
};

// Valid (N, m) pairs per the AGENTS.md rule, plus a seed.
const validInput = fc
  .integer({ min: 4, max: 12 })
  .chain((N) => fc.constantFrom(...validMatchCounts(N)).map((m) => ({ N, m })))
  .chain((nm) => fc.integer({ min: 0, max: 2 ** 31 }).map((seed) => ({ ...nm, seed })));

// Valid (N, m) with m <= 3 and N in [lo, hi].
const roomy = (lo: number, hi: number) => {
  const out: { N: number; m: number }[] = [];
  for (let N = lo; N <= hi; N++) for (const m of validMatchCounts(N)) if (m <= 3) out.push({ N, m });
  return out;
};

const FC = { seed: 20240607, numRuns: 150 };

describe('scheduler property tests (seeded)', { timeout: 120000 }, () => {
  it('same seed gives an identical schedule', () => {
    fc.assert(
      fc.property(validInput, ({ N, m, seed }) => {
        expect(run(N, m, seed)).toEqual(run(N, m, seed));
      }),
      FC,
    );
    expect(run(8, 3, 42)).toEqual(run(8, 3, 42));
  });

  // KNOWN FAILURE (real bug, do not weaken): with N=13, m=4 the pool has C(13,4)=715 > 500
  // combinations, so candidateCombos shuffles with the default Math.random instead of the injected
  // RandomFn, and a seeded run is not reproducible.
  it('same seed gives an identical schedule for larger N (N>=13)', () => {
    for (const seed of [0, 1, 42]) expect(run(13, 4, seed)).toEqual(run(13, 4, seed));
  });

  it('structural invariants: each match has 4 distinct players, equal match counts, N*m/4 matches', () => {
    fc.assert(
      fc.property(validInput, ({ N, m, seed }) => {
        const s = run(N, m, seed)!;
        expect(s).not.toBeNull();
        expect(s.matches).toHaveLength((N * m) / 4);
        const c = new Array<number>(N).fill(0);
        for (const mt of s.matches) {
          const four = [...mt.t1, ...mt.t2];
          expect(new Set(four).size).toBe(4);
          for (const p of four) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThan(N);
            c[p]!++;
          }
        }
        expect(c.every((x) => x === m)).toBe(true);
      }),
      FC,
    );
  });

  it('reported stats match independently computed repeats and back-to-back counts', () => {
    fc.assert(
      fc.property(validInput, ({ N, m, seed }) => {
        const s = run(N, m, seed)!;
        expect(s.stats.partnerRepeats).toBe(partnerRepeats(s.matches));
        expect(s.stats.backToBack).toBe(backToBack(s.matches));
      }),
      FC,
    );
  });

  // Partner repeats are certainly avoidable when m <= 3 and N is large: each player needs m
  // distinct partners out of N-1. The rules only say "avoids", so the scheduler is heuristic; we
  // assert zero only in this clearly roomy regime (N >= 8, m <= 3) for fixed seeds.
  it('no repeated partners where clearly avoidable (N>=8, m<=3)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...roomy(8, 14)),
        fc.integer({ min: 0, max: 2 ** 31 }),
        ({ N, m }, seed) => {
          expect(partnerRepeats(run(N, m, seed)!.matches)).toBe(0);
        },
      ),
      FC,
    );
  });

  // Back-to-back is unavoidable for N<8 (only <4 players can rest). For N>=8 the rules say avoid;
  // asserted only in the roomy regime N>=12 and m<=3 with fixed seeds.
  it('no back-to-back matches where clearly avoidable (N>=12, m<=3)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...roomy(12, 16)),
        fc.integer({ min: 0, max: 2 ** 31 }),
        ({ N, m }, seed) => {
          expect(backToBack(run(N, m, seed)!.matches)).toBe(0);
        },
      ),
      FC,
    );
  });

  it('back-to-back is unavoidable for N<8 (documented, not asserted as zero)', () => {
    const s = run(6, 2, 1)!;
    expect(s.matches).toHaveLength(3);
    expect(backToBack(s.matches)).toBeGreaterThan(0);
  });
});
