// Stage S4: finals logic from core; the original saved-state upgrade (migrate) block must stay in main.js unchanged.
import { describe, expect, it } from 'vitest';
import { blankLiterals, coreLocal, definesLocally, localBody, matchClose, readMain, readRootScript, squash, stripComments } from './src-helpers';

function migrateBlock(src: string): string {
  const code = blankLiterals(stripComments(src));
  const at = code.indexOf('(function migrate(){');
  expect(at, 'migrate block present').toBeGreaterThanOrEqual(0);
  const open = code.indexOf('{', at);
  const close = matchClose(code, open);
  const end = code.indexOf('})();', close);
  expect(end).toBe(close + 0); // `}` directly followed by `)();`
  return src.slice(at, close + 1 + ')();'.length);
}

describe('detector sanity against the root script', () => {
  const rootCode = blankLiterals(stripComments(readRootScript()));
  for (const f of ['finalFour', 'pickTeams', 'finalTeams']) it(`detects ${f} in the root`, () => expect(definesLocally(rootCode, f)).toBe(true));
  it('root has the pairing literal', () => expect(squash(rootCode)).toContain('[[0,3],[1,2]]'));
});

describe('S4 rules for main.js', () => {
  const raw = readMain();
  const nc = stripComments(raw);
  const code = blankLiterals(nc);
  it('imports finalFour, pickTeams and resolveFinalTeams from @net-picking/core', () => {
    for (const n of ['finalFour', 'pickTeams', 'resolveFinalTeams']) expect(coreLocal(nc, n), n).not.toBeNull();
  });
  it('main.js does not define pickTeams and has no pairing-options literal', () => {
    expect(definesLocally(code, 'pickTeams')).toBe(false);
    const sq = squash(code);
    expect(sq).not.toContain('[[0,3],[1,2]]');
    expect(sq).not.toContain('[[0,2],[1,3]]');
    expect(sq).not.toContain('[[0,1],[2,3]]');
    expect(sq).not.toContain('0.001');
  });
  it('a local finalFour / finalTeams adapter is allowed only if it calls the core function', () => {
    for (const [name, core] of [['finalFour', 'finalFour'], ['finalTeams', 'resolveFinalTeams']] as const) {
      const alias = coreLocal(nc, core)!;
      const body = localBody(code, name);
      if (body === null) continue;
      expect(alias === name, `${name} cannot be both imported and defined`).toBe(false);
      expect(new RegExp(`(?<![\\w$.])${alias}\\s*\\(`).test(body), `${name} must call core ${alias}(...)`).toBe(true);
    }
  });
  it('no inline legacy seeds pairing (A=[q[0],q[3]]) and no slice(0,4) top-four logic in main.js', () => {
    const sq = squash(code);
    expect(sq).not.toMatch(/\[q\[0\],q\[3\]\]/);
    expect(sq).not.toContain('.slice(0,4)');
  });
  it('the migrate block is still in main.js and byte-equal to the root migrate block', () => {
    const a = migrateBlock(readRootScript());
    const b = migrateBlock(raw);
    expect(b).toBe(a);
    // and it still covers each upgrade path
    for (const needle of ['S.cfg', 'S.rules', 'S.finals.s1===undefined', 'S.finals.sA', 'S.finals.sB', 'S.finals.rules']) expect(a).toContain(needle);
  });
});
