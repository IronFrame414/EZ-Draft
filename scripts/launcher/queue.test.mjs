// EZD-250 T9-T13, T29: interactive ledger edits are queued on a branch and applied between units (vault/plans/EZD-250.md sections 3 and 4;
// D10, D10a). Everything runs in temporary git repositories on `develop` with a stub ledger tool; never the real repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repo, mkTmp, STUB_NT, gitInit, git, makeLauncherRoot, runLauncher, why } from './test-utils/harness.mjs';

const STATUS = '# Status\n\nline one\nline two\nline three\n';

// A git repository on develop holding the real ledger-queue.mjs, the stub ledger tool and a small STATUS.md.
function makeQueueRepo() {
  const dir = mkTmp('ezd250-queue-');
  const at = (...p) => path.join(dir, ...p);
  mkdirSync(at('vault/tools'), { recursive: true });
  mkdirSync(at('vault/tickets'), { recursive: true });
  copyFileSync(path.join(repo, 'vault/tools/ledger-queue.mjs'), at('vault/tools/ledger-queue.mjs'));
  writeFileSync(at('vault/tools/next_ticket.mjs'), STUB_NT);
  writeFileSync(at('vault/tools/stub-config.json'), JSON.stringify({ check: { failIfStatusContains: 'BAD' } }));
  writeFileSync(at('vault/tickets/STATUS.md'), STATUS);
  gitInit(dir, ['vault']);
  return { dir, at };
}
const cli = (q, ...args) => spawnSync(process.execPath, [q.at('vault/tools/ledger-queue.mjs'), ...args], { cwd: q.dir, encoding: 'utf8' });
const out = (r) => `${r.stdout}${r.stderr}`;
const head = (q) => git(q.dir, 'rev-parse', 'HEAD').stdout.trim();
const branchTip = (q, b) => git(q.dir, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`).stdout.trim();
const apply = async (q) => (await import(pathToFileURL(q.at('vault/tools/ledger-queue.mjs')).href)).applyQueue({ root: q.dir });

// `start <slug>`: returns the queue name and its worktree.
function start(q, slug) {
  const r = cli(q, 'start', slug);
  assert.equal(r.status, 0, out(r));
  const m = /QUEUE WORKTREE \.claude\/worktrees\/queue-(\S+)/.exec(r.stdout);
  assert.ok(m, `no QUEUE WORKTREE line\n${out(r)}`);
  return { name: m[1], wt: q.at('.claude/worktrees', `queue-${m[1]}`) };
}
// start, change one STATUS.md line, submit.
function queueEdit(q, slug, newLine) {
  const { name, wt } = start(q, slug);
  const f = path.join(wt, 'vault/tickets/STATUS.md');
  writeFileSync(f, readFileSync(f, 'utf8').replace('line two', newLine));
  const s = cli(q, 'submit', name, '-m', `queue ${slug}`);
  assert.equal(s.status, 0, out(s));
  return name;
}

test('EZD-250 T9 between units: a queued ledger edit is applied before the next unit, with no pause (AC-EZD-250-2)', async () => {
  const root = makeLauncherRoot({
    copy: ['vault/tools/ledger-queue.mjs'],
    stub: {
      next: [{ text: 'build EZD-901', until: 'built-901' }, { text: 'build EZD-902', until: 'built-902' }, { text: 'none: budget hold (test)' }],
    },
    rules: [
      { prompt: '/build-ticket EZD-901', writes: ['built-901'], script: 'fake-901.cjs' },
      { prompt: '/build-ticket EZD-902', writes: ['built-902'], script: 'fake-902.cjs' },
    ],
  });
  // The unit EZD-901 does what an interactive session does: start, edit STATUS.md in the queue worktree, submit.
  writeFileSync(
    root.at('fake-901.cjs'),
    [
      "const { spawnSync } = require('child_process');",
      "const fs = require('fs');",
      "const path = require('path');",
      'const root = process.env.FAKE_ROOT;',
      "const tool = path.join(root, 'vault/tools/ledger-queue.mjs');",
      "const run = (...a) => spawnSync(process.execPath, [tool, ...a], { cwd: root, encoding: 'utf8' });",
      "const name = /queue-(\\S+)/.exec(run('start', 't1').stdout)[1];",
      "fs.appendFileSync(path.join(root, '.claude/worktrees', 'queue-' + name, 'vault/tickets/STATUS.md'), 'queued line\\n');",
      "run('submit', name, '-m', 'queue test');",
      '',
    ].join('\n'),
  );
  // The unit EZD-902 records the subject of the commit it starts on.
  writeFileSync(
    root.at('fake-902.cjs'),
    [
      "const { spawnSync } = require('child_process');",
      "const fs = require('fs');",
      "const path = require('path');",
      'const root = process.env.FAKE_ROOT;',
      "fs.writeFileSync(path.join(root, 'subject-at-902.txt'), spawnSync('git', ['-C', root, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).stdout);",
      '',
    ].join('\n'),
  );
  const r = await runLauncher(root, { timeout: 60000 });
  assert.equal(r.status, 0, why(r));
  assert.ok(r.ms < 60000, why(r));
  assert.deepEqual(r.prompts, ['/build-ticket EZD-901', '/build-ticket EZD-902'], why(r));
  assert.equal(readFileSync(root.at('subject-at-902.txt'), 'utf8').trim(), 'queue test', why(r));
  assert.equal(git(root.tmp, 'branch', '--list', 'queue/*').stdout.trim(), '', why(r));
  assert.equal(existsSync(root.at('vault/handoff/STOP')), false, why(r));
});

test('EZD-250 T10 refuse: a change outside the ledger files is refused and nothing is committed (AC-EZD-250-2)', () => {
  const q = makeQueueRepo();
  const { name, wt } = start(q, 'refuse');
  mkdirSync(path.join(wt, 'scripts'), { recursive: true });
  writeFileSync(path.join(wt, 'scripts/x.mjs'), 'export {};\n');
  const r = cli(q, 'submit', name, '-m', 'refuse test');
  assert.equal(r.status, 1, out(r));
  assert.ok(out(r).includes(`QUEUE REFUSED ${name}: scripts/x.mjs is not a ledger file`), out(r));
  assert.equal(branchTip(q, `queue/${name}`), head(q), 'the queue branch got a commit');
});

test('EZD-250 T11 conflict: an edit that conflicts with develop is rejected and kept on queue-rejected/ (AC-EZD-250-2)', async () => {
  const q = makeQueueRepo();
  const name = queueEdit(q, 'conflict', 'line two queued');
  const f = q.at('vault/tickets/STATUS.md');
  writeFileSync(f, readFileSync(f, 'utf8').replace('line two', 'line two develop'));
  assert.equal(git(q.dir, 'commit', '-q', '-am', 'develop edit').status, 0);
  const before = head(q);
  const r = await apply(q);
  assert.deepEqual(r.rejected, [{ name, reason: 'conflicts with develop' }]);
  assert.deepEqual(r.applied, []);
  assert.equal(head(q), before);
  assert.notEqual(branchTip(q, `queue-rejected/${name}`), '', 'queue-rejected branch missing');
});

test('EZD-250 T12 check fails: an edit that breaks the ledger check is rejected and develop is untouched (AC-EZD-250-2)', async () => {
  const q = makeQueueRepo();
  // A branch commit made with git, past the CLI's own check.
  const wt = q.at('.claude/worktrees/w');
  assert.equal(git(q.dir, 'worktree', 'add', '-q', '-b', 'queue/bad', wt, 'develop').status, 0);
  appendFileSync(path.join(wt, 'vault/tickets/STATUS.md'), 'BAD\n');
  assert.equal(git(wt, 'commit', '-q', '-am', 'bad edit').status, 0);
  assert.equal(git(q.dir, 'worktree', 'remove', '--force', wt).status, 0);
  const before = head(q);
  const r = await apply(q);
  assert.equal(r.rejected.length, 1, JSON.stringify(r));
  assert.equal(r.rejected[0].name, 'bad');
  assert.ok(r.rejected[0].reason.startsWith('ledger check failed'), r.rejected[0].reason);
  assert.equal(head(q), before);
});

test('EZD-250 T13 deferred: nothing is applied with uncommitted vault changes or off develop (AC-EZD-250-2)', async () => {
  const q = makeQueueRepo();
  const name = queueEdit(q, 'defer', 'line two queued');
  const tip = branchTip(q, `queue/${name}`);
  const before = head(q);

  writeFileSync(q.at('vault/x.md'), 'uncommitted\n');
  const a = await apply(q);
  assert.equal(a.deferred, 'vault has uncommitted changes');
  assert.deepEqual(a.applied, []);
  assert.equal(branchTip(q, `queue/${name}`), tip);
  assert.equal(head(q), before);
  rmSync(q.at('vault/x.md'));

  assert.equal(git(q.dir, 'checkout', '-q', '-b', 'other').status, 0);
  const b = await apply(q);
  assert.equal(b.deferred, 'not on develop');
  assert.deepEqual(b.applied, []);
  assert.equal(branchTip(q, `queue/${name}`), tip);
  assert.equal(git(q.dir, 'rev-parse', 'refs/heads/develop').stdout.trim(), before);
});

test('EZD-250 T29 queue apply fails: the failure is logged and sent once, and the build goes on (AC-EZD-250-2)', async () => {
  const root = makeLauncherRoot({
    stub: { next: [{ text: 'build EZD-901', until: 'built' }, { text: 'none: budget hold (test)' }] },
    rules: [{ prompt: '/build-ticket EZD-901', writes: ['built'] }],
  });
  // A ledger-queue.mjs that always fails: `boom` on stderr, exit 1. Each call is recorded so the test knows the apply was retried.
  writeFileSync(
    root.at('vault/tools/ledger-queue.mjs'),
    [
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync(new URL('../../queue-calls.txt', import.meta.url), process.argv.slice(2).join(' ') + '\\n');",
      "process.stderr.write('boom\\n');",
      'process.exit(1);',
      '',
    ].join('\n'),
  );
  assert.equal(git(root.tmp, 'add', '--', 'vault').status, 0);
  assert.equal(git(root.tmp, 'commit', '-q', '-m', 'failing queue tool').status, 0);
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  // Precondition: the apply ran on more than one pass, so "exactly 1" below is tested.
  const calls = existsSync(root.at('queue-calls.txt')) ? readFileSync(root.at('queue-calls.txt'), 'utf8').split('\n').filter(Boolean) : [];
  assert.ok(calls.length >= 2, `ledger-queue.mjs calls ${JSON.stringify(calls)}\n${why(r)}`);
  assert.equal(r.log.split('\n').filter((l) => l.includes('queue apply failed: boom')).length, 1, why(r));
  assert.deepEqual(r.notified, ['EZ Draft: queued ledger edits not applied: boom. They stay on their queue/ branches; the launcher retries each pass.'], why(r));
  assert.equal(r.prompts.filter((p) => p === '/build-ticket EZD-901').length, 1, why(r));
});
