// EZD-250 T16-T21, T28, T31, T32: guard grants for the builder reach Josh as one patch before a build (vault/plans/EZD-250.md sections 3 and 4;
// D1-D6, D11). Everything runs under temporary roots with copies of the hook, the grants tool and a stub ledger tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync, cpSync, chmodSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repo, mkTmp, gitInit, git, planText, approvedPlanText, makeLauncherRoot, runLauncher, readJson, why } from './test-utils/harness.mjs';
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
  for (const f of ['grants.mjs', 'plan_lint.mjs', 'outline.mjs']) copyFileSync(path.join(repo, 'vault/tools', f), at('vault/tools', f));
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

// The T20 copy: a vault copy with the real hook, grants.json `{}`, ready EZD-9992 with a product plan (app/src/a.ts) that needs
// scripts/run.mjs and ready EZD-9993 with no plan.
function t20Copy() {
  const l = makeLedgerCopy({ synthetic: [['EZD-9992', 'ready'], ['EZD-9993', 'ready']] });
  for (const f of ['guard-paths.mjs', 'lib.mjs']) {
    mkdirSync(path.join(l.dir, '.claude/hooks'), { recursive: true });
    copyFileSync(path.join(repo, '.claude/hooks', f), path.join(l.dir, '.claude/hooks', f));
  }
  setGrants(l.dir, '{}\n');
  writeFileSync(l.file('plans/EZD-9992.md'), planText('EZD-9992', [q('app/src/a.ts'), q('scripts/run.mjs')]));
  return l;
}

test('EZD-250 T20 next unit: a ticket that needs a grant is held while another builds, and Josh is named when all are held (AC-EZD-250-4)', () => {
  const l = t20Copy();
  const next = () => l.tool('next_ticket.mjs', ['--next-unit']).stdout.trim();
  assert.equal(next(), 'build EZD-9993');
  const needs = l.tool('next_ticket.mjs', ['--grant-needs']);
  assert.deepEqual(JSON.parse(needs.stdout), [{ id: 'EZD-9992', paths: ['scripts/run.mjs'] }]);
  l.setStatus('EZD-9993', 'blocked');
  assert.equal(next(), 'none: waiting on Josh (guard grant for EZD-9992: scripts/run.mjs; see vault/handoff/)');
});

test('EZD-267 L2 plan not approved: Josh gets one notice naming the paths and the reason, one patch, and no build (AC-EZD-267-2)', async () => {
  const root = grantLauncher({ question: true, patch: false, next: [{ text: HELD_90, untilCalls: 3 }, { text: 'none: budget hold (test)' }], grantNeeds: [{ text: NEEDS_90 }] });
  const r = await runLauncher(root);
  const counts = readJson(root.at('counts.json')) ?? {};
  assert.ok(counts.next >= 4 && counts.grant >= 3, `stub counts ${JSON.stringify(counts)}\n${why(r)}`);
  assert.deepEqual(r.notified, ['EZ Draft: guard grant for EZD-990 needs you: scripts/run.mjs (plan_lint: section 10: open questions remain: QP-1); from the repo root run git apply vault/handoff/EZD-990-grant.patch && git commit -m "chore(guard): grant EZD-990" -- .claude/hooks/grants.json'], why(r));
  assert.equal(existsSync(root.at(PATCH_REL)), true, `patch file missing\n${why(r)}`);
  assert.equal(readFileSync(root.at('.claude/hooks/grants.json'), 'utf8'), '{}\n');
  assert.deepEqual(commitsOf(root.tmp).filter((c) => c.subject.startsWith('chore(guard)')), []);
  assert.deepEqual(r.prompts.filter((p) => p.startsWith('/build-ticket')), [], why(r));
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

  // EZD-267 L3 (the T28 launcher part, rewritten): the launcher applies the grant of an approved plan, grants.json is `{`.
  const root = grantLauncher({ grantsText: '{', next: [{ text: HELD_90, untilCalls: 3 }, { text: 'none: budget hold (test)' }], grantNeeds: [{ text: NEEDS_90 }] });
  const r = await runLauncher(root);
  // Precondition: the held answer was given 3 times and the grant check ran on each of those passes, so "once" is tested.
  const counts = readJson(root.at('counts.json')) ?? {};
  assert.ok(counts.next >= 4 && counts.grant >= 3, `stub counts ${JSON.stringify(counts)}\n${why(r)}`);
  assert.deepEqual(r.notified, ['EZ Draft: guard grant for EZD-990 failed: grants.json unreadable: invalid JSON. Tickets that need a guard grant stay held.'], why(r));
  assert.equal(readFileSync(root.at('.claude/hooks/grants.json'), 'utf8'), '{');
  assert.equal(existsSync(root.at(PATCH_REL)), false, `patch file written\n${why(r)}`);
  assert.deepEqual(r.prompts.filter((p) => p.startsWith('/build-ticket')), [], why(r));
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

// ---- EZD-267: the launcher applies the grant of an approved plan (vault/plans/EZD-267.md sections 3 and 4) ----
const ledgerUrl = pathToFileURL(path.join(repo, 'scripts/ledger.mjs')).href;
const PLAN_90 = ['app/src/a.ts', 'scripts/run.mjs', 'vault/tools/a.mjs'];
const USAGE = 'usage: node vault/tools/grants.mjs needs <T> | patch <T> <path>... | apply <T> | drop <T>';
const HELD_90 = 'none: waiting on Josh (guard grant for EZD-990: scripts/run.mjs; see vault/handoff/)';
const NEEDS_90 = JSON.stringify([{ id: 'EZD-990', paths: ['scripts/run.mjs'] }]);
const GRANT_COPY = ['vault/tools/grants.mjs', 'vault/tools/plan_lint.mjs', 'vault/tools/outline.mjs', '.claude/hooks/guard-paths.mjs', '.claude/hooks/lib.mjs'];
const STATUS_HEAD = '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
const statusTable = (rows) => STATUS_HEAD + rows.map(([id, st]) => `| ${id} | 1 | Fixture ${id} | ${st} | low |  |  |  |  |\n`).join('');
const GRANTS_FILE = '.claude/hooks/grants.json';

// The "hook root" of the plan's section 4: the T18 hookRoot plus the three tools, a STATUS table and the plan of EZD-990.
// status: the status of EZD-990 (null = no row); plan: undefined = the approved plan, null = none, or the text; grantsText: undefined = no file.
function approvedRoot({ status = 'ready', plan, grantsText } = {}) {
  const dir = hookRoot();
  for (const f of ['grants.mjs', 'plan_lint.mjs', 'outline.mjs']) {
    mkdirSync(path.join(dir, 'vault/tools'), { recursive: true });
    copyFileSync(path.join(repo, 'vault/tools', f), path.join(dir, 'vault/tools', f));
  }
  mkdirSync(path.join(dir, 'vault/tickets'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/tickets/STATUS.md'), statusTable([['EZD-001', 'done'], ['EZD-002', 'blocked'], ...(status === null ? [] : [['EZD-990', status]])]));
  if (plan !== null) {
    mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
    writeFileSync(path.join(dir, 'vault/plans/EZD-990.md'), plan ?? approvedPlanText('EZD-990', PLAN_90));
  }
  if (grantsText !== undefined) setGrants(dir, grantsText);
  return dir;
}
const cli = (dir, ...args) => spawnSync(process.execPath, [path.join(dir, 'vault/tools/grants.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
const grantsOf = (dir) => readFileSync(path.join(dir, GRANTS_FILE), 'utf8');
const OTHER_Y = '{"EZD-002":["y"]}';
const OTHER_Y_OLD = '{"EZD-001":["x"],"EZD-002":["y"]}';
const SORTED = (obj) => JSON.stringify(obj, null, 2) + '\n';

// Commits of a repo, newest first, with the files each touched.
function commitsOf(dir) {
  const out = git(dir, 'log', '--name-only', '--format=@@%s').stdout;
  return out.split('@@').slice(1).map((chunk) => {
    const [subject, ...files] = chunk.split('\n');
    return { subject, files: files.filter(Boolean) };
  });
}

// A launcher root whose ticket EZD-990 has an approved plan naming scripts/run.mjs; fixture files are committed so a grant commit
// can be told from the fixture. patch: a committed patch file for EZD-990. grantsTool: replacement text for the root's grants.mjs.
function grantLauncher({ status = 'ready', question = false, grantsText = '{}\n', patch = false, next, grantNeeds, grantsTool = null }) {
  const root = makeLauncherRoot({ copy: GRANT_COPY, stub: { next, grantNeeds }, rules: [{ prompt: '/build-ticket EZD-990', writes: ['built'] }] });
  writeFileSync(root.at('vault/tickets/STATUS.md'), statusTable([['EZD-001', 'done'], ['EZD-990', status]]));
  mkdirSync(root.at('vault/plans'), { recursive: true });
  writeFileSync(root.at('vault/plans/EZD-990.md'), approvedPlanText('EZD-990', ['scripts/run.mjs'], { question }));
  writeFileSync(root.at(GRANTS_FILE), grantsText);
  if (patch) writeFileSync(root.at(PATCH_REL), 'old grant patch\n');
  if (grantsTool !== null) writeFileSync(root.at('vault/tools/grants.mjs'), grantsTool);
  assert.equal(git(root.tmp, 'add', '--', '.claude', 'vault').status, 0);
  assert.equal(git(root.tmp, 'commit', '-q', '-m', 'fixture grants').status, 0);
  return root;
}

test('EZD-267 H1 fixture: approvedPlanText passes the strict lint, and with a question reports exactly it (AC-EZD-267-1, AC-EZD-267-2)', async () => {
  const { lintPlan } = await import(pathToFileURL(path.join(repo, 'vault/tools/plan_lint.mjs')).href);
  assert.deepEqual(lintPlan(approvedPlanText('EZD-990', ['scripts/run.mjs'])), []);
  assert.deepEqual(lintPlan(approvedPlanText('EZD-990', ['scripts/run.mjs'], { question: true })), ['section 10: open questions remain: QP-1']);
});

test('EZD-267 G1 approval: only ready, in-progress and review with a lint-clean plan are approved (AC-EZD-267-1, AC-EZD-267-2)', async () => {
  const { planApproval, APPROVED_STATUSES } = await loadGrants();
  assert.deepEqual(APPROVED_STATUSES, ['ready', 'in-progress', 'review']);
  for (const st of ['ready', 'in-progress', 'review']) {
    assert.deepEqual(planApproval({ root: approvedRoot({ status: st }), id: 'EZD-990' }), { approved: true, reason: null }, st);
  }
  for (const st of ['todo', 'planned', 'questions', 'blocked', 'done']) {
    assert.deepEqual(planApproval({ root: approvedRoot({ status: st }), id: 'EZD-990' }), { approved: false, reason: `status ${st}` }, st);
  }
  assert.deepEqual(planApproval({ root: approvedRoot({ status: null }), id: 'EZD-990' }), { approved: false, reason: 'status none' });
  assert.deepEqual(planApproval({ root: approvedRoot({ plan: null }), id: 'EZD-990' }), { approved: false, reason: 'no plan' });
  const withQuestion = approvedRoot({ plan: approvedPlanText('EZD-990', PLAN_90, { question: true }) });
  assert.deepEqual(planApproval({ root: withQuestion, id: 'EZD-990' }), { approved: false, reason: 'plan_lint: section 10: open questions remain: QP-1' });
});

test('EZD-267 G2 apply approved: the grant for the plan needs is written once, sorted, and needs is empty after (AC-EZD-267-1)', () => {
  const dir = approvedRoot({ grantsText: '{"EZD-001":["x"],"EZD-002":["y"]}' });
  const first = cli(dir, 'apply', 'EZD-990');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(first.stdout, '{"id":"EZD-990","approved":true,"paths":["scripts/run.mjs","vault/tools/a.mjs"],"written":true,"reason":null}\n');
  const text = '{\n  "EZD-002": [\n    "y"\n  ],\n  "EZD-990": [\n    "scripts/run.mjs",\n    "vault/tools/a.mjs"\n  ]\n}\n';
  assert.equal(grantsOf(dir), text);
  const second = cli(dir, 'apply', 'EZD-990');
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.equal(second.stdout, '{"id":"EZD-990","approved":true,"paths":[],"written":false,"reason":null}\n');
  assert.equal(grantsOf(dir), text);
  const needs = cli(dir, 'needs', 'EZD-990');
  assert.equal(needs.status, 0, needs.stderr);
  assert.equal(needs.stdout, '');
});

test('EZD-267 G3 entry exact: an old path the plan no longer names is dropped, a kept one stays (AC-EZD-267-1)', () => {
  const dir = approvedRoot({ grantsText: '{"EZD-990":["scripts/old.mjs","scripts/run.mjs"]}' });
  const r = cli(dir, 'apply', 'EZD-990');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(grantsOf(dir)), { 'EZD-990': ['scripts/run.mjs', 'vault/tools/a.mjs'] });
});

test('EZD-267 G4 apply not approved: nothing is written and the reason is reported (AC-EZD-267-2)', () => {
  const paths = '["scripts/run.mjs","vault/tools/a.mjs"]';
  const cases = [
    ['a', { plan: approvedPlanText('EZD-990', PLAN_90, { question: true }) }, 'plan_lint: section 10: open questions remain: QP-1'],
    ['b', { status: 'planned' }, 'status planned'],
  ];
  for (const [name, opts, reason] of cases) {
    const dir = approvedRoot({ ...opts, grantsText: '{}\n' });
    const r = cli(dir, 'apply', 'EZD-990');
    assert.equal(r.status, 0, `(${name}) ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, `{"id":"EZD-990","approved":false,"paths":${paths},"written":false,"reason":${JSON.stringify(reason)}}\n`, name);
    assert.equal(grantsOf(dir), '{}\n', `(${name}) grants.json changed`);
  }
});

test('EZD-267 G5 apply and drop failures: unreadable grants.json exits 1 and changes nothing; bad arguments print the usage line (AC-EZD-267-1, AC-EZD-267-3)', () => {
  const cases = [
    ['{', 'grants.json unreadable: invalid JSON'],
    ['[]', 'grants.json unreadable: not an object'],
    ['{"EZD-1":"x"}', 'grants.json unreadable: value of EZD-1 is not a list of paths'],
  ];
  for (const [text, line] of cases) {
    for (const cmd of ['apply', 'drop']) {
      const dir = approvedRoot({ grantsText: text });
      const r = cli(dir, cmd, 'EZD-990');
      assert.equal(r.status, 1, `${cmd} ${text}\n${r.stdout}${r.stderr}`);
      assert.equal(r.stderr.trim(), line, `${cmd} ${text} stderr`);
      assert.equal(grantsOf(dir), text, `${cmd} ${text} grants.json changed`);
    }
  }
  const dir = approvedRoot({ grantsText: '{}\n' });
  for (const args of [['apply'], ['apply', 'bad'], ['apply', 'EZD-990', 'x'], ['drop'], ['drop', 'EZD-990', 'x']]) {
    const r = cli(dir, ...args);
    assert.equal(r.status, 2, `${args.join(' ')}\n${r.stdout}${r.stderr}`);
    assert.equal(r.stderr.trim(), USAGE, args.join(' '));
  }
});

test('EZD-267 G6 no temp left: the hooks folder holds only grants.json and the two hook files after apply and drop (AC-EZD-267-1)', () => {
  const dir = approvedRoot({ grantsText: '{"EZD-002":["y"]}' });
  const first = cli(dir, 'apply', 'EZD-990');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const dropped = cli(dir, 'drop', 'EZD-990');
  assert.equal(dropped.status, 0, dropped.stdout + dropped.stderr);
  assert.deepEqual(readdirSync(path.join(dir, '.claude/hooks')).sort(), ['grants.json', 'guard-paths.mjs', 'lib.mjs']);
});

test('EZD-267 G8 write error: a folder that cannot be written fails with EACCES, changes nothing and leaves no temp (AC-EZD-267-1, AC-EZD-267-3)', { skip: process.getuid?.() === 0 }, () => {
  const text = '{"EZD-002":["y"]}';
  const dir = approvedRoot({ grantsText: text });
  const hooks = path.join(dir, '.claude/hooks');
  chmodSync(hooks, 0o555);
  try {
    for (const args of [['apply', 'EZD-990'], ['drop', 'EZD-002']]) {
      const r = cli(dir, ...args);
      assert.equal(r.status, 1, `${args.join(' ')}\n${r.stdout}${r.stderr}`);
      assert.equal(r.stderr.trim(), 'grants.json not written: EACCES', args.join(' '));
      assert.equal(grantsOf(dir), text, `${args.join(' ')} grants.json changed`);
      assert.deepEqual(readdirSync(hooks).filter((n) => /^\.grants\.json\..*\.tmp$/.test(n)), [], `${args.join(' ')} temp left`);
    }
  } finally {
    chmodSync(hooks, 0o755);
  }
});

test('EZD-267 G9 josh-only: a plan naming a path only Josh may grant is not approved and nothing is written (AC-EZD-267-1, AC-EZD-267-2)', async () => {
  const cases = [
    ['a', ['app/src/a.ts', 'scripts/run.mjs', 'scripts/gate.mjs'], ['scripts/run.mjs', 'scripts/gate.mjs'], 'scripts/gate.mjs'],
    ['b', ['.claude/hooks/grants.json'], ['.claude/hooks/grants.json'], '.claude/hooks/grants.json'],
    ['c', ['scripts/./gate.mjs'], ['scripts/./gate.mjs'], 'scripts/./gate.mjs'],
  ];
  for (const [name, plan, paths, bad] of cases) {
    const dir = approvedRoot({ plan: approvedPlanText('EZD-990', plan), grantsText: '{}\n' });
    const r = cli(dir, 'apply', 'EZD-990');
    assert.equal(r.status, 0, `(${name}) ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, `{"id":"EZD-990","approved":false,"paths":${JSON.stringify(paths)},"written":false,"reason":${JSON.stringify(`josh-only path ${bad}`)}}\n`, name);
    assert.equal(grantsOf(dir), '{}\n', `(${name}) grants.json changed`);
  }
  const { JOSH_ONLY_PATHS, joshOnlyPath } = await loadGrants();
  assert.deepEqual(JOSH_ONLY_PATHS, ['.claude/hooks/grants.json', 'scripts/gate.mjs']);
  assert.equal(joshOnlyPath(['app/a.ts', 'Scripts//GATE.mjs']), 'Scripts//GATE.mjs');
  assert.equal(joshOnlyPath(['scripts/run.mjs']), null);
});

test('EZD-267 G7 drop: the ticket key is removed once, a missing key or file changes nothing (AC-EZD-267-3)', () => {
  const dir = approvedRoot({ grantsText: '{"EZD-002":["y"],"EZD-990":["scripts/run.mjs"]}' });
  const first = cli(dir, 'drop', 'EZD-990');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(first.stdout, '{"removed":true}\n');
  const left = '{\n  "EZD-002": [\n    "y"\n  ]\n}\n';
  assert.equal(grantsOf(dir), left);
  const second = cli(dir, 'drop', 'EZD-990');
  assert.equal(second.stdout, '{"removed":false}\n');
  assert.equal(grantsOf(dir), left);
  const absent = approvedRoot();
  const third = cli(absent, 'drop', 'EZD-990');
  assert.equal(third.status, 0, third.stdout + third.stderr);
  assert.equal(third.stdout, '{"removed":false}\n');
  assert.equal(existsSync(path.join(absent, GRANTS_FILE)), false);
});

test('EZD-267 N1 needs in flight: a ready pool ticket and an in-progress ticket are both listed, pool first (AC-EZD-267-1)', () => {
  const l = makeLedgerCopy({ synthetic: [['EZD-9992', 'ready'], ['EZD-9994', 'in-progress']] });
  for (const f of ['guard-paths.mjs', 'lib.mjs']) {
    mkdirSync(path.join(l.dir, '.claude/hooks'), { recursive: true });
    copyFileSync(path.join(repo, '.claude/hooks', f), path.join(l.dir, '.claude/hooks', f));
  }
  setGrants(l.dir, '{}\n');
  writeFileSync(l.file('plans/EZD-9992.md'), planText('EZD-9992', [q('scripts/run.mjs')]));
  writeFileSync(l.file('plans/EZD-9994.md'), planText('EZD-9994', [q('scripts/ledger.mjs')]));
  const needs = l.tool('next_ticket.mjs', ['--grant-needs']);
  assert.equal(needs.status, 0, needs.stdout + needs.stderr);
  assert.deepEqual(JSON.parse(needs.stdout), [{ id: 'EZD-9992', paths: ['scripts/run.mjs'] }, { id: 'EZD-9994', paths: ['scripts/ledger.mjs'] }]);
});

test('EZD-267 N2 hold names paths: the held next-unit text lists the files (AC-EZD-267-2)', () => {
  const l = t20Copy();
  l.setStatus('EZD-9993', 'blocked');
  writeFileSync(l.file('plans/EZD-9992.md'), planText('EZD-9992', [q('app/src/a.ts'), q('scripts/run.mjs'), q('vault/tools/a.mjs')]));
  assert.equal(l.tool('next_ticket.mjs', ['--next-unit']).stdout.trim(), 'none: waiting on Josh (guard grant for EZD-9992: scripts/run.mjs, vault/tools/a.mjs; see vault/handoff/)');
});

test('EZD-267 N3 build after apply: once the launcher tool has granted the approved plan, the ticket builds (AC-EZD-267-1)', () => {
  const l = t20Copy();
  l.setStatus('EZD-9993', 'blocked');
  writeFileSync(l.file('plans/EZD-9992.md'), approvedPlanText('EZD-9992', ['app/src/a.ts', 'scripts/run.mjs']));
  const applied = l.tool('grants.mjs', ['apply', 'EZD-9992']);
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  assert.equal(JSON.parse(applied.stdout).approved, true, applied.stdout);
  assert.equal(l.tool('next_ticket.mjs', ['--next-unit']).stdout.trim(), 'build EZD-9992');
});

test('EZD-267 L1 launcher grants: an approved plan is granted and committed before the build, the old patch is removed (AC-EZD-267-1)', async () => {
  const root = grantLauncher({ patch: true, next: [{ text: 'build EZD-990', until: 'built' }, { text: 'none: budget hold (test)' }], grantNeeds: [{ text: NEEDS_90, times: 1 }, { text: '[]' }] });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.notified, [], why(r));
  assert.deepEqual(r.prompts, ['/build-ticket EZD-990'], why(r));
  assert.equal(readFileSync(root.at(GRANTS_FILE), 'utf8'), SORTED({ 'EZD-990': ['scripts/run.mjs'] }));
  const guard = commitsOf(root.tmp).filter((c) => c.subject.startsWith('chore(guard)'));
  assert.deepEqual(guard, [{ subject: 'chore(guard): grant EZD-990 (approved plan)', files: [GRANTS_FILE] }], why(r));
  assert.equal(git(root.tmp, 'status', '--porcelain', '--', '.claude').stdout, '');
  assert.equal(existsSync(root.at(PATCH_REL)), false, `patch file still present\n${why(r)}`);
  assert.ok(commitsOf(root.tmp).some((c) => c.subject === 'docs(vault): guard grant in place EZD-990'), why(r));
  const applied = r.log.indexOf('guard grant applied for EZD-990: scripts/run.mjs');
  const built = r.log.search(/build EZD-990: /);
  assert.ok(applied >= 0 && built >= 0 && applied < built, `log order (applied ${applied}, build ${built})\n${why(r)}`);
});

// The pre-commit hook of the plan's L4: every commit in the root is refused.
function refuseCommits(root) {
  const hook = root.at('.git/hooks/pre-commit');
  mkdirSync(path.dirname(hook), { recursive: true });
  writeFileSync(hook, '#!/bin/sh\necho "refused by test hook" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
}
const NOT_COMMITTED_START = 'EZ Draft: guard grant for EZD-990 not committed: commit failed: refused by test hook';
const NOT_COMMITTED_END = '. Tickets that need a guard grant stay held.';
const noStaged = (root) => git(root.tmp, 'diff', '--cached', '--name-only').stdout;

test('EZD-267 L4 commit fails: the grant text, the old patch and the index are restored and Josh hears once (AC-EZD-267-1)', async () => {
  const root = grantLauncher({ patch: true, next: [{ text: HELD_90, untilCalls: 3 }, { text: 'none: budget hold (test)' }], grantNeeds: [{ text: NEEDS_90 }] });
  refuseCommits(root);
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  const counts = readJson(root.at('counts.json')) ?? {};
  assert.ok(counts.next >= 4 && counts.grant >= 3, `stub counts ${JSON.stringify(counts)}\n${why(r)}`);
  assert.equal(r.notified.length, 1, why(r));
  assert.ok(r.notified[0].startsWith(NOT_COMMITTED_START), `${r.notified[0]}\n${why(r)}`);
  assert.ok(r.notified[0].endsWith(NOT_COMMITTED_END), r.notified[0]);
  assert.equal(readFileSync(root.at(GRANTS_FILE), 'utf8'), '{}\n');
  assert.equal(readFileSync(root.at(PATCH_REL), 'utf8'), 'old grant patch\n');
  assert.equal(noStaged(root), '');
  assert.equal(git(root.tmp, 'status', '--porcelain', '--', '.claude', 'vault/handoff').stdout, '');
  assert.equal(commitsOf(root.tmp).some((c) => c.subject === 'docs(vault): guard grant in place EZD-990'), false, why(r));
});

test('EZD-267 L5 apply output bad: output that is not the apply answer or a failed exit is one notice per kind and grants.json is restored (AC-EZD-267-1)', async () => {
  // The replaced tool first writes the grant into grants.json (cwd = the root), then answers badly.
  const write = "import { writeFileSync } from 'node:fs';\nwriteFileSync('.claude/hooks/grants.json', '{\"EZD-990\":[\"scripts/run.mjs\"]}\\n');\n";
  const cases = [
    ['a', write + "console.log('not json');\n", 'apply output unreadable'],
    ['b', write + 'process.exit(3);\n', 'exit 3'],
  ];
  for (const [name, tool, line] of cases) {
    const root = grantLauncher({ grantsTool: tool, next: [{ text: HELD_90, untilCalls: 3 }, { text: 'none: budget hold (test)' }], grantNeeds: [{ text: NEEDS_90 }] });
    const r = await runLauncher(root);
    const counts = readJson(root.at('counts.json')) ?? {};
    assert.ok(counts.next >= 4 && counts.grant >= 3, `(${name}) stub counts ${JSON.stringify(counts)}\n${why(r)}`);
    assert.deepEqual(r.notified, [`EZ Draft: guard grant for EZD-990 failed: ${line}. Tickets that need a guard grant stay held.`], `(${name})\n${why(r)}`);
    assert.equal(readFileSync(root.at(GRANTS_FILE), 'utf8'), '{}\n', `(${name}) grants.json not restored`);
    assert.equal(git(root.tmp, 'status', '--porcelain', '--', '.claude').stdout, '', `(${name})`);
    assert.deepEqual(r.prompts.filter((p) => p.startsWith('/build-ticket')), [], `(${name}) ${why(r)}`);
  }
});

test('EZD-267 L6 cleanup commit fails: the committed old patch stays and Josh hears once (AC-EZD-267-1)', async () => {
  const root = grantLauncher({ patch: true, next: [{ text: HELD_90, untilCalls: 3 }, { text: 'none: budget hold (test)' }], grantNeeds: [{ text: '[]' }] });
  refuseCommits(root);
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  const counts = readJson(root.at('counts.json')) ?? {};
  assert.ok(counts.grant >= 3, `stub counts ${JSON.stringify(counts)}\n${why(r)}`);
  assert.equal(r.notified.length, 1, why(r));
  assert.ok(r.notified[0].startsWith(NOT_COMMITTED_START), `${r.notified[0]}\n${why(r)}`);
  assert.ok(r.notified[0].endsWith(NOT_COMMITTED_END), r.notified[0]);
  assert.equal(readFileSync(root.at(PATCH_REL), 'utf8'), 'old grant patch\n');
  assert.equal(noStaged(root), '');
  assert.equal(git(root.tmp, 'status', '--porcelain', '--', 'vault/handoff').stdout, '');
});

test('EZD-267 L7 patch commit fails: the new patch is removed and Josh hears the commit failure, not the patch notice (AC-EZD-267-2)', async () => {
  const root = grantLauncher({ question: true, patch: false, next: [{ text: HELD_90, untilCalls: 3 }, { text: 'none: budget hold (test)' }], grantNeeds: [{ text: NEEDS_90 }] });
  refuseCommits(root);
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.equal(r.notified.length, 1, why(r));
  assert.ok(r.notified[0].startsWith(NOT_COMMITTED_START), `${r.notified[0]}\n${why(r)}`);
  assert.ok(r.notified[0].endsWith(NOT_COMMITTED_END), r.notified[0]);
  assert.equal(existsSync(root.at(PATCH_REL)), false, `patch file present\n${why(r)}`);
  assert.equal(noStaged(root), '');
  assert.equal(git(root.tmp, 'status', '--porcelain', '--', '.claude', 'vault/handoff').stdout, '');
  assert.deepEqual(r.prompts.filter((p) => p.startsWith('/build-ticket')), [], why(r));
});

// A temporary git repo on develop holding x.json (text `a`), for commitOrRestore.
function restoreRepo() {
  const dir = mkTmp('ezd267-restore-');
  writeFileSync(path.join(dir, 'x.json'), 'a');
  gitInit(dir, ['x.json']);
  return dir;
}

test('EZD-267 C1 commit or restore: a refused commit puts the old text back (or removes a new file) and clears the index (AC-EZD-267-1, AC-EZD-267-3)', async () => {
  const { commitOrRestore, withLedgerLock } = await import(ledgerUrl);
  const dir = restoreRepo();
  // Off develop: commitPaths skips; the file written over the committed text is restored.
  assert.equal(git(dir, 'checkout', '-q', '-b', 'other').status, 0);
  writeFileSync(path.join(dir, 'x.json'), 'b');
  assert.throws(() => withLedgerLock(dir, { owner: 'ezd267 test' }, () => commitOrRestore(dir, 'x.json', 'a', 'm')), /not on develop/);
  assert.equal(readFileSync(path.join(dir, 'x.json'), 'utf8'), 'a');
  assert.equal(git(dir, 'diff', '--cached', '--name-only').stdout, '');
  // On develop with a refusing pre-commit hook: a new file is removed.
  assert.equal(git(dir, 'checkout', '-q', 'develop').status, 0);
  const hook = path.join(dir, '.git/hooks/pre-commit');
  mkdirSync(path.dirname(hook), { recursive: true });
  writeFileSync(hook, '#!/bin/sh\necho "refused by test hook" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  writeFileSync(path.join(dir, 'y.json'), 'new');
  assert.throws(() => withLedgerLock(dir, { owner: 'ezd267 test' }, () => commitOrRestore(dir, 'y.json', null, 'm')), /^Error: commit failed:/);
  assert.equal(existsSync(path.join(dir, 'y.json')), false);
  assert.equal(git(dir, 'diff', '--cached', '--name-only').stdout, '');
});
