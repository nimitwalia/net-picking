import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const free = resolve(import.meta.dirname, '../..');
const dist = join(free, 'dist');
// The app is served from a sub-path, as it will be on GitHub Pages (e.g. /net-picking/next/).
export const SUBPATH = '/net-picking/next/';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.css': 'text/css',
};

function newest(dir: string): number {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

function ensureBuilt(): void {
  const stale = !existsSync(join(dist, 'index.html')) ||
    statSync(join(dist, 'index.html')).mtimeMs < Math.max(
      statSync(join(free, 'index.html')).mtimeMs, newest(join(free, 'public')));
  if (stale) execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: free, stdio: 'inherit' });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  ensureBuilt();
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith(SUBPATH)) { res.writeHead(404).end('outside sub-path'); return; }
    let rel = decodeURIComponent(url.pathname.slice(SUBPATH.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(dist, rel));
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as { port: number }).port;
  process.env.PREVIEW_BASE_URL = `http://127.0.0.1:${port}${SUBPATH}`;
  return async () => { await new Promise<void>((ok) => server.close(() => ok())); };
}
