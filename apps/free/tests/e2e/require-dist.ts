// Tests never build apps/free/dist (two concurrent `vite build` runs broke CI). They call requireFreshDist() and
// fail with a clear message if dist is missing or older than the sources that feed the build.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, "../../../..");
const BUILD_CMD = 'pnpm --filter @net-picking/free build';

function newestMtime(p: string): number {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(p).reduce((t, n) => Math.max(t, newestMtime(join(p, n))), 0);
}

export function requireFreshDist(): void {
  const free = join(REPO, 'apps/free');
  const index = join(free, 'dist', 'index.html');
  if (!existsSync(index)) {
    throw new Error(`${join(free, 'dist')} is MISSING (no index.html). Tests do not build it. Run: ${BUILD_CMD}  (or \`pnpm test\` from the repo root, which builds first).`);
  }
  const sources = [
    join(free, 'index.html'), join(free, 'src'), join(free, 'public'), join(free, 'precache.js'),
    ...readdirSync(free).filter((n) => /^vite\.config\./.test(n)).map((n) => join(free, n)),
    join(REPO, 'packages/core/src'),
  ];
  const built = statSync(index).mtimeMs;
  const newest = sources.map((s) => ({ s, t: newestMtime(s) })).reduce((a, b) => (b.t > a.t ? b : a));
  if (newest.t > built) {
    throw new Error(`${join(free, 'dist')} is STALE (dist/index.html is older than ${newest.s}). Tests do not build it. Run: ${BUILD_CMD}  (or \`pnpm test\` from the repo root, which builds first).`);
  }
}
