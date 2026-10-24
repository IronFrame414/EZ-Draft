// EZD-027 spike server (vault/plans/EZD-027.md Step 2). Node 22 built-ins only. Allowlist only:
// the page and its modules from public/, the pinned three build folder, EZD-010's DM Mono file,
// /health and POST /results. Everything else is 404.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = import.meta.dirname;
const PUBLIC_DIR = path.join(HERE, 'public');
const VENDOR_DIR = path.dirname(fileURLToPath(import.meta.resolve('three')));
const FONT_NAME = 'dm-mono-latin-400-normal.woff2';
const FONT_FILE = path.join(HERE, '..', '..', 'app', 'src', 'styles', 'fonts', FONT_NAME);
const MAX_BODY = 1048576;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

const PAGE_MODULE_RE = /^\/([A-Za-z0-9_-]+\.mjs)$/;
const VENDOR_RE = /^\/vendor\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.js)$/;

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function notFound(res) {
  send(res, 404, 'text/plain; charset=utf-8', 'not found');
}

function sendFile(res, file) {
  let data;
  try {
    data = readFileSync(file);
  } catch {
    notFound(res);
    return;
  }
  send(res, 200, TYPES[path.extname(file)], data);
}

function deviceSlug(label) {
  const s = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  return s.length >= 1 && s.length <= 40 ? s : 'unknown';
}

function utcStamp(d) {
  // YYYYMMDDTHHMMSSmmmZ
  return d.toISOString().replace(/[-:.]/g, '');
}

function handleResults(req, res, outDir) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) tooLarge = true;
    if (!tooLarge) chunks.push(chunk);
  });
  req.on('end', () => {
    if (tooLarge) {
      send(res, 413, 'text/plain; charset=utf-8', 'too large');
      return;
    }
    const text = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      send(res, 400, 'text/plain; charset=utf-8', 'invalid json');
      return;
    }
    if (!body || typeof body !== 'object' || body.ticket !== 'EZD-027') {
      send(res, 400, 'text/plain; charset=utf-8', 'invalid results');
      return;
    }
    const file = `results-${deviceSlug(body.device?.label)}-${utcStamp(new Date())}.json`;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, file), text);
    send(res, 201, TYPES['.json'], JSON.stringify({ file }));
  });
}

export function createSpikeServer({ outDir }) {
  return http.createServer((req, res) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (req.method === 'POST' && pathname === '/results') {
      handleResults(req, res, outDir);
      return;
    }
    if (req.method !== 'GET') {
      notFound(res);
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
      return;
    }
    if (pathname === '/health') {
      send(res, 200, 'text/plain; charset=utf-8', 'ok');
      return;
    }
    if (pathname === `/fonts/${FONT_NAME}`) {
      sendFile(res, FONT_FILE);
      return;
    }
    let m = PAGE_MODULE_RE.exec(pathname);
    if (m) {
      sendFile(res, path.join(PUBLIC_DIR, m[1]));
      return;
    }
    m = VENDOR_RE.exec(pathname);
    if (m) {
      sendFile(res, path.join(VENDOR_DIR, m[1]));
      return;
    }
    notFound(res);
  });
}

export function listenOptions(argv) {
  const opts = { host: '127.0.0.1', port: 4027, outDir: path.resolve('out'), lan: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lan') {
      opts.lan = true;
      opts.host = '0.0.0.0';
    } else if (a === '--port') {
      opts.port = Number(argv[++i]);
    } else if (a === '--out') {
      opts.outDir = path.resolve(argv[++i]);
    }
  }
  return opts;
}

function privateIPv4() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const [p, q] = a.address.split('.').map(Number);
      if (p === 10 || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168)) out.push(a.address);
    }
  }
  return out;
}

function main() {
  const opts = listenOptions(process.argv.slice(2));
  const server = createSpikeServer({ outDir: opts.outDir });
  server.listen(opts.port, opts.host, () => {
    if (opts.lan) {
      for (const addr of privateIPv4()) console.log(`http://${addr}:${opts.port}/?device=surface`);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
