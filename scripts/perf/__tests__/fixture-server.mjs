// EZD-017 section 3 test helper (vault/plans/EZD-017.md, T-b): serves node:test fixtures from memory over
// node:http on 127.0.0.1, port 0. `.js` defaults to text/javascript, `.html` to text/html; `gzip: true` sends
// the body gzip-encoded with Content-Encoding: gzip; an unknown path is 404. `requests` lists every requested
// path (pathname + search) in order, so a test can prove a file was never fetched (T4).
import http from 'node:http';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

function typeFor(p) {
  const dot = p.lastIndexOf('.');
  return (dot >= 0 && TYPES[p.slice(dot)]) || 'application/octet-stream';
}

/**
 * @param {Record<string, { body: string | Buffer; type?: string; gzip?: boolean; status?: number }>} files
 * @returns {Promise<{ baseUrl: string; close(): Promise<void>; requests: string[] }>}
 */
export function startFixtureServer(files) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    requests.push(u.pathname + u.search);
    const f = Object.prototype.hasOwnProperty.call(files, u.pathname) ? files[u.pathname] : undefined;
    if (!f) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('not found');
      return;
    }
    const raw = Buffer.isBuffer(f.body) ? f.body : Buffer.from(f.body, 'utf8');
    const headers = { 'Content-Type': f.type ?? typeFor(u.pathname), 'Cache-Control': 'no-store' };
    let body = raw;
    if (f.gzip) {
      body = zlib.gzipSync(raw);
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = String(body.length);
    res.writeHead(f.status ?? 200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        close: () =>
          new Promise((done) => {
            for (const s of sockets) s.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
