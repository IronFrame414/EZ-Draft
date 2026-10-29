// EZD-173 H1-H3 (plan vault/plans/EZD-173.md section 4, C14): the SessionEnd hook commits vault/ only when no other unit is in
// flight, and never blocks. Each case runs the real hook against a throwaway git repo on develop.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.claude/hooks/session-end.mjs');
const ID = ['-c', 'user.name=EZ Draft Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false'];
const git = (dir, ...a) => {
  const r = spawnSync('git', ['-C', dir, ...ID, ...a], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const temps = [];
const tmp = (prefix) => { const d = mkdtempSync(path.join(os.tmpdir(), prefix)); temps.push(d); return d; };
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

function repo() {
  const dir = tmp('ezd173-hook-');
  git(dir, 'init', '-q', '-b', 'develop');
  git(dir, 'config', 'user.name', 'EZ Draft Test');
  git(dir, 'config', 'user.email', 'test@example.test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  mkdirSync(path.join(dir, 'vault/handoff'), { recursive: true });
  mkdirSync(path.join(dir, 'vault/tools'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/tools/next_ticket.mjs'), 'process.exit(0);\n');
  writeFileSync(path.join(dir, 'vault/handoff/CURRENT.md'), 'before\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  writeFileSync(path.join(dir, 'vault/handoff/CURRENT.md'), 'edited this session\n');
  return dir;
}
function runHook(dir, inflight, env = {}) {
  return new Promise((resolve) => {
    const e = { ...process.env, CLAUDE_PROJECT_DIR: dir, EZD_INFLIGHT_DIR: inflight, ...env };
    delete e.EZD_ROOT;
    if (!('EZD_UNIT_ID' in env)) delete e.EZD_UNIT_ID;
    const t0 = Date.now();
    const c = spawn(process.execPath, [HOOK], { env: e, cwd: dir });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => { stdout += d; });
    c.stderr.on('data', (d) => { stderr += d; });
    c.on('close', (status) => resolve({ status, stdout, stderr, ms: Date.now() - t0 }));
    c.stdin.end();
  });
}

describe('EZD-173 H: session-end hook', () => {
  test('H1: with no other unit in flight the hook commits vault/ as "session end"', async () => {
    const dir = repo();
    const r = await runHook(dir, tmp('ezd173-inflight-'));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): session end');
    assert.equal(git(dir, 'status', '--porcelain'), '');
  });

  test('H2: with another unit in flight the hook commits nothing and leaves the change', async () => {
    const dir = repo();
    const inflight = tmp('ezd173-inflight-');
    writeFileSync(path.join(inflight, 'plan-EZD-004.json'), JSON.stringify({ id: 'plan-EZD-004', pid: process.pid, unit: 'plan', ticket: 'EZD-004' }));
    const head = git(dir, 'rev-parse', 'HEAD');
    const r = await runHook(dir, inflight, { EZD_UNIT_ID: 'build-EZD-002' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
    assert.equal(readFileSync(path.join(dir, 'vault/handoff/CURRENT.md'), 'utf8'), 'edited this session\n');
    assert.match(git(dir, 'status', '--porcelain'), /CURRENT\.md/);
  });

  test('H3: a busy ledger lock makes the hook give up inside the 30 s hook timeout, with a message and no commit', async () => {
    const dir = repo();
    const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},90000)'], { stdio: 'ignore' });
    try {
      writeFileSync(path.join(dir, '.git/ezdraft-ledger.lock'), `${JSON.stringify({ pid: child.pid, owner: 'holder', at: new Date().toISOString(), base: null })}\n`);
      const head = git(dir, 'rev-parse', 'HEAD');
      const r = await runHook(dir, tmp('ezd173-inflight-'));
      assert.equal(r.status, 0);
      assert.ok(r.ms < 30000, `took ${r.ms} ms`);
      assert.ok(r.stderr.includes('session-end hook: ledger lock busy; vault/ not committed'), r.stderr);
      assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
    } finally { child.kill(); }
  });
});
