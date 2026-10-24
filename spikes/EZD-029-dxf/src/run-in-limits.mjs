// EZD-029 local emulation of the job function limits (vault/plans/EZD-029.md Step 4; the EZD-028
// Step 5 pattern): each parse runs in a child Node process with the function's memory cap and is
// killed after the function's time limit (Q-0027 (a): 300 s, 2048 MB).
// Usage: node src/run-in-limits.mjs --out <dir> (--file <path> [--label <label>])... | --standin <units> [--label <label>]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMORY_MB, SECONDS, judge } from './limits.mjs';
import { generateStandIn } from './standin.mjs';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

function usage(message) {
  process.stderr.write(`run-in-limits: ${message}\n`);
  process.stderr.write(
    'usage: run-in-limits.mjs --out <dir> (--file <path> [--label <label>])... | --standin <units> [--label <label>]\n',
  );
  process.exit(2);
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {string[]} */ const files = [];
  /** @type {string[]} */ const labels = [];
  let standin = null;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--file', '--label', '--standin', '--out'].includes(flag)) usage(`unknown argument ${flag}`);
    if (value === undefined) usage(`${flag} needs a value`);
    i++;
    if (flag === '--file') files.push(value);
    else if (flag === '--label') labels.push(value);
    else if (flag === '--standin') standin = value;
    else out = value;
  }
  if (!out) usage('--out is required');
  if (standin === null && files.length === 0) usage('give --file or --standin');
  if (standin !== null && !/^[1-9]\d*$/.test(standin)) usage('--standin needs a whole number of units');
  return { files, labels, standin: standin === null ? null : Number(standin), out: path.resolve(out) };
}

/**
 * Runs child.mjs on one file inside the limits.
 * @param {string} file
 * @param {string} label
 */
function runChild(file, label) {
  const args = [`--max-old-space-size=${MEMORY_MB}`, path.join(srcDir, 'child.mjs'), file, label];
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
  let stdout = '';
  child.stdout.on('data', (d) => (stdout += d));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, SECONDS * 1000);
  return new Promise((resolve) => {
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      let report = null;
      try {
        report = JSON.parse(stdout.trim().split('\n').pop() ?? '');
      } catch {
        report = null;
      }
      resolve({ exitCode: report || exitCode !== 0 ? exitCode : 1, timedOut, report });
    });
  });
}

/** Developer lines (Step 3 "Printed lines"); counts and type names only. */
function printLines(report) {
  const lines = [`EZD-029 report: ${report.label}`];
  if (report.binary) {
    lines.push('binary DXF: not parsed');
  } else {
    const inFile = report.raw.total + report.raw.blocks.entities;
    const read = report.parsed.total + report.parsed.blocks.entities;
    lines.push(`entities in file: ${inFile}; read: ${read}`);
    const notRead = Object.entries(report.notRead).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    for (const [type, n] of notRead) lines.push(`${n} entities of type ${type} not read`);
  }
  const { seconds, memoryMb } = report.runtime.limits;
  lines.push(
    `time: ${report.timing.ms.toFixed(1)} ms; peak memory: ${report.memory.maxRssMb.toFixed(1)} MB; limits: ${seconds} s, ${memoryMb} MB`,
  );
  process.stdout.write(`${lines.join('\n')}\n`);
}

const opts = parseArgs(process.argv.slice(2));
mkdirSync(opts.out, { recursive: true });
const resultsFile = path.join(opts.out, 'results.json');

/** @type {Array<{ file: string, label: string }>} */
const jobs = opts.files.map((file, i) => ({
  file: path.resolve(file),
  label: opts.labels[i] ?? path.basename(file, path.extname(file)),
}));

/** @type {Record<string, { units: number, entities: number, bytes: number, generateMs: number }>} */
const standins = {};
if (opts.standin !== null) {
  const label = opts.labels[0] ?? `standin-${opts.standin}`;
  const dir = path.join(opts.out, 'standin');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `standin-${opts.standin}.dxf`);
  const t0 = process.hrtime.bigint();
  const text = generateStandIn({ units: opts.standin });
  writeFileSync(file, text);
  const generateMs = Number(process.hrtime.bigint() - t0) / 1e6;
  standins[label] = { units: opts.standin, entities: opts.standin * 100, bytes: Buffer.byteLength(text), generateMs };
  jobs.push({ file, label });
}

let failed = false;
for (const { file, label } of jobs) {
  const { exitCode, timedOut, report } = await runChild(file, label);
  const maxRssMb = report?.memory?.maxRssMb ?? 0;
  const verdict = judge({ exitCode, timedOut, maxRssMb }, { seconds: SECONDS, memoryMb: MEMORY_MB });
  if (!verdict.pass) failed = true;
  if (!report) {
    process.stderr.write(`run-in-limits: ${label}: ${verdict.reason}\n`);
    continue;
  }
  report.pass = verdict.pass;

  const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {};
  results.runs = { ...(results.runs ?? {}), [label]: report };
  if (standins[label]) results.standins = { ...(results.standins ?? {}), [label]: standins[label] };
  writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);

  printLines(report);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!verdict.pass) process.stderr.write(`run-in-limits: ${label}: ${verdict.reason}\n`);
}

process.exit(failed ? 1 : 0);
