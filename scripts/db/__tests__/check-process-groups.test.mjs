// EZD-1965 AC-1: scripts/check.mjs runs every step in its own process group and, when it is stopped (SIGTERM) or
// exits early, kills each step's whole group: SIGTERM, then SIGKILL 10 s later. A fake pnpm on PATH stands in for the
// steps; its grandchild ignores SIGTERM, so only the SIGKILL can end it. Nothing real (Docker, the database) starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const groupAlive = (g) => { try { process.kill(-g, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The grandchild ignores SIGTERM and ends itself after 60 s, so a failing test leaves nothing running for long.
const GRANDCHILD = "process.on('SIGTERM', () => {}); setTimeout(() => process.exit(0), 60000);";
const FAKE_PNPM = `#!${process.execPath}
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const a = process.argv.slice(2).join(' ');
const mode = process.env.FAKE_MODE;
if (a.startsWith('install')) {
  const g = spawn(process.execPath, ['-e', ${JSON.stringify(GRANDCHILD)}], { stdio: 'ignore' });
  writeFileSync(process.env.FAKE_PIDS, JSON.stringify({ step: process.pid, grandchild: g.pid }));
  if (mode === 'hang') { console.log('install running'); setTimeout(() => process.exit(0), 60000); }
  else process.exit(0);
} else {
  console.log('error: db:up failed');
  process.exit(1);
}
`;

function setup(mode) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-1965-check-'));
  const bin = path.join(tmp, 'bin');
  const work = path.join(tmp, 'work');
  mkdirSync(bin);
  mkdirSync(work);
  writeFileSync(path.join(work, 'package.json'), '{}\n');
  writeFileSync(path.join(bin, 'pnpm'), FAKE_PNPM);
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  const pids = path.join(tmp, 'pids.json');
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_MODE: mode, FAKE_PIDS: pids, EZD_LANE: '0', EZD_HEAVY_LOCK: '0' };
  delete env.SUPABASE_WORKDIR;
  const check = spawn(process.execPath, [path.join(ROOT, 'scripts/check.mjs'), work, '--fast'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  check.stdout.on('data', (d) => { out += d; });
  check.stderr.on('data', (d) => { out += d; });
  const exited = new Promise((r) => check.on('exit', (code, signal) => r({ code, signal })));
  return { tmp, pids, check, exited, output: () => out };
}

async function waitFor(fn, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) { const v = fn(); if (v) return v; await sleep(100); }
  return fn();
}

function cleanup({ tmp }, ids) {
  for (const pid of [ids?.step, ids?.grandchild]) if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  if (ids?.step) { try { process.kill(-ids.step, 'SIGKILL'); } catch {} }
  rmSync(tmp, { recursive: true, force: true });
}

test('a check stopped with SIGTERM leaves no process of its step group alive 15 s later', { timeout: 60000 }, async () => {
  const run = setup('hang');
  let ids = null;
  try {
    ids = await waitFor(() => existsSync(run.pids) && JSON.parse(readFileSync(run.pids, 'utf8')), 20000);
    assert.ok(ids, `the fake install step started: ${run.output()}`);
    // The step leads its own process group (spawned detached), and the grandchild is in it.
    assert.ok(groupAlive(ids.step), 'the step group is alive before the stop');
    run.check.kill('SIGTERM');
    await sleep(15000);
    assert.equal(groupAlive(ids.step), false, 'no process of the step group is alive 15 s after SIGTERM');
    assert.equal(alive(ids.grandchild), false, 'the SIGTERM-ignoring grandchild is gone');
    const r = await run.exited;
    assert.notEqual(r.code, 0);
  } finally {
    cleanup(run, ids);
  }
});

test('a check that exits early on a failed step kills the groups of the steps before it', { timeout: 60000 }, async () => {
  const run = setup('fail');
  let ids = null;
  try {
    const r = await run.exited;
    assert.equal(r.code, 1, run.output());
    assert.match(run.output(), /CHECK FAIL at database/);
    ids = JSON.parse(readFileSync(run.pids, 'utf8'));
    // The install step ended at once but left its SIGTERM-ignoring grandchild behind in its group.
    await sleep(15000);
    assert.equal(alive(ids.grandchild), false, 'the leftover grandchild is gone 15 s after the check exited');
    assert.equal(groupAlive(ids.step), false, 'no process of the install step group is alive');
  } finally {
    cleanup(run, ids);
  }
});

test('a step group that has ended is forgotten, so a reused id is never signalled', () => {
  const src = readFileSync(path.join(ROOT, 'scripts/check.mjs'), 'utf8');
  assert.match(src, /if \(p\.pid && !groupAlive\(p\.pid\)\) groups\.delete\(p\.pid\);/);
});
