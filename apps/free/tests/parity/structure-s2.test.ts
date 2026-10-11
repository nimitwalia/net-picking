// Stage S2: scheduler moved to @net-picking/core. main.js must not define the scheduler helpers itself and
// Math.random / Date.now may appear only where they are injected into buildSchedule.
import { describe, expect, it } from 'vitest';
import { blankLiterals, definesLocally, matchClose, readMain, readRootScript, stripComments, coreLocal } from './src-helpers';

const MOVED = ['shuffle', 'pk', 'combosOf', 'nCk', 'candidateCombos', 'splitsOf', 'trySchedule', 'evaluate', 'buildSchedule', 'validMatchCounts'];

describe('detector sanity against the root script (the oracle defines all of them locally)', () => {
  const rootCode = blankLiterals(stripComments(readRootScript()));
  for (const f of MOVED) it(`detects ${f} in the root`, () => expect(definesLocally(rootCode, f)).toBe(true));
});

describe('(a) scheduler functions come from core, not main.js', () => {
  const nc = stripComments(readMain());
  const code = blankLiterals(nc);
  for (const f of MOVED) it(`main.js does not define ${f}`, () => expect(definesLocally(code, f), f).toBe(false));
  it('buildSchedule and validMatchCounts are imported from @net-picking/core', () => {
    expect(coreLocal(nc, 'buildSchedule')).toBe('buildSchedule');
    expect(coreLocal(nc, 'validMatchCounts')).toBe('validMatchCounts');
  });
});

describe('(b) Math.random and Date.now only at the injection site', () => {
  const code = blankLiterals(stripComments(readMain()));
  const sites = (needle: RegExp) => [...code.matchAll(needle)].map((m) => m.index!);
  const calls = [...code.matchAll(/(?<![\w$.])buildSchedule\s*\(/g)].map((m) => {
    const open = m.index! + m[0].length - 1;
    return { open, close: matchClose(code, open), text: '' };
  });
  for (const c of calls) c.text = code.slice(c.open, c.close + 1);
  it('there is at least one buildSchedule call and each injects random: Math.random, now: Date.now', () => {
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.text.replace(/\s+/g, '')).toMatch(/random:Math\.random/);
      expect(c.text.replace(/\s+/g, '')).toMatch(/now:Date\.now/);
    }
  });
  for (const [label, re] of [['Math.random', /(?<![\w$])Math\s*\.\s*random(?![\w$])/g], ['Date.now', /(?<![\w$])Date\s*\.\s*now(?![\w$])/g]] as Array<[string, RegExp]>) {
    it(`every ${label} is inside a buildSchedule(...) call`, () => {
      const at = sites(re);
      expect(at.length, `${label} must be injected at least once`).toBeGreaterThan(0);
      for (const i of at) expect(calls.some((c) => i > c.open && i < c.close), `${label} at offset ${i} outside the injection site`).toBe(true);
    });
  }
  it('no bracket/alias access to Math.random or Date.now', () => {
    expect(/Math\s*\[|Date\s*\[|\{\s*random\s*\}\s*=\s*Math/.test(code)).toBe(false);
  });
});
