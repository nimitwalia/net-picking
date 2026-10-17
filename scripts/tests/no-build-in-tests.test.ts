// R1 guard: no test, vitest setup or Playwright setup may build apps/free/dist. Two concurrent `vite build` runs broke CI.
// Static scan of scripts/tests, apps/free/tests, and the apps/free Playwright/vitest configs. This file is scanned too:
// its own patterns and samples are assembled from fragments so that its source contains no spawn-and-build text.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const j = (...p: string[]) => p.join("");

const SPAWN_NAMES = [j("exe", "c"), j("exe", "cSync"), j("exe", "cFile"), j("exe", "cFileSync"), j("spa", "wn"), j("spa", "wnSync"), j("for", "k")];
const SPAWN_CALL = new RegExp(`\\b(?:${SPAWN_NAMES.join("|")})\\s*\\(`, "g");
const BUILD_WORDS = new RegExp(`\\b(?:${j("vi", "te")}|${j("bui", "ld")}|${j("np", "m")}|${j("pn", "pm")}|${j("ya", "rn")}|${j("tur", "bo")})\\b`);
const VITE_API_IMPORT = new RegExp(`(?:from|import\\s*\\(|require\\s*\\()\\s*['"]${j("vi", "te")}['"]`);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1");
}

// Returns the argument text of each spawn-like call (balanced parentheses).
function callArgs(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(SPAWN_CALL)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    out.push(src.slice(start, i));
  }
  return out;
}

export function findBuildSpawn(source: string): string | null {
  const src = stripComments(source);
  if (VITE_API_IMPORT.test(src)) return "imports the bundler API";
  for (const a of callArgs(src)) if (BUILD_WORDS.test(a)) return `spawns: ${a.slice(0, 80).replace(/\s+/g, " ")}`;
  return null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === "dist" || n === "test-results") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(?:[cm]?[jt]s)$/.test(n)) out.push(p);
  }
  return out;
}

function targets(): string[] {
  const free = join(REPO, "apps/free");
  const cfgs = readdirSync(free).filter((n) => /^(?:playwright|vitest|vite)\.config\./.test(n) && !/^vite\.config\./.test(n));
  return [
    ...walk(join(REPO, "scripts/tests")),
    ...walk(join(free, "tests")),
    ...cfgs.map((n) => join(free, n)),
  ];
}

describe("R1: tests and test setup never build apps/free/dist", () => {
  it("scans the expected files (global setup, playwright config, vitest config, this guard)", () => {
    const rel = targets().map((f) => relative(REPO, f));
    expect(rel).toContain("apps/free/tests/e2e/global-setup.ts");
    expect(rel).toContain("apps/free/playwright.config.ts");
    expect(rel).toContain("apps/free/vitest.config.ts");
    expect(rel).toContain("scripts/tests/no-build-in-tests.test.ts");
    expect(rel).toContain("scripts/tests/require-dist.ts");
  });

  it("no scanned file spawns a build", () => {
    const bad = targets()
      .map((f) => [relative(REPO, f), findBuildSpawn(readFileSync(f, "utf8"))] as const)
      .filter(([, why]) => why !== null)
      .map(([f, why]) => `${f} (${why})`);
    expect(bad, `these files spawn a build (tests must never build dist): ${bad.join("; ")}`).toEqual([]);
  });
});

describe("R1 detector self-test (it can fail)", () => {
  const samples: [string, string][] = [
    ["execFileSync pnpm build", `${j("exe", "cFileSync")}('${j("pn", "pm")}', ['--filter', 'x', '${j("bui", "ld")}'])`],
    ["execSync string", `${j("exe", "cSync")}("${j("pn", "pm")} run ${j("bui", "ld")}")`],
    ["spawn vite", `${j("spa", "wn")}('${j("vi", "te")}', ['${j("bui", "ld")}'], { cwd })`],
    ["spawnSync npx vite build, multiline", `${j("spa", "wnSync")}(\n 'npx',\n ['${j("vi", "te")}', '${j("bui", "ld")}']\n)`],
    ["vite api import", `import { ${j("bui", "ld")} } from '${j("vi", "te")}'`],
    ["dynamic vite api import", `await import('${j("vi", "te")}')`],
  ];
  for (const [name, code] of samples) it(`flags: ${name}`, () => expect(findBuildSpawn(code)).not.toBeNull());

  const clean: [string, string][] = [
    ["node script spawn", `${j("spa", "wnSync")}("node", [SCRIPT, out], { cwd: REPO })`],
    ["git show", `${j("exe", "cFileSync")}('git', ['show', 'main:apps/free/index.html'])`],
    ["regex exec", `const m = /a/.${j("exe", "c")}(s)`.replace(".", " ")],
    ["build mentioned only in a comment", `// ${j("pn", "pm")} ${j("bui", "ld")}\nconst x = 1;`],
  ];
  for (const [name, code] of clean) it(`passes: ${name}`, () => expect(findBuildSpawn(code)).toBeNull());
});
