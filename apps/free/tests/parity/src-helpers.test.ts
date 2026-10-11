// Self-test of the scanner used by the structure tests, so those tests cannot be fooled (or fooled by) text in
// strings, comments, regexes or nested templates.
import { describe, expect, it } from 'vitest';
import { blankLiterals, coreLocal, definesLocally, localBody, parseImports, squash, stripComments } from './src-helpers';

const sample = `
import { standings as coreStandings, checkScore } from '@net-picking/core';
import './style.css';
// function shuffle(){}
const s = "function pk(){}"; /* const evaluate = 1 */
const re = /[&<>"']/g; const q = 'it\\'s';
const t = \`a \${[1].map(x => \`n\${x}\`).join(',')} function nCk(){}\`;
function standings(upTo){ return coreStandings(S.players, S.matches, upTo); }
const tieAtCutoff = (rows) => { return coreTie(rows); };
let candidateCombos = function(){};
`;
describe('src-helpers scanner', () => {
  const code = blankLiterals(stripComments(sample));
  it('ignores definitions that only appear in comments, strings or templates', () => {
    for (const n of ['shuffle', 'pk', 'evaluate', 'nCk']) expect(definesLocally(code, n), n).toBe(false);
  });
  it('finds real function and const definitions', () => {
    for (const n of ['standings', 'tieAtCutoff', 'candidateCombos']) expect(definesLocally(code, n), n).toBe(true);
  });
  it('extracts bodies and import aliases', () => {
    expect(squash(localBody(code, 'standings')!)).toContain('coreStandings(');
    expect(squash(localBody(code, 'tieAtCutoff')!)).toContain('coreTie(');
    expect(coreLocal(stripComments(sample), 'standings')).toBe('coreStandings');
    expect(coreLocal(stripComments(sample), 'checkScore')).toBe('checkScore');
    expect(parseImports(stripComments(sample)).specs).toEqual(['@net-picking/core', './style.css']);
  });
  it('a regex containing a quote does not derail the scan', () => {
    expect(definesLocally(code, 'standings')).toBe(true);
  });
});
