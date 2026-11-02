// The SessionEnd hook (EZD-173 C14, changed by REMEDIATION-PLAN 2.12): it never commits and never blocks. Each case runs the real hook against a throwaway git repo on develop.
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

// REMEDIATION-PLAN 2.12 (D1 (a), D2 (a)): the hook replaced EZD-173 C14's commit. Running records live in the records
// database, which only the launcher writes, so the hook commits nothing in any state; it only reports ledger problems.
describe('2.12 H: session-end hook commits nothing (D1 (a), D2 (a))', () => {
  test('H1: with no other unit in flight the hook makes no commit and leaves the working tree as it was', async () => {
    const dir = repo();
    const head = git(dir, 'rev-parse', 'HEAD');
    const r = await runHook(dir, tmp('ezd173-inflight-'));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
    assert.equal(readFileSync(path.join(dir, 'vault/handoff/CURRENT.md'), 'utf8'), 'edited this session\n');
    assert.equal(git(dir, 'ls-files', '--others', '--exclude-standard'), '', 'no handoff archive file is written');
  });

  test('H2: a failing ledger check is reported on stderr; the hook still exits 0 and commits nothing', async () => {
    const dir = repo();
    writeFileSync(path.join(dir, 'vault/tools/next_ticket.mjs'), "console.log('EZD-002 has unknown status');process.exit(1);\n");
    const head = git(dir, 'rev-parse', 'HEAD');
    const r = await runHook(dir, tmp('ezd173-inflight-'));
    assert.equal(r.status, 0);
    assert.match(r.stderr, /session-end hook: ledger problems\nEZD-002 has unknown status/);
    assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  });

  test('H3: a held ledger lock does not matter: the hook ends well inside the 30 s hook timeout', async () => {
    const dir = repo();
    const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},90000)'], { stdio: 'ignore' });
    try {
      writeFileSync(path.join(dir, '.git/ezdraft-ledger.lock'), `${JSON.stringify({ pid: child.pid, owner: 'holder', at: new Date().toISOString(), base: null })}\n`);
      const head = git(dir, 'rev-parse', 'HEAD');
      const r = await runHook(dir, tmp('ezd173-inflight-'));
      assert.equal(r.status, 0);
      assert.ok(r.ms < 5000, `took ${r.ms} ms`);
      assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
    } finally { child.kill(); }
  });
});
