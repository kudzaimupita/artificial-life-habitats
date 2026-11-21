#!/usr/bin/env node
// A static file server for looking at the pages locally. No dependencies.
//
//   node scripts/serve.mjs            serves the repository on port 8080
//   PORT=3000 node scripts/serve.mjs

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Only what the pages need is reachable. */
const SERVED = ['index.html', 'habitats', 'src'];

/**
 * Map a request path to a file inside the served folders, or null.
 * @param {string} urlPath
 * @returns {string | null}
 */
export function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = normalize(decoded).replace(/^[/\\]+/, '') || 'index.html';
  const file = resolve(join(ROOT, relative));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return null;
  const top = file.slice(ROOT.length + 1).split(sep)[0];
  return SERVED.includes(top) ? file : null;
}

/**
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
async function handle(request, response) {
  /** @param {number} code @param {string} text */
  const plain = (code, text) => {
    response.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(text);
  };
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return plain(405, 'Method not allowed');

  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  let file = resolvePath(pathname);
  if (!file) return plain(404, 'Not found');
  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file);
    }
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-store',
    });
    if (request.method === 'HEAD') return response.end();
    createReadStream(file).pipe(response);
  } catch {
    plain(404, 'Not found');
  }
}

/**
 * @param {number} port 0 picks a free port.
 * @param {string} [host]
 * @returns {Promise<import('node:http').Server>}
 */
export function serve(port, host = '127.0.0.1') {
  const server = createServer((request, response) => void handle(request, response));
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => done(server));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  try {
    const server = await serve(port);
    const address = server.address();
    const bound = typeof address === 'object' && address ? address.port : port;
    console.log(`Serving the habitats at http://localhost:${bound}/  (Ctrl+C to stop)`);
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code;
    console.error(
      code === 'EADDRINUSE'
        ? `Port ${port} is in use. Pick another with PORT=<number> npm run serve.`
        : error,
    );
    process.exitCode = 1;
  }
}
