// EZD-164 Step 10 (vault/plans/EZD-164.md D-Run): runs the spike's Playwright spec and writes out/run-log.txt and out/summary.json.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize, redact } from './summarize.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const spike = path.resolve(here, '..');
const repo = path.resolve(spike, '..', '..');
const out = path.join(spike, 'out');

function run(cmd, args, options, echo = true) {
  return new Promise((resolve) => {
    let text = '';
    const child = spawn(cmd, args, options);
    const take = (sink) => (chunk) => {
      text += chunk.toString();
      if (echo) sink.write(chunk);
    };
    child.stdout.on('data', take(process.stdout));
    child.stderr.on('data', take(process.stderr));
    child.on('close', (code) => resolve({ code: code ?? 1, text }));
  });
}

const env = await run(process.execPath, [path.join(repo, 'scripts', 'db', 'local.mjs'), 'env'], {
  cwd: spike,
  stdio: ['ignore', 'pipe', 'pipe'],
}, false);
if (env.code !== 0) {
  console.error('Local Supabase is not running: run pnpm db:up');
  process.exit(1);
}
const secrets = Object.values(JSON.parse(env.text.trim())).map(String);

const childEnv = { ...process.env };
delete childEnv.EZD_TEST_GREP;
const pw = await run('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.config.ts'], {
  cwd: spike,
  env: childEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});

const commit = (
  await run('git', ['rev-parse', 'HEAD'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] }, false)
).text.trim();
const log = redact(
  `EZD-164 run ${new Date().toISOString()}\ncommit ${commit}\nplaywright exit ${pw.code}\n${pw.text}`,
  secrets,
);
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'run-log.txt'), log);

try {
  const s = summarize(log);
  const summary = {
    verdict: s.verdict,
    chromiumControl: s.chromiumControl,
    failedWebkitChecks: s.failedWebkitChecks,
    playwrightExit: pw.code,
    results: s.results,
  };
  writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`EZD-164 VERDICT ${s.verdict}`);
  process.exit(0);
} catch (error) {
  console.log(`EZD-164 NO VERDICT ${error.message}`);
  process.exit(1);
}
