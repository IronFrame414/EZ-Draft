// EZD-017 Step 8 (vault/plans/EZD-017.md R0, K1-K4): the perf check CLI, run by the gate as `pnpm run perf`.
// node scripts/perf/run.mjs [--base-url <url>] [--config <file>] [--pan-url <path>] [--only <id,id>] [--out <dir>]
// Exit 0 pass; 1 any fail or error, or a run error; 2 usage error (no results file).
import path from 'node:path';
import process from 'node:process';
import { UsageError, runCheck } from './check.mjs';

const FLAGS = {
  '--base-url': 'baseUrl',
  '--config': 'configPath',
  '--pan-url': 'panUrl',
  '--only': 'only',
  '--out': 'outDir',
};

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const key = FLAGS[argv[i]];
    if (!key) throw new UsageError(`unknown argument ${argv[i]}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${argv[i - 1]} needs a value`);
    opts[key] = key === 'only' ? value.split(',').filter((s) => s !== '') : value;
  }
  return opts;
}

async function main() {
  const repoRoot = path.resolve(import.meta.dirname, '..', '..');
  let exitCode;
  let results;
  let report;
  try {
    const opts = parseArgs(process.argv.slice(2));
    ({ exitCode, results, bundleReport: report } = await runCheck({ repoRoot, cwd: process.cwd(), ...opts }));
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`perf: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
  for (const r of results.measurements) {
    process.stdout.write(`${r.id}  ${r.status}  ${r.value}  ${r.budget}\n`);
  }
  // EZD-020 Step 6: the bundle report, after the per-measurement lines and before PERF PASS or PERF FAIL.
  if (report) process.stdout.write(`\n${report}\n`);
  if (results.error) {
    process.stdout.write(`PERF FAIL: ${results.error}\n`);
  } else if (results.pass) {
    process.stdout.write('PERF PASS\n');
  } else {
    const bad = results.measurements.filter((r) => r.status === 'fail' || r.status === 'error');
    process.stdout.write(`PERF FAIL: ${bad.map((r) => r.id).join(', ')}\n`);
  }
  return exitCode;
}

process.exitCode = await main();
