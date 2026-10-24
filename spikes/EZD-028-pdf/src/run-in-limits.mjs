// EZD-028 local emulation of the production function limits (vault/plans/EZD-028.md Step 5).
// Usage: node src/run-in-limits.mjs [--out <dir>] [--stress]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Q-0027 (a): Vercel Pro default function limits, 300 s and 2 GB.
const SECONDS = 300;
const MEMORY_MB = 2048;

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir =
  outIndex !== -1 && args[outIndex + 1]
    ? path.resolve(process.cwd(), args[outIndex + 1])
    : path.resolve(srcDir, '..', 'out');
const stress = args.includes('--stress');
mkdirSync(outDir, { recursive: true });

const childArgs = [
  `--max-old-space-size=${MEMORY_MB}`,
  path.join(srcDir, 'child.mjs'),
  '--out',
  outDir,
  ...(stress ? ['--stress'] : []),
];
const child = spawn(process.execPath, childArgs, { stdio: ['ignore', 'pipe', 'inherit'] });

let stdout = '';
child.stdout.on('data', (d) => (stdout += d));
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill('SIGKILL');
}, SECONDS * 1000);

const { code, signal } = await new Promise((resolve) => {
  child.on('close', (c, s) => resolve({ code: c, signal: s }));
});
clearTimeout(timer);

function fail(reason) {
  process.stderr.write(`run-in-limits: ${reason}\n`);
  process.exit(1);
}

if (timedOut) fail(`child killed after ${SECONDS} s`);
if (code !== 0) fail(`child exited with code ${code} signal ${signal}`);

let report;
try {
  report = JSON.parse(stdout.trim().split('\n').pop());
} catch {
  fail('child printed no JSON line');
}

const resultsFile = path.join(outDir, 'results.json');
const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {};
results.limits = { seconds: SECONDS, memoryMb: MEMORY_MB };
results[stress ? 'stress' : 'room'] = report;
writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);

if (report.maxRssMb >= MEMORY_MB) fail(`maxRssMb ${report.maxRssMb} >= ${MEMORY_MB}`);
