// Tests for scripts/assemble-site.mjs <outDir>, updated for the 4d cutover: the site root IS the apps/free build
// (byte for byte), there is no next/ directory, nothing is read from root files of the repo, and the script fails
// loudly on a missing build, a missing required file, or any stray file.
// Env var ASSEMBLE_ROOT overrides the repo root (default: derived from script location).
// apps/free/dist is gitignored; beforeAll builds it (pnpm --filter @net-picking/free build) if absent.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = join(REPO, "scripts", "assemble-site.mjs");
const DIST = join(REPO, "apps/free/dist");
const REQUIRED_FILES = [
  "index.html", "sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
];
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const listRel = (dir: string) => walk(dir).map((p) => relative(dir, p).split("\\").join("/")).sort();

function run(outDir: string, root?: string) {
  // Guard: a missing script would exit non-zero and make failure tests pass vacuously.
  expect(existsSync(SCRIPT), "scripts/assemble-site.mjs must exist").toBe(true);
  return spawnSync("node", [SCRIPT, outDir], {
    cwd: REPO, encoding: "utf8",
    env: { ...process.env, ...(root ? { ASSEMBLE_ROOT: root } : {}) },
  });
}
const failed = (r: ReturnType<typeof run>) => {
  expect(r.status).not.toBe(0);
  expect(r.status).not.toBeNull();
  expect(r.stderr.length, "an error message is printed").toBeGreaterThan(0);
};

const tmps: string[] = [];
const tmp = (p: string) => { const d = mkdtempSync(join(tmpdir(), p)); tmps.push(d); return d; };

/** Fixture repo root: apps/free/dist (copied) and nothing else. */
function makeFixtureRoot(): string {
  const root = tmp("assemble-root-");
  cpSync(DIST, join(root, "apps/free/dist"), { recursive: true });
  return root;
}

beforeAll(() => {
  if (!existsSync(join(DIST, "index.html"))) {
    execFileSync("pnpm", ["--filter", "@net-picking/free", "build"], { cwd: REPO, stdio: "inherit" });
  }
}, 300_000);
afterAll(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });

describe("assemble-site: happy path (real repo)", () => {
  let out: string;
  beforeAll(() => {
    out = join(tmp("assemble-out-"), "site");
    const r = run(out);
    expect(r.status, r.stderr + r.stdout).toBe(0);
  });

  it("the six required files are at the site root", () => {
    for (const f of REQUIRED_FILES) expect(existsSync(join(out, f)), f).toBe(true);
    expect(statSync(join(out, "assets")).isDirectory()).toBe(true);
  });

  it("output root equals apps/free/dist byte for byte (same file list, same sha256)", () => {
    expect(listRel(out)).toEqual(listRel(DIST));
    for (const f of listRel(DIST)) expect(sha(join(out, f)), f).toBe(sha(join(DIST, f)));
  });

  it("there is no next/ directory", () => {
    expect(existsSync(join(out, "next"))).toBe(false);
    expect(listRel(out).filter((f) => f.startsWith("next/"))).toEqual([]);
  });

  it("no docs, packages, pdf or README leak into output", () => {
    const files = listRel(out);
    for (const bad of [/^docs\//, /^packages\//, /\.pdf$/i, /^README/i, /^AGENTS/, /^CLAUDE/, /^package\.json$/])
      expect(files.filter((f) => bad.test(f))).toEqual([]);
  });

  it("works against a fixture root and honours ASSEMBLE_ROOT", () => {
    const root = makeFixtureRoot();
    writeFileSync(join(root, "README.md"), "nope");
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs/x.pdf"), "nope");
    const o = join(tmp("assemble-out-"), "site");
    const r = run(o, root);
    expect(r.status, r.stderr).toBe(0);
    expect(listRel(o)).toEqual(listRel(DIST));
  });

  it("never reads root files of the repo: decoy index.html/sw.js/manifest at the root are not published", () => {
    const root = makeFixtureRoot();
    for (const f of REQUIRED_FILES) writeFileSync(join(root, f), "DECOY " + f);
    const o = join(tmp("assemble-out-"), "site");
    const r = run(o, root);
    expect(r.status, r.stderr).toBe(0);
    for (const f of REQUIRED_FILES) expect(sha(join(o, f)), f).toBe(sha(join(DIST, f)));
    for (const f of listRel(o)) expect(readFileSync(join(o, f)).includes("DECOY"), f).toBe(false);
  });

  it("works with no root files at all (only the build is needed)", () => {
    const root = makeFixtureRoot();
    expect(readdirSync(root)).toEqual(["apps"]);
    const r = run(join(tmp("assemble-out-"), "site"), root);
    expect(r.status, r.stderr).toBe(0);
  });
});

describe("assemble-site: fails loudly", () => {
  it.each(REQUIRED_FILES)("exits non-zero when the built %s is missing", (f) => {
    const root = makeFixtureRoot();
    rmSync(join(root, "apps/free/dist", f));
    failed(run(join(tmp("assemble-out-"), "site"), root));
  });

  it("exits non-zero when the built assets/ directory is missing", () => {
    const root = makeFixtureRoot();
    rmSync(join(root, "apps/free/dist/assets"), { recursive: true });
    failed(run(join(tmp("assemble-out-"), "site"), root));
  });

  it("exits non-zero when apps/free/dist is missing entirely", () => {
    const root = makeFixtureRoot();
    rmSync(join(root, "apps/free/dist"), { recursive: true });
    failed(run(join(tmp("assemble-out-"), "site"), root));
  });

  it("a missing build does not fall back to files at the repo root", () => {
    const root = tmp("assemble-root-");
    for (const f of REQUIRED_FILES) writeFileSync(join(root, f), "root file " + f);
    const o = join(tmp("assemble-out-"), "site");
    failed(run(o, root));
    expect(existsSync(join(o, "index.html"))).toBe(false);
  });

  it.each([
    ["stray.txt"], ["notes.pdf"], ["README.md"], [".env"], ["next/index.html"], ["docs/secret.pdf"],
  ])("exits non-zero when the build holds a stray file (%s)", (stray) => {
    const root = makeFixtureRoot();
    const p = join(root, "apps/free/dist", stray);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, "stray");
    failed(run(join(tmp("assemble-out-"), "site"), root));
  });

  it("exits non-zero when outDir already holds a stray file", () => {
    const out = tmp("assemble-out-");
    writeFileSync(join(out, "stray.txt"), "stray");
    failed(run(out));
  });

  it("exits non-zero when outDir already holds a stray file in a stray directory", () => {
    const out = tmp("assemble-out-");
    mkdirSync(join(out, "docs"));
    writeFileSync(join(out, "docs/secret.pdf"), "stray");
    failed(run(out));
  });

  it("exits non-zero when outDir still holds the old next/ directory", () => {
    const out = tmp("assemble-out-");
    mkdirSync(join(out, "next"));
    writeFileSync(join(out, "next/index.html"), "old");
    failed(run(out));
  });

  it("script exists", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    expect(statSync(SCRIPT).isFile()).toBe(true);
  });
});
