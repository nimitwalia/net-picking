import { describe, expect, it } from 'vitest';
import { checkScore } from './index';

const TO = [7, 11, 15, 21];
// Independent oracle: final iff winner has >= to and leads by exactly 2 once past `to`,
// or reaches `to` leading by >= 2.
const valid = (a: number, b: number, to: number) => {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return hi >= to && hi - lo >= 2 && (hi === to || hi - lo === 2);
};

describe('checkScore win-by-2', () => {
  for (const to of TO) {
    describe(`to ${to}`, () => {
      it('accepts normal wins', () => {
        for (let lo = 0; lo <= to - 2; lo++) {
          expect(checkScore(to, lo, to)).toBeNull();
          expect(checkScore(lo, to, to)).toBeNull();
        }
      });
      it('accepts deuce finishes (lead by exactly 2 past target)', () => {
        for (let lo = to - 1; lo < to + 10; lo++) {
          expect(checkScore(lo + 2, lo, to)).toBeNull();
          expect(checkScore(lo, lo + 2, to)).toBeNull();
        }
      });
      it('rejects target reached without a 2 point lead', () => {
        expect(checkScore(to, to - 1, to)).not.toBeNull();
        expect(checkScore(to - 1, to, to)).not.toBeNull();
        expect(checkScore(to + 1, to, to)).not.toBeNull();
        expect(checkScore(to + 5, to + 4, to)).not.toBeNull();
      });
      it('rejects ties and under-target scores', () => {
        expect(checkScore(to, to, to)).not.toBeNull();
        expect(checkScore(0, 0, to)).not.toBeNull();
        expect(checkScore(to - 1, to - 3, to)).not.toBeNull();
        expect(checkScore(to - 1, 0, to)).not.toBeNull();
      });
      it('rejects overshoot that could not occur (lead > 2 past target)', () => {
        expect(checkScore(to + 3, to - 1, to)).not.toBeNull();
        expect(checkScore(to + 4, to, to)).not.toBeNull();
        expect(checkScore(to + 10, 2, to)).not.toBeNull();
      });
      it('rejects non-integers and negatives', () => {
        expect(checkScore(to, 1.5, to)).not.toBeNull();
        expect(checkScore(NaN, 3, to)).not.toBeNull();
        expect(checkScore(-1, to, to)).not.toBeNull();
      });
      it('matches the oracle for every score 0..to+12', () => {
        for (let a = 0; a <= to + 12; a++)
          for (let b = 0; b <= to + 12; b++)
            expect(checkScore(a, b, to) === null, `${a}-${b} to ${to}`).toBe(valid(a, b, to));
      });
    });
  }
});
