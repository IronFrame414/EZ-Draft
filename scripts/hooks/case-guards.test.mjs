// EZD-277 tests: the write, read and shell guards compare paths in one case-folded form on a case-insensitive disk
// (plan vault/plans/EZD-277.md sections 3 and 4; Q-0457, Q-0458). T10 is the regression run of the other hook tests, not a test here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const libUrl = pathToFileURL(path.join(repo, '.claude/hooks/lib.mjs')).href;
const hooks = path.join(repo, '.claude/hooks');
const M = '/ezd-277-case-root'; // never created: the probe folds on every OS
const AC1 = 'AC-EZD-277-1';
const AC2 = 'AC-EZD-277-2';

// CI oracle: does a fresh temp dir ignore case?
function osIgnoresCase() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd277-ci-'));
  fs.writeFileSync(path.join(d, 'probe.txt'), 'x');
  return fs.existsSync(path.join(d, 'PROBE.TXT'));
}
const CI = osIgnoresCase();

function spawnHook(name, input, root, env = {}) {
  const e = { ...process.env, CLAUDE_PROJECT_DIR: root, ...env };
  if (!('GUARD_WHOLE_READ_CHARS' in env)) delete e.GUARD_WHOLE_READ_CHARS;
  if (!('GUARD_WHOLE_READ_EXEMPT' in env)) delete e.GUARD_WHOLE_READ_EXEMPT;
  return spawnSync(process.execPath, [path.join(hooks, name)], { input: JSON.stringify(input), env: e, encoding: 'utf8' });
}
function decide(agent, root, file, cwd = root) {
  const r = spawnHook('guard-paths.mjs', { agent_type: agent, tool_name: 'Write', tool_input: { file_path: path.join(root, file) }, cwd }, root);
  return { verdict: r.stdout.includes('"deny"') ? 'deny' : 'allow', stdout: r.stdout };
}
const verdicts = (agent, root, files) => files.map((f) => [f, decide(agent, root, f).verdict]);

test('EZD-277 T1 pathKey folds with NFC, upper, lower (AC-EZD-277-1)', async () => {
  const { pathKey } = await import(libUrl);
  assert.deepEqual(
    [
      pathKey('Scripts/Gate.MJS', true),
      pathKey('\u017Fcripts/gate.mjs', true),
      pathKey('.claude/hooKs/grants.json', true),
      pathKey('\u00C9.md', true),
      pathKey('Scripts/Gate.MJS', false),
      pathKey('\u017Fcripts/gate.mjs', false),
    ],
    ['scripts/gate.mjs', 'scripts/gate.mjs', '.claude/hooks/grants.json', '\u00E9.md', 'Scripts/Gate.MJS', '\u017Fcripts/gate.mjs'],
  );
});

test('EZD-277 T2 caseInsensitiveDisk probe (AC-EZD-277-1)', async () => {
  const { caseInsensitiveDisk } = await import(libUrl);
  assert.equal(fs.existsSync(M), false);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd277-probe-'));
  assert.deepEqual([caseInsensitiveDisk(M), caseInsensitiveDisk('/'), caseInsensitiveDisk(null), caseInsensitiveDisk('')], [true, true, true, true]);
  assert.equal(caseInsensitiveDisk(d), CI);
});

test('EZD-277 T3 pathIn compares list entries in the chosen form (AC-EZD-277-2)', async () => {
  const { pathIn } = await import(libUrl);
  const l = ['scripts/run.mjs'];
  assert.deepEqual(
    [pathIn(l, 'SCRIPTS/Run.mjs', true), pathIn(l, 'scripts/run.mjs.bak', true), pathIn(l, 'scripts/run', true), pathIn(l, 'SCRIPTS/Run.mjs', false), pathIn(l, 'scripts/run.mjs', false), pathIn([], 'x', true)],
    [true, false, false, false, true, false],
  );
  // Look-alikes (security-reviewer round 1 finding 1): a non-ASCII entry or path matches only its exact string.
  const f = ['vault/tools/findings.mjs'];
  assert.deepEqual(
    [
      pathIn(f, 'vault/tools/f\u0131nd\u0131ngs.mjs', true),
      pathIn(f, 'vault/tools/\uFB01ndings.mjs', true),
      pathIn(f, 'vault/tools/finding\u017F.mjs', true),
      pathIn(f, 'VAULT/tools/FINDINGS.mjs', true),
      pathIn(f, 'vault/tools/f\u0131nd\u0131ngs.mjs', false),
      pathIn(['.claude/hooks/grants.json'], '.claude/hoo\u212As/grants.json', true),
      pathIn(['caf\u00E9.md'], 'caf\u00E9.md', true),
      pathIn(['caf\u00E9.md'], 'CAF\u00C9.md', true),
      pathIn(['scr\u0131pts/run.mjs'], 'scripts/run.mjs', true),
    ],
    [false, false, false, true, false, false, true, false, false],
  );
});

test('EZD-277 T4 grantFor matches the ticket key in one form and returns the stored list (AC-EZD-277-2)', async () => {
  const { grantFor } = await import(libUrl);
  const g = { 'EZD-990': ['scripts/run.mjs'] };
  const two = { 'EZD-990': ['a'], 'ezd-990': ['b'] };
  assert.deepEqual(
    [
      grantFor(g, 'ezd-990', true),
      grantFor(g, 'ezd-990', false),
      grantFor(g, 'EZD-990', false),
      grantFor(g, 'EZD-991', true),
      grantFor(two, 'EZD-990', true),
      grantFor(two, 'EZD-990', false),
      grantFor({ 'EZD-990': ['scripts/\u017Ftool.mjs'] }, 'EZD-990', true),
      grantFor({ 'EZD-990': ['scripts/\u017Ftool.mjs'] }, 'EZD-990', false),
      grantFor({ 'EZD-301\u017F': ['a'] }, 'ezd-301s', true),
      grantFor({ 'EZD-990': 'scripts/run.mjs' }, 'EZD-990', true),
      grantFor({ 'EZD-990': ['a', 1] }, 'EZD-990', true),
      grantFor([], 'EZD-990', true),
      grantFor(null, 'EZD-990', true),
      grantFor({}, 'toString', true),
    ],
    [['scripts/run.mjs'], null, ['scripts/run.mjs'], null, null, ['a'], null, null, null, null, null, null, null, null],
  );
  assert.equal(grantFor(g, 'EZD-990', false), g['EZD-990']);
});

test('EZD-277 T5 write guard denies other spellings of guarded paths (AC-EZD-277-1)', () => {
  const files = [
    'scripts/gate.mjs', 'Scripts/gate.mjs', 'SCRIPTS/GATE.MJS', '\u017Fcripts/gate.mjs',
    '.claude/hooks/guard-paths.mjs', '.Claude/Hooks/guard-paths.mjs', '.claude/hooKs/grants.json',
    'CLAUDE.md', 'claude.MD',
    'vault/spec/INDEX.md', 'Vault/Spec/index.md',
    'src/tests/a.ts', 'src/Tests/a.ts', 'src/a.TEST.ts', 'Fixtures/x.json',
    '.env', '.ENV', 'app/.Env.local',
  ];
  assert.deepEqual(verdicts('builder', M, files), files.map((f) => [f, 'deny']));
});

test('EZD-277 T6 write guard judges other spellings like the listed case (AC-EZD-277-1)', () => {
  const rows = [];
  const add = (agent, root, files, want) => files.forEach((f) => rows.push([agent, root, f, want]));
  add('builder', M, ['.env.example', '.ENV.EXAMPLE', 'src/app.ts', 'SRC/App.ts'], 'allow');
  add('orchestrator', M, ['Scripts/run.mjs', '.GitHub/workflows/ci.yml'], 'deny');
  add('planner', M, ['Vault/Plans/EZD-999.md'], 'allow');
  add('planner', M, ['vault/plans/Shots/a.png'], 'deny');
  add('test-author', M, ['src/Tests/a.ts'], 'allow');
  add('test-author', M, ['SRC/x.ts'], 'deny');
  add('ui-verifier', M, ['VAULT/plans/shots/a.png'], 'allow');
  add('retriever-digest', M, ['Vault/Research/Pending/r.md'], 'allow');
  add('builder', M, ['.claude/worktrees/ezd-000b/.claude/settings.json'], 'allow');
  add('builder', M, ['.claude/worktrees/EZD-000B/Scripts/Gate.mjs'], 'deny');
  add('builder', M, ['.claude/worktrees/ezd-000k/.claude/settings.json'], 'deny');
  assert.deepEqual(rows.map(([a, r, f]) => [a, f, decide(a, r, f).verdict]), rows.map(([a, , f, w]) => [a, f, w]));
  for (const f of ['vault/budget.json', 'VAULT/BUDGET.JSON', 'vault/handoff/budget_hold.md', 'Vault/Spec/signoff.md']) {
    const r = decide('orchestrator', M, f);
    assert.equal(r.verdict, 'deny', f);
    assert.ok(r.stdout.includes('is written only by Josh'), f);
  }
});

test('EZD-277 T7 a grant covers its file in any case and no other path (AC-EZD-277-2)', () => {
  const R = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ezd277-grant-')));
  fs.mkdirSync(path.join(R, '.claude/hooks'), { recursive: true });
  fs.mkdirSync(path.join(R, '.claude/worktrees/EZD-990/scripts'), { recursive: true });
  fs.mkdirSync(path.join(R, '.claude/worktrees/EZD-991/scripts'), { recursive: true });
  const grants = path.join(R, '.claude/hooks/grants.json');
  fs.writeFileSync(grants, JSON.stringify({ 'EZD-990': ['scripts/tool.mjs'] }));
  const w = (t, f) => `.claude/worktrees/${t}/${f}`;
  const rows = [
    ['builder', w('EZD-990', 'scripts/tool.mjs'), 'allow'],
    ['builder', w('EZD-990', 'scripts/TOOL.mjs'), CI ? 'allow' : 'deny'],
    ['builder', w('EZD-990', 'scripts/tool.mjs.bak'), 'deny'],
    ['builder', w('EZD-990', 'scripts/tool2.mjs'), 'deny'],
    ['builder', w('ezd-990', 'scripts/tool.mjs'), CI ? 'allow' : 'deny'],
    ['builder', w('EZD-991', 'scripts/TOOL.mjs'), 'deny'],
    ['test-author', w('EZD-990', 'scripts/tool.mjs'), 'deny'],
  ];
  assert.deepEqual(rows.map(([a, f]) => [a, f, decide(a, R, f).verdict]), rows);
  fs.writeFileSync(grants, JSON.stringify({ 'EZD-990': ['scripts/\u017Ftool.mjs'] }));
  const rows2 = [
    ['builder', w('EZD-990', 'scripts/stool.mjs'), 'deny'],
    ['builder', w('EZD-990', 'scripts/\u017Ftool.mjs'), 'deny'],
  ];
  assert.deepEqual(rows2.map(([a, f]) => [a, f, decide(a, R, f).verdict]), rows2);
  // Look-alike spellings of the granted path (security-reviewer round 1 finding 1).
  fs.writeFileSync(grants, JSON.stringify({ 'EZD-990': ['scripts/tool.mjs'] }));
  fs.mkdirSync(path.join(R, '.claude/worktrees/EZD-990/vault/tools'), { recursive: true });
  for (const f of ['scr\u0131pts/tool.mjs', '\u017Fcripts/tool.mjs']) {
    const r = decide('builder', R, w('EZD-990', f));
    assert.equal(r.verdict, CI ? 'deny' : 'allow', f);
    if (CI) assert.ok(r.stdout.includes('outside plain ASCII'), f);
  }
  fs.writeFileSync(grants, JSON.stringify({ 'EZD-990': ['vault/tools/findings.mjs'] }));
  const rows3 = [
    ['builder', w('EZD-990', 'vault/tools/findings.mjs'), 'allow'],
    ['builder', w('EZD-990', 'vault/tools/f\u0131nd\u0131ngs.mjs'), 'deny'],
    ['builder', w('EZD-990', 'vault/tools/\uFB01ndings.mjs'), 'deny'],
  ];
  assert.deepEqual(rows3.map(([a, f]) => [a, f, decide(a, R, f).verdict]), rows3);
});

function bigFile(dir, name) {
  const f = path.join(dir, name);
  fs.writeFileSync(f, 'x'.repeat(99) + '\n'.repeat(1) + ('x'.repeat(99) + '\n').repeat(248) + 'x'.repeat(24999 - 100 - 248 * 100) + '\n');
  assert.equal(fs.readFileSync(f, 'utf8').length, 25000);
  return f;
}
const blocked = (r) => r.status === 0 && r.stdout.includes('Whole read blocked: ');
const passed = (r) => r.status === 0 && r.stdout === '';

test('EZD-277 T8 read guard compares an absolute exempt entry in one form (AC-EZD-277-1)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd277-read-'));
  const F = bigFile(dir, 'Big.md');
  const read = (env) => spawnHook('guard-reads.mjs', { tool_name: 'Read', tool_input: { file_path: F }, cwd: dir }, M, env);
  const got = [
    passed(read({ GUARD_WHOLE_READ_EXEMPT: F })),
    passed(read({ GUARD_WHOLE_READ_EXEMPT: path.join(dir, 'BIG.MD') })),
    blocked(read({ GUARD_WHOLE_READ_EXEMPT: path.join(dir, 'Big2.md') })),
    blocked(read({})),
  ];
  assert.deepEqual(got, [true, true, true, true]);
  // A look-alike file name is not the exempt file.
  const lookalike = bigFile(dir, 'B\u0131g.md');
  const r = spawnHook('guard-reads.mjs', { tool_name: 'Read', tool_input: { file_path: lookalike }, cwd: dir }, M, { GUARD_WHOLE_READ_EXEMPT: F });
  assert.equal(blocked(r), true);
});

test('EZD-277 T9 read guard compares a repo exempt entry in one form (AC-EZD-277-1)', () => {
  const R2 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ezd277-rel-')));
  fs.mkdirSync(path.join(R2, 'vault'));
  const F = bigFile(path.join(R2, 'vault'), 'Big.md');
  const read = (exempt) => spawnHook('guard-reads.mjs', { tool_name: 'Read', tool_input: { file_path: F }, cwd: R2 }, R2, { GUARD_WHOLE_READ_EXEMPT: exempt });
  assert.equal(passed(read('vault/Big.md')), true);
  const other = read('VAULT/big.MD');
  assert.equal(CI ? passed(other) : blocked(other), true);
  const lookalike = bigFile(path.join(R2, 'vault'), 'B\u0131g.md');
  const r = spawnHook('guard-reads.mjs', { tool_name: 'Read', tool_input: { file_path: lookalike }, cwd: R2 }, R2, { GUARD_WHOLE_READ_EXEMPT: 'vault/Big.md' });
  assert.equal(blocked(r), true);
});

test('EZD-277 T11 shell guard blocks the sign-in file in any capitals (AC-EZD-277-1)', () => {
  const run = (agent, command) => {
    const input = { tool_input: { command } };
    if (agent) input.agent_type = agent;
    return spawnHook('guard-bash.mjs', input, repo);
  };
  for (const agent of [undefined, 'builder']) {
    for (const c of ['cat ~/.claude/.Credentials.json', 'cat ~/.CLAUDE/.CREDENTIALS.JSON', 'jq . ~/.Claude/.Cred*']) {
      const r = run(agent, c);
      assert.ok(r.stdout.includes('"deny"'), `${agent} ${c}`);
      const reason = JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.ok(reason.includes('sign-in file') && reason.includes('PA3 rule 8'), `${agent} ${c}`);
    }
    assert.equal(run(agent, 'test -f ~/.claude/.Credentials.json').stdout, '', `${agent} test -f`);
  }
});

test('EZD-277 T12 printableAscii accepts only U+0020-U+007E raw strings (AC-EZD-277-2)', async () => {
  const { printableAscii } = await import(libUrl);
  const got = ['scripts/gate.mjs', 'Scripts/Gate.MJS', '~ !', 'scr\u0131pts', '\u212A', 'caf\u00E9', '', 'a\tb', null, 42].map((s) => printableAscii(s));
  assert.deepEqual(got, [true, true, true, false, false, false, false, false, false, false]);
});

test('EZD-277 T13 write guard refuses a non-ASCII path on a folding disk (AC-EZD-277-2)', () => {
  const rows = [
    ['planner', 'vault/plan\u017F/EZD-999.md'],
    ['test-author', 'src/te\u017Fts/a.ts'],
    ['ui-verifier', 'vault/plans/\u017Fhots/a.png'],
    ['retriever-digest', 'vault/re\u017Fearch/pending/r.md'],
    ['orchestrator', 'vault/\u017Fpec/decisions/x.md'],
    ['orchestrator', 'vault/handoff/n\u00F6te.md'],
    ['builder', 'src/caf\u00E9.ts'],
    ['builder', 'src/a\u212A.ts'],
    ['builder', 'scr\u0131pts/conventions/x.mjs'],
    ['builder', '.claude/wor\u212Atrees/EZD-990/src/a.ts'],
  ];
  for (const [agent, f] of rows) {
    const r = decide(agent, M, f);
    assert.equal(r.verdict, 'deny', `${agent} ${f}`);
    assert.ok(r.stdout.includes('outside plain ASCII'), `${agent} ${f}`);
  }
  assert.equal(decide('builder', M, '.claude/worktrees/EZD-990/src/a.ts').verdict, 'allow', 'control');
  const R = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ezd277-grant-')));
  fs.mkdirSync(path.join(R, '.claude/hooks'), { recursive: true });
  fs.mkdirSync(path.join(R, '.claude/worktrees/EZD-990/src'), { recursive: true });
  fs.writeFileSync(path.join(R, '.claude/hooks/grants.json'), JSON.stringify({ 'EZD-990': ['scripts/tool.mjs'] }));
  const wt = '.claude/worktrees/EZD-990';
  const asSent = (file, cwd) => {
    const r = spawnHook('guard-paths.mjs', { agent_type: 'builder', tool_name: 'Write', tool_input: { file_path: file }, cwd }, R);
    return { verdict: r.stdout.includes('"deny"') ? 'deny' : 'allow', stdout: r.stdout };
  };
  const folding = [
    ['r1', decide('builder', R, `${wt}/src/caf\u00E9.ts`)],
    ['r2', decide('builder', R, '.claude/wor\u212Atrees/EZD-990/src/a.ts')],
    ['r3', decide('builder', R, `${wt}/\u017Frc/a.ts`)],
    ['r4', asSent('src/a.ts', path.join(R, '.claude/wor\u212Atrees/EZD-990'))],
  ];
  for (const [name, r] of folding) {
    assert.equal(r.verdict, CI ? 'deny' : 'allow', name);
    if (CI) assert.ok(r.stdout.includes('outside plain ASCII'), name);
  }
  assert.equal(decide('builder', R, `${wt}/src/a.ts`).verdict, 'allow', 'r5 control');
});
