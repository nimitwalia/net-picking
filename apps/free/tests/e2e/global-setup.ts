import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { requireFreshDist } from './require-dist';

const free = resolve(import.meta.dirname, '../..');
const dist = join(free, 'dist');
// The app is served at the SITE ROOT (as published after the 4d cutover). The legacy fixture, where a test needs
// it, is served by harness.startLegacyServer on a second server (different origin, so separate storage).

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

export default async function globalSetup(): Promise<() => Promise<void>> {
  requireFreshDist();
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let rel = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(dist, rel));
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as { port: number }).port;
  process.env.APP_BASE_URL = `http://127.0.0.1:${port}/`;
  return async () => { await new Promise<void>((ok) => server.close(() => ok())); };
}
