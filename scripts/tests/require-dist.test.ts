// R2: the helpers that make dist-dependent tests fail loudly (never build) when apps/free/dist is missing or stale.
// Both copies (scripts/tests/require-dist.ts and apps/free/tests/e2e/require-dist.ts) compute the repo root from their own
// location, so each is copied byte-for-byte into a temp tree at the same relative path and run there. The real
// apps/free/dist and the real sources are never read or touched.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const COPIES = [
  { name: "scripts/tests/require-dist.ts", rel: "scripts/tests/require-dist.ts" },
  { name: "apps/free/tests/e2e/require-dist.ts", rel: "apps/free/tests/e2e/require-dist.ts" },
];
const CMD = "pnpm --filter @net-picking/free build";
const T0 = 1_700_000_000; // seconds

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function put(root: string, rel: string, mtime: number) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, rel);
  utimesSync(p, mtime, mtime);
}

// A fake repo with every source at T0 and (optionally) dist/index.html at distTime.
async function fake(rel: string, distTime: number | null) {
  const root = mkdtempSync(join(tmpdir(), "np-dist-"));
  roots.push(root);
  const sources = ["apps/free/index.html", "apps/free/src/main.js", "apps/free/src/deep/x.css", "apps/free/public/sw.js",
    "apps/free/precache.js", "apps/free/vite.config.js", "packages/core/src/scoring.ts", "packages/core/src/sub/a.ts"];
  for (const s of sources) put(root, s, T0);
  if (distTime !== null) { put(root, "apps/free/dist/index.html", distTime); }
  const dst = join(root, rel);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(REPO, rel), dst);
  const mod = await import(/* @vite-ignore */ dst);
  return { root, run: () => mod.requireFreshDist() as void, sources };
}

for (const { name, rel } of COPIES) {
  describe(`requireFreshDist (${name})`, () => {
    it("MISSING: throws naming the dist path, saying missing, giving the build command", async () => {
      const f = await fake(rel, null);
      let msg = "";
      try { f.run(); } catch (e) { msg = (e as Error).message; }
      expect(msg).toContain(join(f.root, "apps/free/dist"));
      expect(msg).toMatch(/MISSING/i);
      expect(msg).not.toMatch(/STALE/i);
      expect(msg).toContain(CMD);
    });

    it("MISSING: a dist directory without index.html is still missing", async () => {
      const f = await fake(rel, null);
      mkdirSync(join(f.root, "apps/free/dist/assets"), { recursive: true });
      expect(() => f.run()).toThrow(/MISSING/i);
    });

    it("fresh (dist newer than every source) passes silently", async () => {
      const f = await fake(rel, T0 + 100);
      expect(f.run()).toBeUndefined();
    });

    it("fresh (dist same age as sources) passes", async () => {
      const f = await fake(rel, T0);
      expect(() => f.run()).not.toThrow();
    });

    for (const src of ["apps/free/index.html", "apps/free/src/deep/x.css", "apps/free/public/sw.js", "apps/free/precache.js",
      "apps/free/vite.config.js", "packages/core/src/sub/a.ts", "packages/core/src/scoring.ts"]) {
      it(`STALE when ${src} is newer than dist`, async () => {
        const f = await fake(rel, T0 + 100);
        utimesSync(join(f.root, src), T0 + 500, T0 + 500);
        let msg = "";
        try { f.run(); } catch (e) { msg = (e as Error).message; }
        expect(msg, "should have thrown").not.toBe("");
        expect(msg).toContain(join(f.root, "apps/free/dist"));
        expect(msg).toMatch(/STALE/i);
        expect(msg).not.toMatch(/MISSING/i);
        expect(msg).toContain(CMD);
      });
    }

    it("a newly added source file in src or core makes dist stale", async () => {
      const f = await fake(rel, T0 + 100);
      put(f.root, "apps/free/src/new-file.js", T0 + 900);
      expect(() => f.run()).toThrow(/STALE/i);
    });

    it("a source that is not an input of the build (apps/free/tests) does not make dist stale", async () => {
      const f = await fake(rel, T0 + 100);
      put(f.root, "apps/free/tests/e2e/x.spec.ts", T0 + 900);
      expect(() => f.run()).not.toThrow();
    });

    it("refreshing dist (newer mtime) clears the stale error", async () => {
      const f = await fake(rel, T0 + 100);
      utimesSync(join(f.root, "apps/free/src/main.js"), T0 + 500, T0 + 500);
      expect(() => f.run()).toThrow(/STALE/i);
      utimesSync(join(f.root, "apps/free/dist/index.html"), T0 + 600, T0 + 600);
      expect(() => f.run()).not.toThrow();
    });
  });
}

describe("the two helper copies stay in step", () => {
  it("have identical logic apart from the repo-root depth", async () => {
    const { readFileSync } = await import("node:fs");
    const norm = (r: string) => readFileSync(join(REPO, r), "utf8").replace(/resolve\(import\.meta\.dirname, "[./]+"\)/, "ROOT");
    expect(norm(COPIES[0].rel)).toBe(norm(COPIES[1].rel));
  });
});
