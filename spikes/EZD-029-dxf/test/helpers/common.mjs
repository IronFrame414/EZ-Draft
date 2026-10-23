// Shared test helpers for the EZD-029 spike tests (vault/plans/EZD-029.md Tests table).
// Not a test file: spike-test runs only test/*.test.mjs.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const spikeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const repoRoot = path.resolve(spikeDir, '..', '..');
export const fixtureDxf = path.join(repoRoot, 'fixtures', 'synthetic', 'room-12x10.dxf');
export const fixtureExpected = path.join(repoRoot, 'fixtures', 'synthetic', 'room-12x10.dxf.expected.json');

// Q-0027 (a): Vercel Pro defaults, 300 s and 2048 MB (plan Tests, Limits).
export const LIMIT_SECONDS = 300;
export const LIMIT_MEMORY_MB = 2048;

// 03 rule 5: 1/64 in. Plan Tests, Tolerances: angles 1e-6 rad.
export const TOL_IN = 0.015625;
export const TOL_RAD = 1e-6;

/** Runs `node <args>` in the spike folder; resolves with exit code, stdout and stderr. */
export function runNode(args, { env, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: spikeDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timer;
    if (timeoutMs) timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

/** Runs the Step 4 CLI `src/run-in-limits.mjs` with the given arguments. */
export function runInLimits(args, opts) {
  return runNode([path.join('src', 'run-in-limits.mjs'), ...args], opts);
}

export async function withTmp(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ezd-029-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function readResults(outDir) {
  return JSON.parse(await readFile(path.join(outDir, 'results.json'), 'utf8'));
}

export function stdoutLines(stdout) {
  return stdout.split(/\r?\n/).map((l) => l.trimEnd());
}

/** Group-code / value pairs of a text DXF (test-side reading, independent of src/). */
export function dxfPairs(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    out.push({ code: parseInt(lines[i].trim(), 10), value: lines[i + 1] });
  }
  return out;
}

/** Names of the LAYER table records (group 2 of each `0 LAYER` inside TABLE LAYER). */
export function layerTableNames(text) {
  const pairs = dxfPairs(text);
  const names = [];
  let inLayerTable = false;
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (p.code === 0 && p.value === 'TABLE' && pairs[i + 1]?.code === 2 && pairs[i + 1].value === 'LAYER') {
      inLayerTable = true;
      i++;
      continue;
    }
    if (inLayerTable && p.code === 0 && p.value === 'ENDTAB') inLayerTable = false;
    if (inLayerTable && p.code === 0 && p.value === 'LAYER') {
      for (let j = i + 1; j < pairs.length && pairs[j].code !== 0; j++) {
        if (pairs[j].code === 2) {
          names.push(pairs[j].value);
          break;
        }
      }
    }
  }
  return names;
}

/** Inserts `records` (DXF text, LF lines ending in \n) right before the ENTITIES section's ENDSEC. */
export function insertBeforeEntitiesEndsec(text, records) {
  const start = text.indexOf('\nENTITIES\n');
  if (start < 0) throw new Error('no ENTITIES section');
  const end = text.indexOf('\n0\nENDSEC\n', start);
  if (end < 0) throw new Error('no ENTITIES ENDSEC');
  return text.slice(0, end + 1) + records + text.slice(end + 1);
}

/** The spike's parser (Step 3a): tests obtain it only through `createParser()` in src/parser.mjs. */
export async function parseDxf(text) {
  const { createParser } = await import('../../src/parser.mjs');
  return createParser().parseSync(text);
}

/** buildReport (Step 3) with the Step 3a default parser, for a DXF text given in the test. */
export async function reportFor(label, fileName, text) {
  const { createHash } = await import('node:crypto');
  const { buildReport } = await import('../../src/report.mjs');
  const { defaultParser } = await import('../../src/parser.mjs');
  const buf = Buffer.from(text, 'utf8');
  return buildReport({
    label,
    fileName,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    text,
    parser: defaultParser(),
  });
}

export function near(a, b, tol = TOL_IN) {
  return Math.abs(a - b) <= tol;
}

export function samePoint(p, [x, y], tol = TOL_IN) {
  return p != null && near(p.x, x, tol) && near(p.y, y, tol);
}

/** True when the points equal the expected corners as a set (same size, each matched once). */
export function samePointSet(points, expected, tol = TOL_IN) {
  if (!points || points.length !== expected.length) return false;
  const left = [...points];
  for (const e of expected) {
    const i = left.findIndex((p) => samePoint(p, e, tol));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

/** True when the segments equal the expected set, unordered and in either direction. */
export function sameSegmentSet(segments, expected, tol = TOL_IN) {
  if (segments.length !== expected.length) return false;
  const left = [...segments];
  for (const [a, b] of expected) {
    const i = left.findIndex(
      ([p, q]) => (samePoint(p, a, tol) && samePoint(q, b, tol)) || (samePoint(p, b, tol) && samePoint(q, a, tol)),
    );
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

export function fileUrl(p) {
  return pathToFileURL(p).href;
}
