import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildSchedule, evaluate, validMatchCounts, type Match } from './index';

const counts = (N: number, ms: Match[]) => {
  const c = new Array<number>(N).fill(0);
  for (const m of ms) for (const p of [...m.t1, ...m.t2]) c[p]!++;
  return c;
};

describe('validMatchCounts', () => {
  it('only returns m with N*m divisible by 4 and 1 <= m <= N-1, and all of them', () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 40 }), (N) => {
        const v = validMatchCounts(N);
        const expected: number[] = [];
        for (let m = 1; m <= N - 1; m++) if ((N * m) % 4 === 0) expected.push(m);
        expect(v).toEqual(expected);
        for (const m of v) {
          expect((N * m) % 4).toBe(0);
          expect(m).toBeLessThanOrEqual(N - 1);
        }
      }),
    );
  });
  it('known values', () => {
    expect(validMatchCounts(5)).toEqual([4]);
    expect(validMatchCounts(8)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(validMatchCounts(6)).toEqual([2, 4]);
    expect(validMatchCounts(7)).toEqual([4]);
  });
});

describe('buildSchedule structure (property)', () => {
  it('gives every player exactly m matches, 4 distinct players per match, N*m/4 matches', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 20 }).chain((N) => {
          const v = validMatchCounts(N);
          return v.length ? fc.tuple(fc.constant(N), fc.constantFrom(...v)) : fc.constant([N, 0] as [number, number]);
        }),
        ([N, m]) => {
          fc.pre(m > 0);
          const s = buildSchedule(N, m, 50);
          expect(s).not.toBeNull();
          const ms = s!.matches;
          expect(ms.length).toBe((N * m) / 4);
          for (const x of ms) {
            const four = [...x.t1, ...x.t2];
            expect(new Set(four).size).toBe(4);
            for (const p of four) {
              expect(Number.isInteger(p)).toBe(true);
              expect(p).toBeGreaterThanOrEqual(0);
              expect(p).toBeLessThan(N);
            }
          }
          expect(counts(N, ms)).toEqual(new Array(N).fill(m));
          expect(s!.stats).toEqual(evaluate(ms));
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('evaluate', () => {
  it('counts repeated partners, opponents and back-to-back', () => {
    const ms: Match[] = [
      { t1: [0, 1], t2: [2, 3] },
      { t1: [0, 1], t2: [4, 5] }, // partners 0-1 repeat; 0,1 back-to-back (2)
      { t1: [6, 7], t2: [8, 9] }, // nothing repeats, nobody from previous match
    ];
    const e = evaluate(ms);
    expect(e.partnerRepeats).toBe(1);
    expect(e.backToBack).toBe(2);
    expect(e.oppRepeats).toBe(0);
    expect(evaluate([{ t1: [0, 1], t2: [2, 3] }, { t1: [0, 2], t2: [1, 3] }]).oppRepeats).toBe(2);
  });
});

describe('buildSchedule quality where avoidable', () => {
  // Partner repeats avoidable whenever m <= N-1 and N large enough for a rotation; test generous, well-supplied cases.
  const cases: [number, number][] = [[8, 3], [9, 4], [12, 3], [12, 5], [16, 4], [10, 2]];
  for (const [N, m] of cases) {
    it(`N=${N} m=${m}: no repeated partners`, () => {
      const s = buildSchedule(N, m, 300)!;
      expect(s.stats.partnerRepeats).toBe(0);
    });
  }
  it('N=12 m=3: no back-to-back matches (many players per court rotation)', () => {
    const s = buildSchedule(12, 3, 300)!;
    expect(s.stats.backToBack).toBe(0);
  });
  it('N=16 m=4: no back-to-back', () => {
    expect(buildSchedule(16, 4, 300)!.stats.backToBack).toBe(0);
  });
  it('max m (N-1) for N=8 still yields equal match counts', () => {
    const s = buildSchedule(8, 7, 1500)!;
    expect(counts(8, s.matches)).toEqual(new Array(8).fill(7));
  });
});
