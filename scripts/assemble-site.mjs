#!/usr/bin/env node
// Assemble the GitHub Pages site: six live-app root files + apps/free/dist under next/.
// Usage: node scripts/assemble-site.mjs <outDir>
// Zero dependencies. Copies byte-for-byte; never deletes anything.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_FILES = [
  "index.html",
  "sw.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

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

for (const f of ROOT_FILES) {
  const p = join(root, f);
  if (!existsSync(p) || !statSync(p).isFile()) fail(`required file missing: ${p}`);
}
if (!existsSync(dist) || !statSync(dist).isDirectory()) fail(`build output missing: ${dist}`);
if (!existsSync(join(dist, "index.html"))) fail(`build output missing: ${join(dist, "index.html")}`);

mkdirSync(outDir, { recursive: true });
for (const f of ROOT_FILES) cpSync(join(root, f), join(outDir, f));
cpSync(dist, join(outDir, "next"), { recursive: true });

const stray = walk(outDir)
  .map((p) => relative(outDir, p).split("\\").join("/"))
  .filter((f) => !ROOT_FILES.includes(f) && !f.startsWith("next/"));
if (stray.length > 0) fail(`unexpected files in output ${outDir}:\n  ${stray.join("\n  ")}`);

console.log(`assemble-site: wrote ${ROOT_FILES.length} root files + next/ to ${outDir}`);
