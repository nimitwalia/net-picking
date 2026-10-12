// Small source scanner for the structure tests (no dependencies). It understands comments, string
// literals, template literals (including nested `${ ... `...` ... }`), and regex literals, so that
// text inside strings/comments/regexes cannot fake or hide a definition.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const free = resolve(import.meta.dirname, '../..');
export const indexPath = process.env.INDEX_UNDER_TEST ?? resolve(free, 'index.html');
export const root = resolve(free, '../..');
export const mainPath = process.env.MAIN_JS_UNDER_TEST ?? resolve(free, 'src/main.js');
export const readMain = (): string => readFileSync(mainPath, 'utf8');
export const readRootScript = (): string => {
  const m = readFileSync(resolve(root, 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('root index.html has no inline script');
  return m[1];
};

const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

/**
 * mode 'comments': remove comments only (strings kept).
 * mode 'blank': remove comments and blank the CONTENTS of strings, template text and regex literals
 *               (quotes/delimiters kept; `${...}` code inside templates is kept). Offsets are preserved.
 */
export function scan(src: string, mode: 'comments' | 'blank'): string {
  let out = '';
  const n = src.length;
  let i = 0;
  const stack: Array<{ k: 'code'; depth: number } | { k: 'tpl' }> = [{ k: 'code', depth: 0 }];
  let prevSig = ''; // previous significant char in code, to tell regex from division
  const blank = (s: string) => (mode === 'blank' ? s.replace(/[^\n]/g, ' ') : s);
  while (i < n) {
    const top = stack[stack.length - 1];
    const c = src[i];
    if (top.k === 'tpl') {
      if (c === '\\') { out += blank(src.slice(i, i + 2)); i += 2; continue; }
      if (c === '`') { out += '`'; stack.pop(); prevSig = '`'; i++; continue; }
      if (c === '$' && src[i + 1] === '{') { out += '${'; stack.push({ k: 'code', depth: 0 }); prevSig = '{'; i += 2; continue; }
      out += blank(c); i++; continue;
    }
    // code
    if (c === '/' && src[i + 1] === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; out += ' '.repeat(j - i); i = j; continue; }
    if (c === '/' && src[i + 1] === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; out += src.slice(i, j).replace(/[^\n]/g, ' '); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += c + blank(src.slice(i + 1, j)) + c; i = j + 1; prevSig = c; continue;
    }
    if (c === '`') { out += '`'; stack.push({ k: 'tpl' }); i++; continue; }
    if (c === '/' && (prevSig === '' || REGEX_PREV.has(prevSig) || /return|typeof/.test(out.slice(-7).trim().split(/\W+/).pop() ?? ''))) {
      let j = i + 1; let cls = false;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        j++;
      }
      out += '/' + blank(src.slice(i + 1, j)) + '/'; i = j + 1; prevSig = '/'; continue;
    }
    if (c === '{') top.depth++;
    if (c === '}') { if (top.depth === 0 && stack.length > 1) { stack.pop(); out += '}'; i++; prevSig = '}'; continue; } top.depth--; }
    out += c; if (!/\s/.test(c)) prevSig = c; i++;
  }
  return out;
}

export const stripComments = (s: string) => scan(s, 'comments');
export const blankLiterals = (s: string) => scan(s, 'blank');
export const squash = (s: string) => s.replace(/\s+/g, '');

/** Index of the matching close for the opener at `open` (works on blanked code). */
export function matchClose(code: string, open: number): number {
  const o = code[open]; const c = ({ '{': '}', '(': ')', '[': ']' } as Record<string, string>)[o];
  let d = 0;
  for (let i = open; i < code.length; i++) { if (code[i] === o) d++; else if (code[i] === c && --d === 0) return i; }
  return -1;
}

/** Does `code` (blanked) define an identifier as a function/const/let/var/class? */
export function definesLocally(code: string, name: string): boolean {
  const id = `(?<![\\w$.])${name}(?![\\w$])`;
  return new RegExp(`\\b(?:async\\s+)?function\\s*\\*?\\s*${id}`).test(code)
    || new RegExp(`\\b(?:const|let|var|class)\\s+${id}`).test(code)
    || new RegExp(`\\b(?:const|let|var)\\s*\\{[^}]*(?<![\\w$.])${name}(?![\\w$])[^}]*\\}\\s*=`).test(code)
    || new RegExp(`(?:^|[;{}\\n])\\s*${id}\\s*=(?!=)`).test(code);
}

/** Body text (blanked code) of the local definition of `name`, or null when there is none. */
export function localBody(code: string, name: string): string | null {
  const id = `(?<![\\w$.])${name}(?![\\w$])`;
  let m = new RegExp(`\\bfunction\\s*\\*?\\s*${id}\\s*\\(`).exec(code);
  let from = m ? m.index + m[0].length - 1 : -1;
  if (!m) { m = new RegExp(`\\b(?:const|let|var)\\s+${id}\\s*=`).exec(code); from = m ? m.index + m[0].length : -1; }
  if (!m) return null;
  const rest = code.slice(from);
  const paren = rest.indexOf('(') >= 0 && rest.indexOf('(') < 40 ? from + rest.indexOf('(') : -1;
  if (m[0].startsWith('function') || paren >= 0) {
    const p = m[0].startsWith('function') ? from : paren;
    const pc = matchClose(code, p);
    const b = code.indexOf('{', pc);
    const arrow = code.slice(pc, b < 0 ? pc : b);
    if (b >= 0 && !/[;\n]/.test(arrow.replace(/^\)\s*(=>)?\s*/, ''))) return code.slice(b, matchClose(code, b) + 1);
    const semi = code.indexOf(';', pc); return code.slice(pc, semi < 0 ? undefined : semi);
  }
  const semi = code.indexOf(';', from);
  return code.slice(from, semi < 0 ? undefined : semi);
}

/** Named imports from a module specifier: returns [{imported, local}], and every specifier used. */
export function parseImports(noComments: string): { specs: string[]; names: Map<string, Array<{ imported: string; local: string }>> } {
  const names = new Map<string, Array<{ imported: string; local: string }>>();
  const specs: string[] = [];
  const re = /\bimport\s*(?:([\w$*\s,{}]+?)\s*from\s*)?(['"])([^'"]+)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments))) {
    specs.push(m[3]);
    const list = names.get(m[3]) ?? [];
    const named = /\{([^}]*)\}/.exec(m[1] ?? '');
    if (named) for (const part of named[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const [a, b] = part.split(/\s+as\s+/);
      list.push({ imported: a, local: b ?? a });
    }
    names.set(m[3], list);
  }
  const dyn = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  while ((m = dyn.exec(noComments))) specs.push(m[2]);
  return { specs, names };
}

/** Local name under which `imported` is imported from @net-picking/core, or null. */
export function coreLocal(noComments: string, imported: string): string | null {
  const e = parseImports(noComments).names.get('@net-picking/core')?.find((x) => x.imported === imported);
  return e ? e.local : null;
}
