// One local http server on ONE origin whose content can be switched at runtime between the legacy fixture
// (the old app at tag legacy-final) and the freshly built apps/free/dist. Serves like the other test servers:
// Cache-Control: no-store, so the browser's HTTP cache never hides a changed sw.js.
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const free = resolve(import.meta.dirname, '../..');
export const LEGACY_DIR = join(free, 'tests/fixtures/legacy');
export const DIST_DIR = join(free, 'dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.css': 'text/css',
  '.woff2': 'font/woff2', '.txt': 'text/plain',
};

export type Content = 'legacy' | 'new';
export interface SwitchableServer {
  origin: string;
  /** Current content. */
  mode: () => Content;
  use: (c: Content) => void;
  /** Every request path served (or 404'd), in order, with the mode at the time. */
  log: Array<{ path: string; mode: Content; status: number }>;
  close: () => Promise<void>;
}

export async function startSwitchableServer(initial: Content = 'legacy'): Promise<SwitchableServer> {
  let mode: Content = initial;
  const log: SwitchableServer['log'] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const dir = mode === 'legacy' ? LEGACY_DIR : DIST_DIR;
    let rel = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(dir, rel));
    // The legacy dir also holds README.md and .gitattributes: never serve them.
    const ok = file.startsWith(dir) && existsSync(file) && statSync(file).isFile() && !/README\.md$|\.gitattributes$/.test(file);
    if (!ok) { log.push({ path: url.pathname, mode, status: 404 }); res.writeHead(404, { 'Cache-Control': 'no-store' }).end('not found'); return; }
    log.push({ path: url.pathname, mode, status: 200 });
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as { port: number }).port;
  return {
    origin: `http://127.0.0.1:${port}/`,
    mode: () => mode,
    use: (c) => { mode = c; },
    log,
    close: () => new Promise<void>((ok) => { server.closeAllConnections?.(); server.close(() => ok()); }),
  };
}
