import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { checkScore, type TieRule } from './index';

// Original checkScore from the root index.html (read only).
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
const sandbox: any = {};
vm.createContext(sandbox);
vm.runInContext(extract('checkScore') + '\nthis.checkScore=checkScore;', sandbox);

const TO = [7, 11, 15, 21];
const WEIRD = [1.5, NaN, Infinity, -Infinity, -0.5];
const WHOLE_MSG = 'Enter both scores as whole numbers.';

function candidates(to: number): number[] {
  const xs: number[] = [];
  for (let n = -2; n <= to + 6; n++) xs.push(n);
  return [...xs, ...WEIRD];
}

describe('golden point: exact valid set', () => {
  for (const to of TO) {
    it(`to ${to}: valid set is exactly {(to,k),(k,to) : k in 0..to-1}`, () => {
      const expected = new Set<string>();
      for (let k = 0; k < to; k++) {
        expected.add(`${to},${k}`);
        expected.add(`${k},${to}`);
      }
      const got = new Set<string>();
      const xs = candidates(to);
      for (const a of xs) for (const b of xs) if (checkScore(a, b, to, 'golden') === null) got.add(`${a},${b}`);
      expect([...got].sort()).toEqual([...expected].sort());
    });

    it(`to ${to}: named rejections`, () => {
      for (const [a, b] of [
        [to, to],
        [to + 1, to - 1],
        [to + 1, to],
        [to + 2, to],
        [to - 1, to - 2],
      ] as const) {
        expect(checkScore(a, b, to, 'golden')).not.toBeNull();
        expect(checkScore(b, a, to, 'golden')).not.toBeNull();
      }
    });
  }

  it('is order independent (null-ness symmetric), property based', () => {
    const num = fc.oneof(fc.integer({ min: -3, max: 30 }), fc.double({ min: -3, max: 30 }), fc.constantFrom(NaN, Infinity));
    fc.assert(
      fc.property(num, num, fc.constantFrom(...TO), (a, b, to) => {
        expect(checkScore(a, b, to, 'golden') === null).toBe(checkScore(b, a, to, 'golden') === null);
      }),
      { seed: 424242, numRuns: 1000 },
    );
  });
});

describe('golden point: messages (to = 11)', () => {
  it('accepts 11-10 and 10-11', () => {
    expect(checkScore(11, 10, 11, 'golden')).toBeNull();
    expect(checkScore(10, 11, 11, 'golden')).toBeNull();
  });
  it('rejects 10-10, 12-10, 9-8, 11-11 naming target and golden rule', () => {
    for (const [a, b] of [
      [10, 10],
      [12, 10],
      [9, 8],
      [11, 11],
    ] as const) {
      const msg = checkScore(a, b, 11, 'golden');
      expect(msg, `${a}-${b}`).not.toBeNull();
      expect(msg).toContain('11');
      expect(msg!.toLowerCase()).toContain('golden');
      expect(msg!.toLowerCase()).not.toContain('official');
    }
  });
  it('messages name the target for every points-to-play and never say official', () => {
    for (const to of TO) {
      const msg = checkScore(to, to, to, 'golden');
      expect(msg).toContain(String(to));
      expect(msg!.toLowerCase()).toContain('golden');
      expect(msg!.toLowerCase()).not.toContain('official');
    }
  });
  it('non-integer or negative input returns the whole-number message', () => {
    for (const to of TO)
      for (const [a, b] of [
        [1.5, to],
        [to, 1.5],
        [NaN, to],
        [to, NaN],
        [Infinity, 3],
        [-0.5, to],
        [-1, to],
        [to, -1],
      ] as const)
        expect(checkScore(a, b, to, 'golden'), `${a},${b},${to}`).toBe(WHOLE_MSG);
  });
});

describe('win2 is identical to the original checkScore (differential)', () => {
  const rules: Array<TieRule | undefined> = ['win2', undefined];
  it('exhaustive grid incl. non-integers, explicit and default', () => {
    for (const to of TO) {
      const xs = [...Array.from({ length: to + 10 }, (_, i) => i - 3), ...WEIRD];
      for (const a of xs)
        for (const b of xs) {
          const ref = sandbox.checkScore(a, b, to);
          expect(checkScore(a, b, to, 'win2')).toBe(ref);
          expect(checkScore(a, b, to)).toBe(ref);
        }
    }
  });
  it('random inputs', () => {
    const num = fc.oneof(
      fc.integer({ min: -3, max: 40 }),
      fc.double({ min: -3, max: 40 }),
      fc.constantFrom(NaN, Infinity, -Infinity),
    );
    fc.assert(
      fc.property(num, num, fc.constantFrom(...TO), (a, b, to) => {
        const ref = sandbox.checkScore(a, b, to);
        for (const r of rules) expect(r === undefined ? checkScore(a, b, to) : checkScore(a, b, to, r)).toBe(ref);
      }),
      { seed: 987654, numRuns: 1000 },
    );
  });
});
