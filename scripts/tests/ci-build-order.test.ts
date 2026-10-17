// R2 wiring and R3: dist is built once, first, by the root `pnpm test` and by a CI step; tests only check it.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "./miniyaml";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (f: string) => readFileSync(join(REPO, f), "utf8");
type Obj = Record<string, any>;
const BUILD = "pnpm --filter @net-picking/free build";

describe("R3: root package.json test script", () => {
  const cmd = () => (JSON.parse(read("package.json")).scripts.test as string);
  const parts = () => cmd().split("&&").map((s) => s.trim());

  it("builds apps/free first, then runs pnpm -r test, in that order", () => {
    expect(parts()).toEqual([BUILD, "pnpm -r test"]);
  });
  it("builds exactly once", () => {
    expect(cmd().match(/build/g)?.length).toBe(1);
  });
  it("chains with && so a failed build stops the tests", () => {
    expect(cmd()).toContain("&&");
    expect(cmd().replace(/&&/g, "")).not.toMatch(/[;&|]/);
  });
});

describe("R3: .github/workflows/ci.yml", () => {
  const wf = () => parseYaml(read(".github/workflows/ci.yml")) as Obj;
  const steps = () => (wf().jobs["test-and-build"].steps as Obj[]);
  const idx = (re: RegExp) => steps().findIndex((s) => re.test(String(s.run ?? "")));
  const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

  it("has a step running the apps/free build before the pnpm -r test step", () => {
    const b = steps().findIndex((s) => norm(s.run) === BUILD);
    const t = steps().findIndex((s) => norm(s.run) === "pnpm -r test");
    expect(b, "build step exists").toBeGreaterThanOrEqual(0);
    expect(t, "test step exists").toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(t);
  });
  it("the build step runs exactly once before the test step (no second concurrent build)", () => {
    const t = idx(/^pnpm -r test$/);
    const before = steps().slice(0, t).filter((s) => /\bbuild\b/.test(String(s.run ?? "")));
    expect(before.length).toBe(1);
  });
  it("the build step has the same if: condition as the test step and its neighbours", () => {
    const b = steps().find((s) => norm(s.run) === BUILD)!;
    const t = steps().find((s) => norm(s.run) === "pnpm -r test")!;
    expect(norm(b.if)).not.toBe("");
    expect(norm(b.if)).toBe(norm(t.if));
    expect(norm(b.if)).toBe("steps.proj.outputs.has == 'true'");
  });
  it("still pins ubuntu-24.04", () => {
    expect(wf().jobs["test-and-build"]["runs-on"]).toBe("ubuntu-24.04");
    expect(read(".github/workflows/ci.yml")).not.toMatch(/-latest/);
  });
});

describe("R2 wiring: dist-dependent tests call requireFreshDist", () => {
  const cases: [string, string][] = [
    ["scripts/tests/assemble-site.test.ts", "./require-dist"],
    ["scripts/tests/built-root.test.ts", "./require-dist"],
    ["apps/free/tests/e2e/global-setup.ts", "./require-dist"],
    ["apps/free/tests/parity/sw-s5.test.ts", "../e2e/require-dist"],
  ];
  for (const [file, from] of cases) {
    it(`${file} imports and calls requireFreshDist`, () => {
      const src = read(file);
      expect(src).toContain(`from '${from}'`.replace(/'/g, src.includes(`from "${from}"`) ? '"' : "'"));
      const calls = src.match(/requireFreshDist\(\)/g) ?? [];
      expect(calls.length, "an import line plus at least one call").toBeGreaterThanOrEqual(1);
      expect(src.replace(/import[^\n]*\n/g, "")).toMatch(/requireFreshDist\(\)/);
    });
  }
});
