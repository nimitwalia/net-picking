// 4d: properties of the assembled site root (what GitHub Pages will publish), checked on the real build output:
//  - no third-party URL in the shipped code (fonts are self-hosted; the only allowed URL text is an XML namespace);
//  - none of the preview identity is left: "PREVIEW", "Net-picking Next", `_next_` storage keys;
//  - the string `net-picking-next` appears ONLY in sw.js (where it is the cleanup prefix for retired preview caches).
// The words "next" / "Up next" in the UI and CSS class names are legitimate and are not matched.
// The font licence file legitimately contains URLs and is excluded from the URL scan only (it is still scanned
// for the identity strings).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = join(REPO, "scripts", "assemble-site.mjs");
const LICENCES = "THIRD-PARTY-FONT-LICENSES.txt";
const ALLOWED_URL = /^http:\/\/www\.w3\.org\/2000\/svg$/;

let tmpRoot: string;
let out: string;
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const TEXT = /\.(html|css|js|webmanifest|json|txt|svg|map)$/i;
const textFiles = () => walk(out).filter((f) => TEXT.test(f)).map((f) => ({ rel: relative(out, f).split("\\").join("/"), text: readFileSync(f, "utf8") }));

beforeAll(() => {
  if (!existsSync(join(REPO, "apps/free/dist/index.html"))) {
    execFileSync("pnpm", ["--filter", "@net-picking/free", "build"], { cwd: REPO, stdio: "inherit" });
  }
  tmpRoot = mkdtempSync(join(tmpdir(), "built-root-"));
  out = join(tmpRoot, "site");
  const r = spawnSync("node", [SCRIPT, out], { cwd: REPO, encoding: "utf8" });
  expect(r.status, r.stderr + r.stdout).toBe(0);
}, 300_000);
afterAll(() => { if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true }); });

describe("built site root", () => {
  it("scans a meaningful set of files (index.html, sw.js, manifest, css, js, licence)", () => {
    const rels = textFiles().map((f) => f.rel);
    for (const must of ["index.html", "sw.js", "manifest.webmanifest", LICENCES]) expect(rels, must).toContain(must);
    expect(rels.some((r) => /^assets\/.*\.css$/.test(r))).toBe(true);
    expect(rels.some((r) => /^assets\/.*\.js$/.test(r))).toBe(true);
  });

  it("no third-party http(s) URL in index.html, assets/*.css|js, sw.js or the manifest", () => {
    const found: string[] = [];
    for (const { rel, text } of textFiles()) {
      if (rel === LICENCES) continue;
      for (const m of text.matchAll(/(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'<>)`\\]*|https?:\/\/[^\s"'<>)`\\]+/g)) {
        if (!/^https?:/.test(m[0])) {
          // protocol-relative URL: only flag if it looks like a host, not a regex/comment fragment
          if (!/^\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(m[0])) continue;
        }
        if (!ALLOWED_URL.test(m[0])) found.push(`${rel}: ${m[0]}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("html has no external src/href/@import/url() references", () => {
    for (const { rel, text } of textFiles()) {
      if (rel === LICENCES) continue;
      expect(text, rel).not.toMatch(/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\/(?!www\.w3\.org)/i);
      expect(text, rel).not.toMatch(/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i);
      expect(text, rel).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
      expect(text, rel).not.toMatch(/googleapis|gstatic/i);
    }
  });

  it('no "PREVIEW", no "Net-picking Next", no "_next_" anywhere in the built root', () => {
    for (const { rel, text } of textFiles()) {
      expect(text, `${rel} contains PREVIEW`).not.toContain("PREVIEW");
      expect(text, `${rel} contains "Net-picking Next"`).not.toContain("Net-picking Next");
      expect(text, `${rel} contains _next_`).not.toContain("_next_");
      expect(text, `${rel} contains a next-keyed storage name`).not.toMatch(/pickleball_[a-z]+_next/);
    }
  });

  it("`net-picking-next` appears only in sw.js (the cleanup prefix), and nowhere else", () => {
    const hits = textFiles().filter((f) => f.text.includes("net-picking-next")).map((f) => f.rel);
    expect(hits).toEqual(["sw.js"]);
  });

  it("live identity is present: title, manifest name, storage keys", () => {
    const files = Object.fromEntries(textFiles().map((f) => [f.rel, f.text]));
    expect(files["index.html"]).toMatch(/<title>Net-picking<\/title>/);
    const mf = JSON.parse(files["manifest.webmanifest"]);
    expect(mf.name).toBe("Net-picking");
    expect(mf.short_name).toBe("Net-picking");
    const js = Object.entries(files).filter(([k]) => /^assets\/.*\.js$/.test(k)).map(([, v]) => v).join("\n");
    expect(js).toContain("pickleball_tournament_v1");
    expect(js).toContain("pickleball_prefs_v1");
  });
});
