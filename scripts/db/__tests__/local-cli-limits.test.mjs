// EZD-1965 AC-2: every supabase CLI call in scripts/db/local.mjs has a time limit (20 min for start and db reset,
// 2 min for status and env) and is killed with SIGKILL past it, then local.mjs exits 1 naming the command and the
// limit. A stub CLI in a copied repo never exits; the limits come from the env override so the test takes seconds.
// No real CLI, Docker or database is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// The stub spawns a grandchild (as `node supabase.js` runs the Go binary) that ignores SIGTERM and ends itself after
// 60 s, records both pids, then hangs on the command named in FAKE_HANG; any other command fails at once.
const GRANDCHILD = "process.on('SIGTERM', () => {}); setTimeout(() => process.exit(0), 60000);";
const FAKE_CLI = `#!${process.execPath}
const { spawn } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const a = process.argv.slice(2).join(' ');
if (a === process.env.FAKE_HANG) {
  process.on('SIGTERM', () => {});
  const g = spawn(process.execPath, ['-e', ${JSON.stringify(GRANDCHILD)}], { stdio: 'ignore' });
  appendFileSync(process.env.FAKE_PIDS, JSON.stringify({ cli: process.pid, grandchild: g.pid }) + '\\n');
  setTimeout(() => process.exit(0), 60000);
} else {
  process.stderr.write('not running\\n');
  process.exit(1);
}
`;

function copyRepo() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-1965-cli-'));
  const dbDir = path.join(tmp, 'scripts', 'db');
  mkdirSync(dbDir, { recursive: true });
  const srcDir = path.join(ROOT, 'scripts', 'db');
  for (const f of readdirSync(srcDir).filter((n) => n.endsWith('.mjs'))) {
    if (statSync(path.join(srcDir, f)).isFile()) copyFileSync(path.join(srcDir, f), path.join(dbDir, f));
  }
  mkdirSync(path.join(tmp, 'vault', 'tools'), { recursive: true });
  copyFileSync(path.join(ROOT, 'vault', 'tools', 'trusted-git.mjs'), path.join(tmp, 'vault', 'tools', 'trusted-git.mjs'));
  mkdirSync(path.join(tmp, 'supabase'), { recursive: true });
  writeFileSync(path.join(tmp, 'supabase', 'config.toml'), 'project_id = "ezd1965"\n');
  const binDir = path.join(tmp, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(path.join(binDir, 'supabase'), FAKE_CLI);
  chmodSync(path.join(binDir, 'supabase'), 0o755);
  return tmp;
}

function runUp(tmp, extraEnv) {
  const pids = path.join(tmp, 'pids.jsonl');
  const env = { ...process.env, FAKE_PIDS: pids, ...extraEnv };
  // The copied repo has no lane folder, so the child runs without a lane.
  delete env.EZD_LANE;
  delete env.SUPABASE_WORKDIR;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'db', 'local.mjs'), 'up'], { cwd: tmp, env, encoding: 'utf8', timeout: 30000 });
  const ids = existsSync(pids) ? readFileSync(pids, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  return { ...r, secs: (Date.now() - t0) / 1000, ids };
}

function cleanup(tmp, ids) {
  for (const { cli, grandchild } of ids) for (const pid of [cli, grandchild]) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  rmSync(tmp, { recursive: true, force: true });
}

test('a status call that never ends is killed at the short limit and local.mjs exits 1 naming it', () => {
  const tmp = copyRepo();
  let r = { ids: [] };
  try {
    r = runUp(tmp, { FAKE_HANG: 'status', EZD_SUPABASE_SHORT_LIMIT_MS: '1500', EZD_SUPABASE_LONG_LIMIT_MS: '60000' });
    assert.equal(r.status, 1, `exit 1: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /supabase status did not finish within 1500 ms: killed it \(SIGKILL\)/);
    assert.ok(r.secs < 15, `ended at the limit, not the stub's 60 s (${r.secs} s)`);
    assert.equal(r.ids.length, 1, 'the stub ran once');
    assert.equal(alive(r.ids[0].cli), false, 'the CLI process is gone');
    assert.equal(alive(r.ids[0].grandchild), false, "the CLI's child is gone too");
  } finally {
    cleanup(tmp, r.ids);
  }
});

test('a start call that never ends is killed at the long limit and local.mjs exits 1 naming it', () => {
  const tmp = copyRepo();
  let r = { ids: [] };
  try {
    // status fails at once without mentioning docker, so up goes on to `supabase start`, which hangs.
    r = runUp(tmp, { FAKE_HANG: 'start', EZD_SUPABASE_SHORT_LIMIT_MS: '60000', EZD_SUPABASE_LONG_LIMIT_MS: '2000' });
    assert.equal(r.status, 1, `exit 1: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /supabase start did not finish within 2 s: killed it \(SIGKILL\)/);
    assert.ok(r.secs < 15, `ended at the limit (${r.secs} s)`);
    assert.equal(r.ids.length, 1);
    assert.equal(alive(r.ids[0].cli), false, 'the CLI process is gone');
    assert.equal(alive(r.ids[0].grandchild), false, "the CLI's child is gone too");
  } finally {
    cleanup(tmp, r.ids);
  }
});

test('the default limits are 20 min for start, stop and db reset and 2 min for the other calls', () => {
  const src = readFileSync(path.join(ROOT, 'scripts', 'db', 'local.mjs'), 'utf8');
  assert.match(src, /const LONG_LIMIT_MS = 20 \* 60000;/);
  assert.match(src, /const SHORT_LIMIT_MS = 2 \* 60000;/);
  assert.match(src, /const LONG_COMMANDS = new Set\(\['start', 'stop', 'db reset'\]\);/);
  // Every CLI call goes through cli(), which applies the limit; nothing spawns the CLI another way.
  assert.equal((src.match(/supabaseBin/g) || []).length, 2, 'supabaseBin is defined once and used once, in cli()');
  assert.match(src, /killSignal: 'SIGKILL'/);
});
