import { describe, expect, it } from 'vitest';
import { standings, type PlayedMatch } from './index';

const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const row = (rows: ReturnType<typeof standings>, n: string) => rows.find((r) => r.name === n)!;

describe('standings scoring', () => {
  it('gives +3 per winner and -1 per loser, each player individually', () => {
    const m: PlayedMatch[] = [{ t1: [0, 1], t2: [2, 3], winner: 1, s1: 11, s2: 4 }];
    const r = standings(names, m);
    for (const n of ['A', 'B']) expect(row(r, n)).toMatchObject({ p: 1, w: 1, l: 0, pts: 3, diff: 7, pf: 11 });
    for (const n of ['C', 'D']) expect(row(r, n)).toMatchObject({ p: 1, w: 0, l: 1, pts: -1, diff: -7, pf: 4 });
    expect(row(r, 'E')).toMatchObject({ p: 0, pts: 0 });
  });
  it('team 2 winning is credited correctly, including deuce scores', () => {
    const m: PlayedMatch[] = [{ t1: [0, 1], t2: [2, 3], winner: 2, s1: 14, s2: 16 }];
    const r = standings(names, m);
    expect(row(r, 'C')).toMatchObject({ pts: 3, diff: 2, pf: 16 });
    expect(row(r, 'A')).toMatchObject({ pts: -1, diff: -2, pf: 14 });
  });
  it('accumulates across matches (pts = 3w - l)', () => {
    const m: PlayedMatch[] = [
      { t1: [0, 1], t2: [2, 3], winner: 1, s1: 11, s2: 9 },
      { t1: [0, 2], t2: [1, 3], winner: 2, s1: 5, s2: 11 },
      { t1: [0, 3], t2: [1, 2], winner: 1, s1: 11, s2: 0 },
    ];
    const r = standings(names, m);
    for (const x of r) expect(x.pts).toBe(3 * x.w - x.l);
    expect(row(r, 'A')).toMatchObject({ p: 3, w: 2, l: 1, pts: 5 });
    expect(row(r, 'B')).toMatchObject({ p: 3, w: 2, l: 1, pts: 5 });
    expect(row(r, 'C')).toMatchObject({ w: 0, l: 3, pts: -3 });
  });
  it('ignores unplayed matches and respects upTo', () => {
    const m: PlayedMatch[] = [
      { t1: [0, 1], t2: [2, 3], winner: 1, s1: 11, s2: 0 },
      { t1: [0, 1], t2: [2, 3], winner: null },
      { t1: [4, 5], t2: [6, 7], winner: 1, s1: 11, s2: 0 },
    ];
    expect(row(standings(names, m), 'E').pts).toBe(3);
    expect(row(standings(names, m, 1), 'E').pts).toBe(0);
    expect(row(standings(names, m, 1), 'A').pts).toBe(3);
    expect(standings(names, m).reduce((s, x) => s + x.p, 0)).toBe(8);
  });
  it('sorts by points descending', () => {
    const m: PlayedMatch[] = [{ t1: [0, 1], t2: [2, 3], winner: 2, s1: 1, s2: 11 }];
    const r = standings(names, m);
    expect(r.slice(0, 2).map((x) => x.name).sort()).toEqual(['C', 'D']);
    expect(r[r.length - 1]!.pts).toBe(-1);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.pts).toBeGreaterThanOrEqual(r[i]!.pts);
  });
});
