// Minimal YAML subset parser (no yaml library is installed). Supports block maps,
// block lists, list-of-maps, flow [a, b] / {a: b}, quoted scalars, | and > block scalars.
type Y = string | number | boolean | null | Y[] | { [k: string]: Y };

function scalar(s: string): Y {
  s = s.trim();
  if (s === "" || s === "~" || s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((x) => scalar(x));
  }
  if (s.startsWith("{") && s.endsWith("}")) {
    const o: { [k: string]: Y } = {};
    for (const part of s.slice(1, -1).split(",")) {
      const i = part.indexOf(":");
      if (i > 0) o[part.slice(0, i).trim()] = scalar(part.slice(i + 1));
    }
    return o;
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function stripComment(s: string): string {
  let q = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) { if (c === q) q = ""; }
    else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]!))) return s.slice(0, i);
  }
  return s;
}

export function parseYaml(text: string): Y {
  const raw = text.replace(/\r/g, "").split("\n");
  let pos = 0;
  const indentOf = (l: string) => l.length - l.trimStart().length;
  const skip = () => {
    while (pos < raw.length && stripComment(raw[pos]!).trim() === "") pos++;
  };

  function block(indent: number): Y {
    skip();
    if (pos >= raw.length) return null;
    const first = stripComment(raw[pos]!);
    if (first.trim().startsWith("- ") || first.trim() === "-") return list(indentOf(first));
    return map(indentOf(first));
  }

  function value(rest: string, parentIndent: number): Y {
    rest = rest.trim();
    if (/^[|>][+-]?$/.test(rest)) {
      const lines: string[] = [];
      while (pos < raw.length && (raw[pos]!.trim() === "" || indentOf(raw[pos]!) > parentIndent)) {
        lines.push(raw[pos]!.trim());
        pos++;
      }
      return lines.join(rest.startsWith("|") ? "\n" : " ").trim();
    }
    if (rest === "") {
      skip();
      if (pos < raw.length) {
        const l = stripComment(raw[pos]!);
        const ind = indentOf(l);
        const isList = l.trim().startsWith("- ") || l.trim() === "-";
        if (ind > parentIndent || (isList && ind === parentIndent)) return block(ind);
      }
      return null;
    }
    return scalar(rest);
  }

  function map(indent: number, seed?: { key: string; rest: string; keyIndent: number }): Y {
    const o: { [k: string]: Y } = {};
    const handle = (key: string, rest: string, keyIndent: number) => {
      o[key] = value(rest, keyIndent);
    };
    if (seed) handle(seed.key, seed.rest, seed.keyIndent);
    for (;;) {
      skip();
      if (pos >= raw.length) break;
      const l = stripComment(raw[pos]!);
      if (indentOf(l) !== indent || l.trim().startsWith("- ")) break;
      const m = /^\s*("[^"]+"|'[^']+'|[^:]+?):(?:\s+(.*))?$/.exec(l);
      if (!m) throw new Error("miniyaml: cannot parse line: " + l);
      pos++;
      handle(m[1]!.replace(/^["']|["']$/g, ""), m[2] ?? "", indent);
    }
    return o;
  }

  function list(indent: number): Y {
    const arr: Y[] = [];
    for (;;) {
      skip();
      if (pos >= raw.length) break;
      const l = stripComment(raw[pos]!);
      if (indentOf(l) !== indent || !(l.trim().startsWith("- ") || l.trim() === "-")) break;
      pos++;
      const rest = l.trim().slice(1).trim();
      const m = /^("[^"]+"|'[^']+'|[A-Za-z0-9_.\-/]+):(?:\s+(.*))?$/.exec(rest);
      if (m && !rest.startsWith("{") && !rest.startsWith("[")) {
        const keyIndent = indent + 2;
        arr.push(map(keyIndent, { key: m[1]!.replace(/^["']|["']$/g, ""), rest: m[2] ?? "", keyIndent }));
      } else arr.push(value(rest, indent));
    }
    return arr;
  }

  return block(0);
}
