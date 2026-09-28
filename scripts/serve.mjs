import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { securityHeaders } from './security.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const base = process.env.PAGES_BASE_PATH || '/';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };

await stat(join(root, 'index.html')).catch(() => { throw new Error('Build first with npm run build.'); });
const server = createServer(async (request, response) => {
  for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
  // This is deliberately a static GET server. There is no body/upload endpoint.
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('This app has no upload endpoint.');
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(base)) throw new Error('Unknown base path');
    const relative = pathname.slice(base.length) || 'index.html';
    const target = resolve(root, relative);
    if (!target.startsWith(root + sep)) throw new Error('Invalid path');
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
server.listen(port, host, () => console.log(`Local ID preview: http://${host}:${port}${base}`));
