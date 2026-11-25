// EZD-1967: the loop restarts itself after a merge that changes its own code. Exit, the dry run and child processes
// are stubbed; nothing here starts or stops docker, launchd or the database. One case runs git in a scratch repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRY_RUN_TIMEOUT_MS, RESTART_EXIT, changedFiles, createSelfRestart, firstErrorLine, isLoopFile, runDryRun } from '../self-restart.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function harness(dryRunResults) {
  const logs = [];
  const exits = [];
  let dryRuns = 0;
  const r = createSelfRestart({
    log: (m) => logs.push(m),
    exit: (code) => exits.push(code),
    dryRun: () => { const res = dryRunResults[Math.min(dryRuns, dryRunResults.length - 1)]; dryRuns++; return res; },
  });
  return { r, logs, exits, dryRuns: () => dryRuns };
}

test('AC-EZD-1967-1/2/4: a merge touching scripts/loop/heavy-lock.mjs drains, then exits 75 after a good dry run', () => {
  const h = harness([{ ok: true }]);
  assert.equal(h.r.onMerge('abc1234', ['scripts/loop/heavy-lock.mjs']), true);
  assert.equal(h.r.draining(), true);
  // Running tickets finish first: no dry run, no exit while one is active.
  assert.equal(h.r.tryRestart(2), 'waiting');
  assert.equal(h.r.tryRestart(1), 'waiting');
  assert.equal(h.dryRuns(), 0);
  assert.deepEqual(h.exits, []);
  assert.equal(h.r.tryRestart(0), 'restarting');
  assert.equal(h.dryRuns(), 1);
  assert.deepEqual(h.exits, [75]);
  assert.equal(RESTART_EXIT, 75);
  assert.ok(h.logs.includes('RESTARTING for loop change abc1234'));
  assert.ok(!h.exits.includes(0));
});

test('AC-EZD-1967-1: scripts/loop.mjs itself is loop code', () => {
  const h = harness([{ ok: true }]);
  assert.equal(h.r.onMerge('def5678', ['app/src/x.ts', 'scripts/loop.mjs']), true);
  h.r.tryRestart(0);
  assert.deepEqual(h.exits, [75]);
  assert.ok(h.logs.includes('RESTARTING for loop change def5678'));
});

test('AC-EZD-1967-4: a merge touching only scripts/loop/__tests__ or app/ does not drain', () => {
  for (const files of [['scripts/loop/__tests__/heavy-lock.test.mjs'], ['scripts/loop/__tests__/fixtures/x.json'], ['app/src/server/db/x.ts'], ['scripts/loop/__tests__/a.test.mjs', 'app/e2e/a.spec.ts']]) {
    const h = harness([{ ok: true }]);
    assert.equal(h.r.onMerge('1111111', files), false, files.join(','));
    assert.equal(h.r.draining(), false);
    assert.equal(h.r.tryRestart(0), 'waiting');
    assert.equal(h.dryRuns(), 0);
    assert.deepEqual(h.exits, []);
  }
});

test('AC-EZD-1967-1: which paths are loop code', () => {
  assert.equal(isLoopFile('scripts/loop.mjs'), true);
  assert.equal(isLoopFile('scripts/loop/lanes.mjs'), true);
  assert.equal(isLoopFile('scripts/loop/__tests__/lanes.test.mjs'), false);
  assert.equal(isLoopFile('scripts/check.mjs'), false);
  assert.equal(isLoopFile('scripts/loopy.mjs'), false);
  assert.equal(isLoopFile('app/scripts/loop/x.mjs'), false);
});

test('AC-EZD-1967-3/4: a failing dry run logs NOT LOADED, does not exit, and is not retried until another loop merge', () => {
  const h = harness([{ ok: false, error: 'SyntaxError: Unexpected token )' }, { ok: true }]);
  h.r.onMerge('aaa1111', ['scripts/loop/heavy-lock.mjs']);
  assert.equal(h.r.tryRestart(0), 'not-loaded');
  assert.deepEqual(h.exits, []);
  assert.ok(h.logs.includes('LOOP CHANGE NOT LOADED: SyntaxError: Unexpected token )'));
  // Keeps building: the drain is over, later passes do not dry-run again.
  assert.equal(h.r.draining(), false);
  h.r.tryRestart(0); h.r.tryRestart(0);
  assert.equal(h.dryRuns(), 1);
  // A merge that does not touch loop files does not try again.
  h.r.onMerge('bbb2222', ['app/src/a.ts']);
  h.r.tryRestart(0);
  assert.equal(h.dryRuns(), 1);
  // Another loop merge does.
  h.r.onMerge('ccc3333', ['scripts/loop/lanes.mjs']);
  assert.equal(h.r.tryRestart(0), 'restarting');
  assert.equal(h.dryRuns(), 2);
  assert.deepEqual(h.exits, [75]);
  assert.ok(h.logs.includes('RESTARTING for loop change ccc3333'));
});

test('AC-EZD-1967-1: the dry run is `node scripts/loop.mjs --plan 1` from the main checkout with a 2-minute limit', () => {
  const calls = [];
  const r = runDryRun({ cwd: '/main/checkout', node: 'node', spawnSync: (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { status: 0, stdout: 'wave 1:\n', stderr: '' }; } });
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'node');
  assert.deepEqual(calls[0].args, ['scripts/loop.mjs', '--plan', '1']);
  assert.equal(calls[0].opts.cwd, '/main/checkout');
  assert.equal(calls[0].opts.timeout, 120000);
  assert.equal(DRY_RUN_TIMEOUT_MS, 120000);
});

test('AC-EZD-1967-3: a failing dry run reports its first error line; a timeout is a failure', () => {
  const stderr = 'file:///repo/scripts/loop/heavy-lock.mjs:12\n  const x = ;\n            ^\n\nSyntaxError: Unexpected token \';\'\n    at compileSourceTextModule (node:internal/modules/esm/utils:340:16)\n';
  const bad = runDryRun({ cwd: '/x', node: 'node', spawnSync: () => ({ status: 1, stdout: '', stderr }) });
  assert.deepEqual(bad, { ok: false, error: "SyntaxError: Unexpected token ';'" });
  const timedOut = runDryRun({ cwd: '/x', node: 'node', spawnSync: () => ({ status: null, signal: 'SIGKILL', stdout: '', stderr: '', error: Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' }) }) });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.error, 'dry run timed out after 2 min');
  assert.equal(firstErrorLine('\n\nonly line\n'), 'only line');
});

test('AC-EZD-1967-1: changedFiles lists the files a merge commit changed', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-1967-'));
  try {
    const g = (args) => { const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); return { ok: r.status === 0, out: (r.stdout || '').trim() }; };
    g(['init', '-q']); g(['config', 'user.email', 't@t']); g(['config', 'user.name', 't']);
    writeFileSync(path.join(dir, 'a.txt'), 'a'); g(['add', '.']); g(['commit', '-q', '-m', 'one']);
    mkdirSync(path.join(dir, 'scripts/loop'), { recursive: true });
    writeFileSync(path.join(dir, 'scripts/loop/heavy-lock.mjs'), 'x'); writeFileSync(path.join(dir, 'a.txt'), 'b');
    g(['add', '.']); g(['commit', '-q', '-m', 'two']);
    const sha = g(['rev-parse', '--short', 'HEAD']).out;
    assert.deepEqual(changedFiles(sha, g).sort(), ['a.txt', 'scripts/loop/heavy-lock.mjs']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AC-EZD-1967-2/3: scripts/loop.mjs wires the restart into the merge, the shared drain and the start line', () => {
  const src = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
  assert.match(src, /SELF\.onMerge\(sha, changedFiles\(sha, git\)\)/);
  assert.match(src, /existsSync\(P\.stop\) \|\| SELF\.draining\(\)/);
  assert.match(src, /loop start at \$\{git\(\['rev-parse', '--short', 'HEAD'\]\)/);
  assert.doesNotMatch(src, /process\.exit\(0\)/);
});
