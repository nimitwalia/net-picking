// Tests for CI hygiene: runners pinned to ubuntu-24.04, never "-latest".
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "./miniyaml";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIR = join(REPO, ".github/workflows");
const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
type Obj = Record<string, any>;
const jobsOf = (f: string) => (parseYaml(read(f)) as Obj).jobs as Obj;

describe("no -latest runners anywhere", () => {
  it("finds at least one workflow file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    it(`${f}: no job runs-on value ends in -latest`, () => {
      const jobs = jobsOf(f);
      expect(Object.keys(jobs).length).toBeGreaterThan(0);
      for (const [k, j] of Object.entries(jobs) as [string, Obj][]) {
        const vals = [j["runs-on"]].flat().map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
        expect(vals.length, `${f}:${k} has runs-on`).toBeGreaterThan(0);
        for (const v of vals) expect(v, `${f}:${k}`).not.toMatch(/-latest/);
      }
    });

    it(`${f}: raw text has no runs-on line ending in -latest`, () => {
      expect(read(f)).not.toMatch(/runs-on:\s*\[?\s*["']?[^\n#]*-latest\b/);
      expect(read(f)).not.toMatch(/^\s*-?\s*["']?[\w.-]+-latest["']?\s*,?\s*(#.*)?$/m);
    });
  }
});

describe("ci.yml and pages.yml pin ubuntu-24.04", () => {
  for (const f of ["ci.yml", "pages.yml"]) {
    it(`${f}: every job runs-on is exactly ubuntu-24.04`, () => {
      const jobs = jobsOf(f);
      const entries = Object.entries(jobs) as [string, Obj][];
      expect(entries.length).toBeGreaterThan(0);
      for (const [k, j] of entries) expect(j["runs-on"], `${f}:${k}`).toBe("ubuntu-24.04");
    });
  }
});

describe("ci.yml required check name", () => {
  it("has exactly one job keyed test-and-build with no differing name override", () => {
    const jobs = jobsOf("ci.yml");
    expect(Object.keys(jobs)).toEqual(["test-and-build"]);
    const name = jobs["test-and-build"].name;
    if (name !== undefined) expect(name).toBe("test-and-build");
  });
});
