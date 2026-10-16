import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Build-time helpers for the service worker precache list and the font licence file.
// Pure functions are exported so they can be tested; the plugin is the only part that touches the disk.

export const MARKER_START = '/*PRECACHE_START*/';
export const MARKER_END = '/*PRECACHE_END*/';

// Every emitted file under assets/ (JS, CSS, fonts) except source maps, sorted, as paths relative to the SW scope.
export function precacheList(bundleFileNames) {
  return [...new Set(bundleFileNames)]
    .filter((f) => f.startsWith('assets/') && !f.endsWith('.map'))
    .sort();
}

// Replaces the list between the markers in sw.js source. Throws if the markers are missing.
export function injectPrecache(swSource, list) {
  const a = swSource.indexOf(MARKER_START);
  const b = swSource.indexOf(MARKER_END);
  if (a < 0 || b < a) throw new Error('sw.js precache markers not found');
  return swSource.slice(0, a + MARKER_START.length) + JSON.stringify(list) + swSource.slice(b);
}

export const FONT_LICENSE_PACKAGES = [
  '@fontsource-variable/bricolage-grotesque',
  '@fontsource/dm-sans',
  '@fontsource/dm-mono',
];

export function licenseText(root, packages = FONT_LICENSE_PACKAGES) {
  return packages
    .map((p) => `=== ${p} ===\n\n${readFileSync(join(root, 'node_modules', p, 'LICENSE'), 'utf8').trim()}\n`)
    .join('\n');
}

export function precachePlugin() {
  let root = process.cwd();
  let outDir = 'dist';
  let files = [];
  return {
    name: 'net-picking-precache',
    apply: 'build',
    configResolved(c) {
      root = c.root;
      outDir = join(c.root, c.build.outDir);
    },
    generateBundle(_o, bundle) {
      files = Object.keys(bundle);
      this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-FONT-LICENSES.txt', source: licenseText(root) });
    },
    // public/ is copied into dist after generateBundle, so patch sw.js once the build is finished.
    closeBundle() {
      const p = join(outDir, 'sw.js');
      writeFileSync(p, injectPrecache(readFileSync(p, 'utf8'), precacheList(files)));
    },
  };
}
