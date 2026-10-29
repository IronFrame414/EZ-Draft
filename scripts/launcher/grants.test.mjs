// EZD-250 T16-T21, T28, T31, T32: guard grants for the builder reach Josh as one patch before a build (vault/plans/EZD-250.md sections 3 and 4;
// D1-D6, D11). Everything runs under temporary roots with copies of the hook, the grants tool and a stub ledger tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync, cpSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repo, mkTmp, gitInit, git, planText, makeLauncherRoot, runLauncher, readJson, why } from './test-utils/harness.mjs';
import { makeLedgerCopy } from './test-utils/ledger-copy.mjs';

const grantsUrl = pathToFileURL(path.join(repo, 'vault/tools/grants.mjs')).href;
const loadGrants = () => import(grantsUrl);
const q = (p) => `\`${p}\``;

// A root holding the real hook and its helper, as the hook sees a project (D3 asks the real hook).
function hookRoot() {
  const dir = mkTmp('ezd250-hook-');
  mkdirSync(path.join(dir, '.claude/hooks'), { recursive: true });
  for (const f of ['guard-paths.mjs', 'lib.mjs']) copyFileSync(path.join(repo, '.claude/hooks', f), path.join(dir, '.claude/hooks', f));
  return dir;
}
const setGrants = (dir, text) => writeFileSync(path.join(dir, '.claude/hooks/grants.json'), text);

test('EZD-250 T16 plan paths: the Path cells of the Build steps table, once each, in order (AC-EZD-250-4)', async () => {
  const { planPaths } = await loadGrants();
  const text = planText('EZD-990', [q('scripts/run.mjs'), q('app/src/a.ts'), q('scripts/launcher/a.test.mjs'), `${q('vault/tools/x.mjs')} and ${q('vault/tools/y.mjs')}`, q('scripts/run.mjs')]);
  assert.deepEqual(planPaths(text), ['scripts/run.mjs', 'app/src/a.ts', 'scripts/launcher/a.test.mjs', 'vault/tools/x.mjs', 'vault/tools/y.mjs']);
});

test('EZD-250 T17 needs: the plan paths the real hook denies the builder, not test files or granted paths (AC-EZD-250-4)', async () => {
  const { grantNeeds } = await loadGrants();
  const dir = hookRoot();
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/plans/EZD-990.md'), planText('EZD-990', [q('app/src/a.ts'), q('scripts/run.mjs'), q('scripts/launcher/a.test.mjs'), q('vault/tools/next_ticket.mjs')]));
  assert.deepEqual(grantNeeds({ root: dir, id: 'EZD-990' }), ['scripts/run.mjs', 'vault/tools/next_ticket.mjs']);
  setGrants(dir, JSON.stringify({ 'EZD-990': ['scripts/run.mjs', 'vault/tools/next_ticket.mjs'] }));
  assert.deepEqual(grantNeeds({ root: dir, id: 'EZD-990' }), []);
  rmSync(path.join(dir, '.claude/hooks/guard-paths.mjs'));
  assert.deepEqual(grantNeeds({ root: dir, id: 'EZD-990' }), []);
});

test('EZD-250 T18 hook: a grant lets only the builder of that ticket write exactly the listed non-test files (AC-EZD-250-4)', () => {
  const dir = hookRoot();
  const decide = (agent, rel, ticket) => {
    const file = ticket ? path.join(dir, '.claude/worktrees', ticket, rel) : path.join(dir, rel);
    const r = spawnSync(process.execPath, [path.join(dir, '.claude/hooks/guard-paths.mjs')], {
      input: JSON.stringify({ agent_type: agent, tool_input: { file_path: file }, cwd: dir }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      encoding: 'utf8',
    });
    return r.stdout.includes('"deny"') ? 'deny' : 'allow';
  };
  setGrants(dir, JSON.stringify({ 'EZD-990': ['scripts/run.mjs', 'scripts/launcher/a.test.mjs'] }));
  assert.equal(decide('builder', 'scripts/run.mjs', 'EZD-990'), 'allow', 'listed file, own worktree');
  assert.equal(decide('builder', 'scripts/watchdog.mjs', 'EZD-990'), 'deny', 'file not listed');
  assert.equal(decide('builder', 'scripts/launcher/a.test.mjs', 'EZD-990'), 'deny', 'test file');
  assert.equal(decide('builder', 'scripts/run.mjs', 'EZD-991'), 'deny', 'other ticket worktree');
  assert.equal(decide('orchestrator', 'scripts/run.mjs', null), 'deny', 'orchestrator in the main checkout');
  setGrants(dir, '{');
  assert.equal(decide('builder', 'scripts/run.mjs', 'EZD-990'), 'deny', 'invalid JSON grants nothing');
  setGrants(dir, '{}');
  assert.equal(decide('builder', 'scripts/run.mjs', 'EZD-250'), 'deny', 'EZD-250 entry removed');
  assert.equal(decide('builder', 'CLAUDE.md', 'EZD-244'), 'deny', 'EZD-244 entry removed');
  assert.equal(decide('builder', 'scripts/run.mjs', 'EZD-016a'), 'deny', 'a ticket id with a letter suffix');
  // Malformed grants.json (D1, fail closed): not a plain object grants nothing; a bad value grants nothing for its key only.
  for (const text of ['[]', 'null', '{"EZD-990":"scripts/run.mjs"}', '{"EZD-990":["scripts/run.mjs",1]}']) {
    setGrants(dir, text);
    assert.equal(decide('builder', 'scripts/run.mjs', 'EZD-990'), 'deny', `grants.json ${text}`);
  }
  setGrants(dir, '{"EZD-990":["scripts/run.mjs"],"EZD-1":"x"}');
  assert.equal(decide('builder', 'scripts/run.mjs', 'EZD-990'), 'allow', 'a bad value for another key does not void this grant');
});

// The T19 repository (vault/plans/EZD-250.md section 4): a temporary git repo with the real grants tool, the given
// grants.json and a STATUS.md where EZD-001 is done. patch(...paths) runs `grants.mjs patch EZD-990 <paths>`.
const PATCH_REL = 'vault/handoff/EZD-990-grant.patch';
function patchRepo(grantsText) {
  const dir = mkTmp('ezd250-patch-');
  const at = (...p) => path.join(dir, ...p);
  for (const d of ['vault/tools', 'vault/tickets', 'vault/handoff', '.claude/hooks']) mkdirSync(at(d), { recursive: true });
  copyFileSync(path.join(repo, 'vault/tools/grants.mjs'), at('vault/tools/grants.mjs'));
  writeFileSync(at('.claude/hooks/grants.json'), grantsText);
  writeFileSync(at('vault/tickets/STATUS.md'), '| ID | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| EZD-001 | 0 | Done ticket | done | low |  |  |  |  |\n');
  gitInit(dir, ['vault', '.claude']);
  const patch = (...paths) => spawnSync(process.execPath, [at('vault/tools/grants.mjs'), 'patch', 'EZD-990', ...paths], { cwd: dir, encoding: 'utf8' });
  return { dir, at, patch };
}

test('EZD-250 T19 patch: one patch that adds the ticket and drops done tickets, written once, removed once applied (AC-EZD-250-4)', () => {
  const { dir, at, patch } = patchRepo('{\n  "EZD-001": [\n    "x"\n  ]\n}\n');
  const call = () => patch('scripts/run.mjs', 'vault/tools/a.mjs');
  // Call 1: the patch is written.
  const first = call();
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.deepEqual(JSON.parse(first.stdout), { path: PATCH_REL, written: true });
  const bytes1 = readFileSync(at(PATCH_REL));
  // Call 2, before any apply: the same patch, not written again.
  const second = call();
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.deepEqual(JSON.parse(second.stdout), { path: PATCH_REL, written: false });
  assert.deepEqual(readFileSync(at(PATCH_REL)), bytes1, 'patch file changed by call 2');
  // Josh applies it.
  const check = git(dir, 'apply', '--check', PATCH_REL);
  assert.equal(check.status, 0, check.stderr);
  const applied = git(dir, 'apply', PATCH_REL);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(readFileSync(at('.claude/hooks/grants.json'), 'utf8'), '{\n  "EZD-990": [\n    "scripts/run.mjs",\n    "vault/tools/a.mjs"\n  ]\n}\n');
  // Call 3, after the apply: grants.json already holds the grant, so no patch and the old one is removed.
  const third = call();
  assert.equal(third.status, 0, third.stdout + third.stderr);
  assert.deepEqual(JSON.parse(third.stdout), { path: PATCH_REL, written: false });
  assert.equal(existsSync(at(PATCH_REL)), false, 'patch file still present after call 3');
});

// The T20 copy: a vault copy with the real hook, grants.json `{}`, ready EZD-9992 with a plan needing scripts/run.mjs and
// ready EZD-9993 with no plan.
function t20Copy() {
  const l = makeLedgerCopy({ synthetic: [['EZD-9992', 'ready'], ['EZD-9993', 'ready']] });
  for (const f of ['guard-paths.mjs', 'lib.mjs']) {
    mkdirSync(path.join(l.dir, '.claude/hooks'), { recursive: true });
    copyFileSync(path.join(repo, '.claude/hooks', f), path.join(l.dir, '.claude/hooks', f));
  }
  setGrants(l.dir, '{}\n');
  writeFileSync(l.file('plans/EZD-9992.md'), planText('EZD-9992', [q('scripts/run.mjs')]));
  return l;
}

test('EZD-250 T20 next unit: a ticket that needs a grant is held while another builds, and Josh is named when all are held (AC-EZD-250-4)', () => {
  const l = t20Copy();
  const next = () => l.tool('next_ticket.mjs', ['--next-unit']).stdout.trim();
  assert.equal(next(), 'build EZD-9993');
  const needs = l.tool('next_ticket.mjs', ['--grant-needs']);
  assert.deepEqual(JSON.parse(needs.stdout), [{ id: 'EZD-9992', paths: ['scripts/run.mjs'] }]);
  l.setStatus('EZD-9993', 'blocked');
  assert.equal(next(), 'none: waiting on Josh (guard grant for EZD-9992; see vault/handoff/)');
});

test('EZD-250 T21 one notice: one notification when a grant patch is ready, and the build waits for the grant (AC-EZD-250-4)', async () => {
  const HELD = 'none: waiting on Josh (guard grant for EZD-990; see vault/handoff/)';
  const root = makeLauncherRoot({
    copy: ['vault/tools/grants.mjs'],
    stub: {
      next: [{ text: HELD, untilCalls: 3, writes: 'granted' }, { text: 'build EZD-990', until: 'built' }, { text: 'none: budget hold (test)' }],
      grantNeeds: [{ text: JSON.stringify([{ id: 'EZD-990', paths: ['scripts/run.mjs'] }]), until: 'granted' }, { text: '[]' }],
    },
    rules: [{ prompt: '/build-ticket EZD-990', writes: ['built'] }],
  });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.equal(r.notified.length, 1, why(r));
  assert.ok(r.notified[0].startsWith('EZ Draft: guard grant ready for EZD-990'), `${r.notified[0]}\n${why(r)}`);
  assert.deepEqual(r.prompts, ['/build-ticket EZD-990'], why(r));
  assert.ok(r.calls[0].markers.includes('granted'), `the build started before the grant\n${why(r)}`);
  assert.equal(existsSync(root.at('vault/handoff/EZD-990-grant.patch')), false, why(r));
});

test('EZD-250 T28 grants unreadable: a broken grants.json writes no patch, keeps the ticket held and tells Josh once (AC-EZD-250-4)', async () => {
  const cases = [
    ['a', '{', 'grants.json unreadable: invalid JSON'],
    ['b', '[]', 'grants.json unreadable: not an object'],
    ['c', '{"EZD-1":"x"}', 'grants.json unreadable: value of EZD-1 is not a list of paths'],
  ];
  for (const [name, text, line] of cases) {
    const { at, patch } = patchRepo(text);
    const r = patch('scripts/run.mjs');
    assert.equal(r.status, 1, `case (${name}) exit\n${r.stdout}${r.stderr}`);
    assert.equal(r.stderr.trim(), line, `case (${name}) stderr`);
    assert.equal(existsSync(at(PATCH_REL)), false, `case (${name}) patch file written`);
    assert.equal(readFileSync(at('.claude/hooks/grants.json'), 'utf8'), text, `case (${name}) grants.json changed`);
  }

  // The T21 launcher run with grants.json `{`: the held next-unit for 3 calls, then budget hold. As T21 the root is not a
  // git repository (D10a and commits are skipped).
  const HELD = 'none: waiting on Josh (guard grant for EZD-990; see vault/handoff/)';
  const root = makeLauncherRoot({
    copy: ['vault/tools/grants.mjs'],
    stub: {
      next: [{ text: HELD, untilCalls: 3 }, { text: 'none: budget hold (test)' }],
      grantNeeds: [{ text: JSON.stringify([{ id: 'EZD-990', paths: ['scripts/run.mjs'] }]) }],
    },
    rules: [],
  });
  mkdirSync(root.at('.claude/hooks'), { recursive: true });
  setGrants(root.tmp, '{');
  const r = await runLauncher(root);
  // Precondition: the held answer was given 3 times and the grant check ran on each of those passes (D8 step 4), so "once" is tested.
  const counts = readJson(root.at('counts.json')) ?? {};
  assert.ok(counts.next >= 4 && counts.grant >= 3, `stub counts ${JSON.stringify(counts)}\n${why(r)}`);
  assert.deepEqual(r.notified, ['EZ Draft: grant patch for EZD-990 failed: grants.json unreadable: invalid JSON. Tickets that need a guard grant stay held.'], why(r));
  assert.deepEqual(r.prompts.filter((p) => p.startsWith('/build-ticket')), [], why(r));
  assert.equal(existsSync(root.at(PATCH_REL)), false, `patch file written\n${why(r)}`);
});

test('EZD-250 T31 grants from a worktree: a copy inside a worktree gets the same grant needs as the main checkout (AC-EZD-250-4)', () => {
  // Root R is a T20 copy; a second T20 copy sits at R/.claude/worktrees/EZD-250/. In both, plan EZD-9992's Build steps are
  // app/src/a.ts (the builder's own, never a need) and scripts/run.mjs (denied to the builder without a grant).
  const outer = t20Copy();
  const inner = path.join(outer.dir, '.claude/worktrees/EZD-250');
  cpSync(t20Copy().dir, inner, { recursive: true });
  const plan = planText('EZD-9992', [q('app/src/a.ts'), q('scripts/run.mjs')]);
  for (const dir of [outer.dir, inner]) writeFileSync(path.join(dir, 'vault/plans/EZD-9992.md'), plan);
  const needs = (dir) => {
    const r = spawnSync(process.execPath, [path.join(dir, 'vault/tools/next_ticket.mjs'), '--grant-needs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, `${dir}\n${r.stdout}${r.stderr}`);
    return JSON.parse(r.stdout);
  };
  const both = (want, label) => {
    assert.deepEqual(needs(outer.dir), want, `(${label}) main checkout copy R`);
    assert.deepEqual(needs(inner), want, `(${label}) worktree copy R/.claude/worktrees/EZD-250`);
  };
  const want = [{ id: 'EZD-9992', paths: ['scripts/run.mjs'] }];
  // (a) As copied (grants.json `{}`).
  both(want, 'a');
  // (b) A grant only for the outer folder: it would apply only if the outer EZD-250 worktree folder were matched.
  for (const dir of [outer.dir, inner]) setGrants(dir, JSON.stringify({ 'EZD-250': ['.claude/worktrees/EZD-9992/scripts/run.mjs'] }));
  both(want, 'b');
  // (c) The grant for EZD-9992 itself: nothing is needed in either copy.
  for (const dir of [outer.dir, inner]) setGrants(dir, JSON.stringify({ 'EZD-9992': ['scripts/run.mjs'] }));
  both([], 'c');
});

test('EZD-250 T32 grant check unreadable: an unreadable grant check is logged once and changes nothing (AC-EZD-250-4)', async () => {
  // As T21, with an existing patch file; --grant-needs exits 1 with empty stdout, then exits 0 with empty stdout; then the budget hold.
  const HELD = 'none: waiting on Josh (guard grant for EZD-990; see vault/handoff/)';
  const root = makeLauncherRoot({
    copy: ['vault/tools/grants.mjs'],
    stub: {
      next: [{ text: HELD, times: 1 }, { text: 'none: budget hold (test)' }],
      grantNeeds: [{ text: '', exit: 1, times: 1 }, { text: '', exit: 0 }],
    },
    rules: [],
  });
  const patchText = 'existing patch\n';
  writeFileSync(root.at(PATCH_REL), patchText);
  const r = await runLauncher(root);
  // Precondition: both grant check answers were given.
  const counts = readJson(root.at('counts.json')) ?? {};
  assert.ok(counts.grant >= 2, `stub counts ${JSON.stringify(counts)}\n${why(r)}`);
  assert.equal(r.log.split('\n').filter((l) => l.includes('grant check output unreadable')).length, 1, why(r));
  assert.equal(existsSync(root.at(PATCH_REL)), true, `patch file removed\n${why(r)}`);
  assert.deepEqual(r.notified, [], why(r));
});

test('EZD-258 T1 grant check spawn fails: a hook that cannot answer denies every plan path (AC-EZD-258-1)', async () => {
  const { grantNeeds } = await loadGrants();
  const want = ['app/src/a.ts', 'scripts/launcher/a.test.mjs', 'scripts/run.mjs'];
  const dir = hookRoot();
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/plans/EZD-990.md'), planText('EZD-990', [q('app/src/a.ts'), q('scripts/launcher/a.test.mjs'), q('scripts/run.mjs')]));
  const hook = path.join(dir, '.claude/hooks/guard-paths.mjs');
  // (a) The hook is killed by a signal: no exit status (status null).
  writeFileSync(hook, "process.kill(process.pid, 'SIGKILL');\n");
  assert.deepEqual(grantNeeds({ root: dir, id: 'EZD-990' }), want, '(a) hook killed by a signal');
  // (b) The hook cannot start: the spawn fails with ENOENT, because the child's execPath does not exist.
  writeFileSync(hook, 'process.exit(3);\n');
  const script = [
    `process.execPath = ${JSON.stringify('/nonexistent/ezd258-node')};`,
    `const { grantNeeds } = await import(${JSON.stringify(grantsUrl)});`,
    `console.log(JSON.stringify(grantNeeds({ root: ${JSON.stringify(dir)}, id: 'EZD-990' })));`,
    '',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(child.status, 0, `(b) child\n${child.stdout}${child.stderr}`);
  assert.deepEqual(JSON.parse(child.stdout), want, '(b) spawn error');
  // (c) Control: the same hook (exit 3, empty stdout) answers in-process, so every path is allowed and none is a need.
  assert.deepEqual(grantNeeds({ root: dir, id: 'EZD-990' }), [], '(c) hook exits 3 with no output');
});

test('EZD-258 T2 patch diff fails: git diff exit above 1 writes nothing and exits 1 (AC-EZD-258-1)', () => {
  const shims = [
    ['a', ['echo "fatal: shim error" >&2', 'echo "second line" >&2', 'exit 2'], 'git diff failed: fatal: shim error'],
    ['b', ['exit 3'], 'git diff failed: exit 3'],
  ];
  for (const [name, body, line] of shims) {
    const { dir, at } = patchRepo('{}\n');
    const shimDir = mkTmp('ezd258-shim-');
    writeFileSync(path.join(shimDir, 'git'), ['#!/bin/sh', ...body, ''].join('\n'));
    chmodSync(path.join(shimDir, 'git'), 0o755);
    const r = spawnSync(process.execPath, [at('vault/tools/grants.mjs'), 'patch', 'EZD-990', 'scripts/run.mjs'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: shimDir + path.delimiter + process.env.PATH },
    });
    assert.equal(r.status, 1, `(${name}) exit\n${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, '', `(${name}) stdout`);
    assert.equal(r.stderr.trim(), line, `(${name}) stderr`);
    assert.equal(existsSync(at(PATCH_REL)), false, `(${name}) patch file written`);
    assert.equal(readFileSync(at('.claude/hooks/grants.json'), 'utf8'), '{}\n', `(${name}) grants.json changed`);
  }
});
