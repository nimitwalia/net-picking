// Tests for roadmap item 4b: scripts/assemble-site.mjs <outDir>
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
const ROOT_FILES = [
  "index.html", "sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
];
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [relative(dir, join(dir, e.name))].map(() => join(dir, e.name)));
const listRel = (dir: string) => walk(dir).map((p) => relative(dir, p).split("\\").join("/")).sort();

function run(outDir: string, root?: string) {
  // Guard: a missing script would exit non-zero and make failure tests pass vacuously.
  expect(existsSync(SCRIPT), "scripts/assemble-site.mjs must exist").toBe(true);
  return spawnSync("node", [SCRIPT, outDir], {
    cwd: REPO, encoding: "utf8",
    env: { ...process.env, ...(root ? { ASSEMBLE_ROOT: root } : {}) },
  });
}

const tmps: string[] = [];
const tmp = (p: string) => { const d = mkdtempSync(join(tmpdir(), p)); tmps.push(d); return d; };

/** Fixture repo root: the six root files + apps/free/dist (copied), nothing else. */
function makeFixtureRoot(): string {
  const root = tmp("assemble-root-");
  for (const f of ROOT_FILES) cpSync(join(REPO, f), join(root, f));
  cpSync(join(REPO, "apps/free/dist"), join(root, "apps/free/dist"), { recursive: true });
  return root;
}

beforeAll(() => {
  if (!existsSync(join(REPO, "apps/free/dist/index.html"))) {
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

  it("T1: each of the six root files is a byte-for-byte copy (sha256)", () => {
    for (const f of ROOT_FILES) {
      expect(existsSync(join(out, f)), f).toBe(true);
      expect(sha(join(out, f)), f).toBe(sha(join(REPO, f)));
    }
  });

  it("T2: output contains only the six root files plus everything under next/", () => {
    const files = listRel(out);
    const extras = files.filter((f) => !ROOT_FILES.includes(f) && !f.startsWith("next/"));
    expect(extras).toEqual([]);
    for (const f of ROOT_FILES) expect(files).toContain(f);
  });

  it("T2: next/ equals apps/free/dist exactly (same file list and hashes)", () => {
    const dist = join(REPO, "apps/free/dist");
    const expected = listRel(dist).map((f) => "next/" + f);
    expect(listRel(out).filter((f) => f.startsWith("next/"))).toEqual(expected);
    for (const f of listRel(dist)) expect(sha(join(out, "next", f)), f).toBe(sha(join(dist, f)));
    expect(sha(join(out, "next/index.html"))).toBe(sha(join(dist, "index.html")));
  });

  it("R1: no docs, packages, pdf or README leak into output", () => {
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
    expect(listRel(o).filter((f) => !ROOT_FILES.includes(f) && !f.startsWith("next/"))).toEqual([]);
  });
});

describe("assemble-site: fails loudly (T3)", () => {
  it.each(ROOT_FILES)("exits non-zero when %s is missing", (f) => {
    const root = makeFixtureRoot();
    rmSync(join(root, f));
    const r = run(join(tmp("assemble-out-"), "site"), root);
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
    expect(r.stderr.length).toBeGreaterThan(0);
  });

  it("exits non-zero when apps/free/dist/index.html is missing", () => {
    const root = makeFixtureRoot();
    rmSync(join(root, "apps/free/dist/index.html"));
    const r = run(join(tmp("assemble-out-"), "site"), root);
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
  });

  it("exits non-zero when apps/free/dist is missing entirely", () => {
    const root = makeFixtureRoot();
    rmSync(join(root, "apps/free/dist"), { recursive: true });
    const r = run(join(tmp("assemble-out-"), "site"), root);
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
  });

  it("exits non-zero when outDir already holds a stray file outside R1/R2", () => {
    const out = tmp("assemble-out-");
    writeFileSync(join(out, "stray.txt"), "stray");
    const r = run(out);
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
  });

  it("exits non-zero when outDir already holds a stray file in a stray directory", () => {
    const out = tmp("assemble-out-");
    mkdirSync(join(out, "docs"));
    writeFileSync(join(out, "docs/secret.pdf"), "stray");
    const r = run(out);
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
  });

  it("script exists", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    expect(statSync(SCRIPT).isFile()).toBe(true);
  });
});
