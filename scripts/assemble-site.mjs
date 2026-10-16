#!/usr/bin/env node
// Assemble the GitHub Pages site: apps/free/dist copied byte-for-byte to the site root.
// Usage: node scripts/assemble-site.mjs <outDir>
// Zero dependencies. Copies byte-for-byte; never deletes anything.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_FILES = [
  "index.html",
  "sw.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];
// Emitted by the build (apps/free/precache.js); the only other file allowed besides assets/**.
const EXTRA_FILES = ["THIRD-PARTY-FONT-LICENSES.txt"];

function fail(msg) {
  console.error(`assemble-site: ERROR: ${msg}`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const outArg = process.argv[2];
if (!outArg) fail("usage: node scripts/assemble-site.mjs <outDir>");

const root = resolve(
  process.env.ASSEMBLE_ROOT || join(dirname(fileURLToPath(import.meta.url)), ".."),
);
const outDir = resolve(outArg);
const dist = join(root, "apps", "free", "dist");

if (!existsSync(dist) || !statSync(dist).isDirectory()) fail(`build output missing: ${dist}`);
for (const f of REQUIRED_FILES) {
  const p = join(dist, f);
  if (!existsSync(p) || !statSync(p).isFile()) fail(`required file missing from build: ${p}`);
}
const assets = join(dist, "assets");
if (!existsSync(assets) || !statSync(assets).isDirectory()) fail(`required directory missing from build: ${assets}`);

const stray = walk(dist)
  .map((p) => relative(dist, p).split("\\").join("/"))
  .filter((f) => !REQUIRED_FILES.includes(f) && !EXTRA_FILES.includes(f) && !f.startsWith("assets/"));
if (stray.length > 0) fail(`unexpected files in build output ${dist}:\n  ${stray.join("\n  ")}`);

mkdirSync(outDir, { recursive: true });
cpSync(dist, outDir, { recursive: true });

// Re-check the output itself: it must hold nothing beyond the allowed set.
const strayOut = walk(outDir)
  .map((p) => relative(outDir, p).split("\\").join("/"))
  .filter((f) => !REQUIRED_FILES.includes(f) && !EXTRA_FILES.includes(f) && !f.startsWith("assets/"));
if (strayOut.length > 0) fail(`unexpected files in output ${outDir}:\n  ${strayOut.join("\n  ")}`);

console.log(`assemble-site: wrote apps/free/dist to ${outDir}`);
