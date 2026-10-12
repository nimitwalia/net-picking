// Stage S3: scoring and standings from core. main.js keeps thin adapters named `standings` and `tieAtCutoff`
// (so the render code is unchanged) but they only delegate; checkScore comes from core.
import { describe, expect, it } from 'vitest';
import { blankLiterals, coreLocal, definesLocally, localBody, readMain, readRootScript, squash, stripComments } from './src-helpers';

describe('detector sanity against the root script', () => {
  const rootCode = blankLiterals(stripComments(readRootScript()));
  for (const f of ['checkScore', 'standings', 'tieAtCutoff']) it(`detects ${f} in the root`, () => expect(definesLocally(rootCode, f)).toBe(true));
  it('detects the root standings body logic', () => {
    expect(squash(localBody(rootCode, 'standings')!)).toContain('pts+=3');
  });
});

describe('S3 rules for main.js', () => {
  const nc = stripComments(readMain());
  const code = blankLiterals(nc);

  it('imports checkScore, standings and tieAtCutoff from @net-picking/core', () => {
    for (const n of ['checkScore', 'standings', 'tieAtCutoff']) expect(coreLocal(nc, n), n).not.toBeNull();
  });
  it('checkScore is not defined locally', () => {
    expect(definesLocally(code, 'checkScore')).toBe(false);
  });
  for (const [name, forbidden] of [['standings', ['pts+=3', 'pts-=1', '.sort(']], ['tieAtCutoff', ['.pts', '.diff', '.pf', '.w===']]] as Array<[string, string[]]>) {
    it(`a local ${name} (if any) only delegates to the imported core ${name}`, () => {
      const alias = coreLocal(nc, name)!;
      const body = localBody(code, name);
      if (alias === name) {
        expect(body, `${name} is imported under its own name, so it cannot also be defined locally`).toBeNull();
        return;
      }
      if (body === null) return; // aliased import with no local adapter: the call sites use the alias
      const sq = squash(body);
      expect(new RegExp(`(?<![\\w$.])${alias}\\s*\\(`).test(body), `${name} must call core ${alias}(...)`).toBe(true);
      for (const f of forbidden) expect(sq.includes(f), `${name} adapter must not contain ${f}`).toBe(false);
    });
  }
  it('no scoring arithmetic anywhere in main.js (win +3 / loss -1 lives in core)', () => {
    const sq = squash(code);
    expect(code).not.toMatch(/(?<![\w$])pts\s*[+\-*]?=(?![=>])/);
    expect(sq).not.toMatch(/\.pts[+\-*]?=(?![=>])/);
    expect(sq).not.toContain('r.pts+=3');
    expect(sq).not.toContain('r.pts-=1');
  });
  it('every use of the names standings/tieAtCutoff resolves to a core import or a delegating adapter', () => {
    // no third definition, e.g. a second arrow assignment
    const defs = [...code.matchAll(/(?<![\w$.])(?:function\s+|(?:const|let|var)\s+)(standings|tieAtCutoff)(?![\w$])/g)];
    expect(defs.length).toBeLessThanOrEqual(2);
  });
});
