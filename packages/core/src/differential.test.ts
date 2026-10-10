import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { checkScore, standings, tieAtCutoff, type PlayedMatch } from './index';

// Extract the original functions from index.html (read only) by brace-matching their source text.
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
// The original standings() reads global S; we set S per call.
const sandbox: any = { S: { players: [], matches: [] } };
vm.createContext(sandbox);
vm.runInContext(
  [extract('checkScore'), extract('standings'), extract('tieAtCutoff')].join('\n') +
    '\nthis.checkScore=checkScore;this.standings=standings;this.tieAtCutoff=tieAtCutoff;',
  sandbox,
);
const origStandings = (players: string[], matches: any[], upTo?: number) => {
  sandbox.S = { players, matches };
  return JSON.parse(JSON.stringify(sandbox.standings(upTo)));
};

const FC = { seed: 987654, numRuns: 500 };

describe('differential: core vs original index.html', () => {
  it('checkScore agrees on exhaustive small grid for every points-to-play', () => {
    for (const to of [7, 11, 15, 21])
      for (let a = -1; a <= to + 6; a++)
        for (let b = -1; b <= to + 6; b++) expect(checkScore(a, b, to)).toBe(sandbox.checkScore(a, b, to));
  });

  it('checkScore agrees on random inputs including non-integers and NaN', () => {
    const num = fc.oneof(
      fc.integer({ min: -3, max: 40 }),
      fc.double({ min: -3, max: 40, noNaN: false }),
      fc.constantFrom(NaN, Infinity, -Infinity),
    );
    fc.assert(
      fc.property(num, num, fc.constantFrom(7, 11, 15, 21), (a, b, to) => {
        expect(checkScore(a, b, to)).toBe(sandbox.checkScore(a, b, to));
      }),
      FC,
    );
  });

  const matchArb = (n: number) =>
    fc
      .shuffledSubarray(Array.from({ length: n }, (_, i) => i), { minLength: 4, maxLength: 4 })
      .chain(([a, b, c, d]) =>
        fc.record({
          t1: fc.constant([a!, b!]),
          t2: fc.constant([c!, d!]),
          winner: fc.constantFrom(null, undefined, 1, 2),
          s1: fc.oneof(fc.integer({ min: 0, max: 25 }), fc.constantFrom(null, undefined)),
          s2: fc.oneof(fc.integer({ min: 0, max: 25 }), fc.constantFrom(null, undefined)),
        }),
      );

  it('standings (and tieAtCutoff) agree on random tournaments, including upTo and missing scores', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 12 }).chain((n) =>
          fc.record({
            n: fc.constant(n),
            ms: fc.array(matchArb(n), { maxLength: 30 }),
            // duplicate-ish names exercise the localeCompare tiebreak
            names: fc.array(fc.constantFrom('Al', 'al', 'Bo', 'Cy', 'Émile', 'Zed', 'x'), { minLength: n, maxLength: n }),
            upTo: fc.option(fc.integer({ min: 0, max: 35 }), { nil: undefined }),
          }),
        ),
        ({ ms, names, upTo }) => {
          const ref = origStandings(names, JSON.parse(JSON.stringify(ms)), upTo);
          const got = standings(names, ms as PlayedMatch[], upTo);
          expect(got).toEqual(ref);
          sandbox.rows = ref;
          expect(tieAtCutoff(got)).toBe(vm.runInContext('tieAtCutoff(rows)', sandbox));
        },
      ),
      FC,
    );
  });
});
