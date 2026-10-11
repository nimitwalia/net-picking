import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { finalFour, pickTeams, resolveFinalTeams, tieAtCutoff, type StandingRow } from './index';

const row = (name: string, o: Partial<StandingRow> = {}): StandingRow => ({
  name,
  p: 5,
  w: 3,
  l: 2,
  pts: 10,
  diff: 0,
  pf: 40,
  ...o,
});
const strength = (r: StandingRow) => r.pts + r.diff * 0.001;
const teamStr = (t: StandingRow[]) => t.reduce((s, r) => s + strength(r), 0);

/** n distinct rows, strictly descending on pts. */
const distinct = (n: number) => Array.from({ length: n }, (_, i) => row(`P${i}`, { pts: 30 - i * 3, w: 10 - i, pf: 100 - i }));
/** n rows where rows[3] and rows[4] are level on pts, w, diff, pf (names differ). */
const tied = (n = 6) => {
  const r = distinct(n);
  r[4] = { ...r[3]!, name: 'Tied5' };
  return r;
};

describe('tieAtCutoff', () => {
  it('is false with fewer than 5 rows', () => {
    for (let n = 0; n <= 4; n++) expect(tieAtCutoff(distinct(n))).toBe(false);
  });
  it('is false when any single field differs', () => {
    for (const k of ['pts', 'w', 'diff', 'pf'] as const) {
      const r = tied();
      r[4] = { ...r[4]!, [k]: r[4]![k] + 1 };
      expect(tieAtCutoff(r), k).toBe(false);
    }
  });
  it('is true when pts, w, diff and pf all equal (names/p/l irrelevant to spec)', () => {
    expect(tieAtCutoff(tied())).toBe(true);
    expect(tieAtCutoff(tied(5))).toBe(true);
  });
});

describe('finalFour', () => {
  it('throws a clear Error with fewer than 4 rows', () => {
    for (let n = 0; n < 4; n++) {
      expect(() => finalFour(distinct(n), false)).toThrow(Error);
      expect(() => finalFour(distinct(n), true)).toThrow(Error);
    }
  });
  it('returns exactly the 4 rows when given 4 (even with tieSwap)', () => {
    const r = distinct(4);
    expect(finalFour(r, false)).toEqual(r);
    expect(finalFour(r, true)).toEqual(r);
  });
  it('returns the first 4 when there is no tie and no swap', () => {
    const r = distinct(7);
    expect(finalFour(r, false)).toEqual(r.slice(0, 4));
  });
  it('tie + tieSwap replaces the 4th with rows[4]', () => {
    const r = tied();
    expect(finalFour(r, true)).toEqual([r[0], r[1], r[2], r[4]]);
  });
  it('tie without tieSwap does not swap', () => {
    const r = tied();
    expect(finalFour(r, false)).toEqual(r.slice(0, 4));
  });
  it('tieSwap is ignored when there is no tie at the cutoff', () => {
    const r = distinct(6);
    expect(tieAtCutoff(r)).toBe(false);
    expect(finalFour(r, true)).toEqual(r.slice(0, 4));
  });
  it('3-way tie for 4th: only rows[3] and rows[4] can swap (kept quirk)', () => {
    const r = tied(7);
    r[5] = { ...r[3]!, name: 'Tied6' };
    expect(finalFour(r, true)).toEqual([r[0], r[1], r[2], r[4]]);
    expect(finalFour(r, true).map((x) => x.name)).not.toContain('Tied6');
  });
  it('does not mutate or re-sort its input', () => {
    const r = tied();
    const copy = JSON.parse(JSON.stringify(r));
    finalFour(r, true);
    expect(r).toEqual(copy);
    const unsorted = [row('a', { pts: 1 }), row('b', { pts: 9 }), row('c', { pts: 5 }), row('d', { pts: 7 })];
    expect(finalFour(unsorted, false).map((x) => x.name)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('pickTeams', () => {
  const four = (pts: number[], diff: number[] = [0, 0, 0, 0]) => pts.map((p, i) => row(`P${i}`, { pts: p, diff: diff[i]! }));
  const split = (f: StandingRow[]) => {
    const t = pickTeams(f);
    return [t.A.map((r) => r.name), t.B.map((r) => r.name)];
  };

  it('throws a clear Error with fewer than 4 rows', () => {
    for (let n = 0; n < 4; n++) expect(() => pickTeams(distinct(n))).toThrow(Error);
  });
  it('pairing 1 ([0,3] v [1,2]) can win', () => {
    // p1: 12+6 v 9+9 = 0 ; p2: 21 v 15 = 6 ; p3: 21 v 15 = 6
    expect(split(four([12, 9, 9, 6]))).toEqual([['P0', 'P3'], ['P1', 'P2']]);
  });
  it('pairing 2 ([0,2] v [1,3]) can win (input is never re-sorted, so unsorted rows reach it)', () => {
    // p1: 19 v 1 = 18 ; p2: 10 v 10 = 0 ; p3: 11 v 9 = 2
    expect(split(four([10, 1, 0, 9]))).toEqual([['P0', 'P2'], ['P1', 'P3']]);
  });
  it('pairing 3 ([0,1] v [2,3]) can win', () => {
    // p1: 15 v 5 = 10 ; p2: 15 v 5 = 10 ; p3: 10 v 10 = 0
    expect(split(four([10, 0, 5, 5]))).toEqual([['P0', 'P1'], ['P2', 'P3']]);
  });
  it('exact ties keep the earliest pairing', () => {
    expect(split(four([5, 5, 5, 5]))).toEqual([['P0', 'P3'], ['P1', 'P2']]);
    // p1 gap 4, p2 gap 2, p3 gap 2 (exact tie between p2 and p3): p2 is kept
    expect(split(four([3, 0, 0, 1]))).toEqual([['P0', 'P2'], ['P1', 'P3']]);
  });
  it('a later pairing better by less than 1e-9 does not replace best', () => {
    // strengths [5+x,5,5,5+y]: p1 gap x+y = 1.4e-9 ; p2/p3 gap x-y = 6e-10 (better by 8e-10 < 1e-9)
    expect(split(four([5 + 1e-9, 5, 5, 5 + 4e-10]))).toEqual([['P0', 'P3'], ['P1', 'P2']]);
  });
  it('a later pairing better by more than 1e-9 does replace best', () => {
    // p1 gap 2e-9 ; p2 gap 0 (better by 2e-9 > 1e-9)
    expect(split(four([5 + 1e-9, 5, 5, 5 + 1e-9]))).toEqual([['P0', 'P2'], ['P1', 'P3']]);
  });
  it('strength includes diff: diff 1000 is worth 1 point', () => {
    // pts-only [5,5,5,5] would pick p1; with diff P0=+3000 (3 pts), P1=+1000: strengths 8,6,5,5
    // p1: 13 v 11 = 2 ; p2: 13 v 11 = 2 ; p3: 14 v 10 = 4  -> p1
    expect(split(four([5, 5, 5, 5], [3000, 1000, 0, 0]))).toEqual([['P0', 'P3'], ['P1', 'P2']]);
    // strengths 5,5,5,5+2=7 (P3 diff 2000): p1 12 v 10 = 2 ; p2 10 v 12 = 2 ; p3 10 v 12 = 2 -> p1 (tie)
    // strengths 5,5,6,5 via P2 diff 1000: p1 10 v 11 = 1 ; p2 11 v 10 = 1 ; p3 10 v 11 = 1 -> p1
    // strengths [5,4,4,3] with diff: P0 pts4 +1000 -> 5 ; P1 4 ; P2 4 ; P3 pts 3 -> p1 8 v 8 = 0 ; vs pts-only [4,4,4,3]: p1 7 v 8 = 1, p2 8 v 7 = 1 -> still p1
    // discriminating: pts [0,0,0,0], diff [2000,0,1000,1000]: strengths 2,0,1,1: p1 3 v 1 = 2 ; p2 3 v 1 = 2 ; p3 2 v 2 = 0 -> p3
    expect(split(four([0, 0, 0, 0], [2000, 0, 1000, 1000]))).toEqual([['P0', 'P1'], ['P2', 'P3']]);
  });
  it('returns row objects from the input, 2 per side', () => {
    const f = four([10, 1, 0, 9]);
    const t = pickTeams(f);
    expect(t.A).toHaveLength(2);
    expect(t.B).toHaveLength(2);
    for (const r of [...t.A, ...t.B]) expect(f).toContain(r);
  });
});

describe('resolveFinalTeams', () => {
  const q = [row('q0'), row('q1'), row('q2'), row('q3')];
  it('teams win over seeds', () => {
    const teams = { A: [row('x'), row('y')], B: [row('z'), row('w')] };
    expect(resolveFinalTeams({ teams, seeds: q } as any)).toEqual({ A: teams.A, B: teams.B });
  });
  it('legacy seeds give A=[q0,q3], B=[q1,q2]', () => {
    expect(resolveFinalTeams({ seeds: q } as any)).toEqual({ A: [q[0], q[3]], B: [q[1], q[2]] });
  });
  it('does not mutate its argument', () => {
    const f = { seeds: q };
    const copy = JSON.parse(JSON.stringify(f));
    resolveFinalTeams(f as any);
    expect(f).toEqual(copy);
  });
});

// ---------------------------------------------------------------- properties
const FC = { seed: 424242, numRuns: 500 };
const rowArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 4 }),
  p: fc.integer({ min: 0, max: 20 }),
  w: fc.integer({ min: 0, max: 20 }),
  l: fc.integer({ min: 0, max: 20 }),
  pts: fc.integer({ min: -20, max: 60 }),
  diff: fc.integer({ min: -100, max: 100 }),
  pf: fc.integer({ min: 0, max: 200 }),
});
const fourArb = fc.array(rowArb, { minLength: 4, maxLength: 4 });
/** small value ranges so exact ties are common */
const tieRowArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 4 }),
  p: fc.constant(5),
  w: fc.integer({ min: 0, max: 2 }),
  l: fc.constant(0),
  pts: fc.integer({ min: 0, max: 3 }),
  diff: fc.integer({ min: 0, max: 2 }),
  pf: fc.constant(10),
});

describe('pickTeams properties', () => {
  const candidates: number[][][] = [
    [[0, 3], [1, 2]],
    [[0, 2], [1, 3]],
    [[0, 1], [2, 3]],
  ];

  const gapsOf = (f: StandingRow[]) =>
    candidates.map((c) => {
      const sum = (ix: number[] | undefined) => (ix ?? []).reduce((t, i) => t + strength(f[i]!), 0);
      return Math.abs(sum(c[0]) - sum(c[1]));
    });

  it('A and B are disjoint 2-row sides that together equal the four', () => {
    fc.assert(
      fc.property(fourArb, (f) => {
        const { A, B } = pickTeams(f);
        expect(A).toHaveLength(2);
        expect(B).toHaveLength(2);
        const idx = [...A, ...B].map((r) => f.indexOf(r));
        // rows from fast-check may be structurally equal but are distinct objects
        expect(idx.every((i) => i >= 0)).toBe(true);
        expect([...idx].sort()).toEqual([0, 1, 2, 3]);
      }),
      FC,
    );
  });

  it('chosen split has the minimum gap of the 3 candidates', () => {
    fc.assert(
      fc.property(fourArb, (f) => {
        const { A, B } = pickTeams(f);
        const gap = Math.abs(teamStr(A) - teamStr(B));
        const gaps = gapsOf(f);
        expect(gap).toBeLessThanOrEqual(Math.min(...gaps) + 1e-9);
      }),
      FC,
    );
  });

  it('picks the earliest pairing within 1e-9 of the minimum (exact ties go earliest)', () => {
    fc.assert(
      fc.property(fc.oneof(fourArb, fc.array(tieRowArb, { minLength: 4, maxLength: 4 })), (f) => {
        const gaps = gapsOf(f);
        // reference of the documented rule
        let best = 0;
        for (let k = 1; k < 3; k++) if (gaps[k]! < gaps[best]! - 1e-9) best = k;
        const { A, B } = pickTeams(f);
        expect(A).toEqual((candidates[best]![0] ?? []).map((i) => f[i]));
        expect(B).toEqual((candidates[best]![1] ?? []).map((i) => f[i]));
      }),
      FC,
    );
  });

  it('is deterministic and does not mutate input', () => {
    fc.assert(
      fc.property(fourArb, (f) => {
        const copy = JSON.parse(JSON.stringify(f));
        const a = pickTeams(f);
        const b = pickTeams(f);
        expect(a).toEqual(b);
        expect(f).toEqual(copy);
      }),
      FC,
    );
  });

  it('works for 5+ rows by using only the first four (extra rows ignored) or throws never', () => {
    // spec only defines >=4 rows as valid; just assert no throw and results from the input
    fc.assert(
      fc.property(fc.array(rowArb, { minLength: 4, maxLength: 8 }), (f) => {
        expect(() => pickTeams(f)).not.toThrow();
      }),
      FC,
    );
  });
});

describe('finalFour properties', () => {
  it('result length 4, prefix of input except possibly slot 4 = rows[4] iff tie && tieSwap', () => {
    fc.assert(
      fc.property(fc.array(tieRowArb, { minLength: 4, maxLength: 9 }), fc.boolean(), (rows, swap) => {
        const got = finalFour(rows, swap);
        expect(got).toHaveLength(4);
        expect(got.slice(0, 3)).toEqual(rows.slice(0, 3));
        const shouldSwap = swap && rows.length >= 5 && ['pts', 'w', 'diff', 'pf'].every((k) => (rows[3] as any)[k] === (rows[4] as any)[k]);
        expect(got[3]).toEqual(shouldSwap ? rows[4] : rows[3]);
        expect(finalFour(rows, swap)).toEqual(got);
      }),
      FC,
    );
  });
});

// ---------------------------------------------------------------- differential
const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../index.html'), 'utf8');
function extract(name: string): string {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in index.html`);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) break;
  }
  return html.slice(start, i + 1);
}
const sandbox: any = { S: { tieSwap: false, finals: null } };
vm.createContext(sandbox);
vm.runInContext(
  [extract('tieAtCutoff'), extract('finalFour'), extract('pickTeams'), extract('finalTeams')].join('\n') +
    '\nthis.finalFour=finalFour;this.pickTeams=pickTeams;this.finalTeams=finalTeams;',
  sandbox,
);
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('differential: finals vs original index.html', () => {
  it('pickTeams agrees on random fours (including heavy ties and tiny diffs)', () => {
    fc.assert(
      fc.property(fc.oneof(fourArb, fc.array(tieRowArb, { minLength: 4, maxLength: 4 })), (f) => {
        expect(plain(pickTeams(f))).toEqual(plain(sandbox.pickTeams(plain(f))));
      }),
      FC,
    );
  });

  it('pickTeams agrees at the 1e-9 boundary', () => {
    const bump = fc.constantFrom(0, 1e-7, 5e-7, 1e-6, 2e-6, 1e-5);
    fc.assert(
      fc.property(fc.array(bump, { minLength: 4, maxLength: 4 }), (d) => {
        const f = d.map((x, i) => row(`P${i}`, { pts: 5, diff: x }));
        expect(plain(pickTeams(f))).toEqual(plain(sandbox.pickTeams(plain(f))));
      }),
      FC,
    );
  });

  it('finalFour agrees for >= 4 rows with and without tieSwap', () => {
    fc.assert(
      fc.property(fc.array(tieRowArb, { minLength: 4, maxLength: 9 }), fc.boolean(), (rows, swap) => {
        sandbox.S = { tieSwap: swap, finals: null };
        expect(plain(finalFour(rows, swap))).toEqual(plain(sandbox.finalFour(plain(rows))));
      }),
      FC,
    );
  });

  it('resolveFinalTeams agrees with original finalTeams (teams and legacy seeds)', () => {
    fc.assert(
      fc.property(fourArb, fourArb, fc.boolean(), (a, b, useTeams) => {
        const finals = useTeams ? { teams: { A: a.slice(0, 2), B: b.slice(0, 2) }, seeds: b } : { seeds: a };
        sandbox.S = { tieSwap: false, finals: plain(finals) };
        expect(plain(resolveFinalTeams(finals as any))).toEqual(plain(sandbox.finalTeams()));
      }),
      FC,
    );
  });
});
