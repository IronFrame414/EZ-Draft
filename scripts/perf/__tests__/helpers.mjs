// EZD-017 shared node:test helpers (vault/plans/EZD-017.md section 1 T-b, T-c, T-d). Not a test file.
// C(x) = zlib.gzipSync(x, { level: 6 }).length computed here with Node's zlib, never by the module under test
// (section 4 header; Q-0071 (a)).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';
import process from 'node:process';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..', '..');
export const RUN_MJS = path.join(REPO_ROOT, 'scripts', 'perf', 'run.mjs');

export const C = (x) => zlib.gzipSync(Buffer.from(x, 'utf8'), { level: 6 }).length;

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** T-b: first n characters of the base64 of ceil(n*3/4) mulberry32 (seed 17) bytes. */
export function seeded(n) {
  const rand = mulberry32(17);
  const bytes = Buffer.alloc(Math.ceil((n * 3) / 4));
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rand() * 256);
  return bytes.toString('base64').slice(0, n);
}

/** T-c: every <name>.js except main.js. */
export const padJs = (n) => 'const pad = "' + seeded(n) + '";\n';

/** T-c: main.js. */
export const mainJs = () =>
  padJs(5000) +
  "document.addEventListener('click', () => import('/on-click.js'));\n" +
  "setTimeout(() => import('/at-start.js'), 0);\n" +
  "new Worker('/worker.js');\n" +
  "window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));\n";

/** T-c: <page>.html with its script tags in order; `head` is any inline text placed first. */
export const htmlPage = (scripts, head = '') =>
  '<!doctype html><html><head>' +
  head +
  scripts.map((s) => `<script src="${s}"></script>`).join('') +
  '</head><body></body></html>';

/** T-c: pan.html, a canvas region and no script. */
export const PAN_HTML =
  '<!doctype html><html><head></head><body><main data-shell-region="canvas" style="position:fixed;inset:0"></main></body></html>';

export const tmpDir = () => mkdtempSync(path.join(os.tmpdir(), 'ezd-perf-test-'));

/** T-d: writes <tmp>/perf.config.mjs and returns its path. */
export function writeConfig(dir, measurements, panUrl = '/pan.html') {
  const p = path.join(dir, 'perf.config.mjs');
  writeFileSync(
    p,
    'export default ' + JSON.stringify({ profile: 'desktop', panUrl, measurements }, null, 2) + ';\n',
  );
  return p;
}

/**
 * T-d: node scripts/perf/run.mjs <args> from the repo root, async so a fixture server in this
 * process can answer (never spawnSync). Resolves on `close`; `status` is null when killed.
 */
export function runCli(args, timeout = 170000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUN_MJS, ...args], { cwd: REPO_ROOT, timeout });
    let stdout = '';
    let stderr = '';
    let error;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      error = e;
    });
    child.on('close', (status, signal) => {
      const r = { status, signal, stdout, stderr };
      if (error) r.error = error;
      resolve(r);
    });
  });
}

export function readLatest(outDir) {
  return JSON.parse(readFileSync(path.join(outDir, 'latest.json'), 'utf8'));
}

export function readHistory(outDir) {
  return readFileSync(path.join(outDir, 'history.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l));
}

export const hasLatest = (outDir) => existsSync(path.join(outDir, 'latest.json'));

export const rowOf = (results, id) => results.measurements.find((m) => m.id === id);
