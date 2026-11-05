// EZD-279: the read guard denies a Read, Grep or Glob of the secret files in any letter case (plan vault/plans/EZD-279.md sections 3 and 4).
// Fake files only (CLAUDE.md rule 8). T1 and T12 import .claude/hooks/secret-paths.mjs; the rest run guard-reads.mjs as a process.
// T13 (the settings matcher) is the edit of EZD-000c T10 in guard-reads.test.mjs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hook = path.join(root, '.claude/hooks/guard-reads.mjs');
const modUrl = new URL('../../.claude/hooks/secret-paths.mjs', import.meta.url).href;

const tmp = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + '/ezd-279-'));
const R = tmp + '/repo';
const H = tmp + '/home';
const O = tmp + '/out';
for (const d of [R + '/scripts', R + '/app', H + '/.claude', R + '/.claude/worktrees/EZD-990/app', O]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(O + '/a.txt', 'x\n');
fs.writeFileSync(R + '/.env.local', 'FAKE=1\n');
fs.writeFileSync(R + '/.env.example', 'FAKE=1\n');
fs.writeFileSync(R + '/scripts/launcher.config.json', '{}\n');
fs.writeFileSync(H + '/.claude/.credentials.json', '{}\n');
fs.writeFileSync(R + '/README.md', '# r\n');
fs.symlinkSync(R + '/.env.local', R + '/notes.txt');
fs.symlinkSync(O, R + '/outlink');
fs.symlinkSync(tmp + '/missing', tmp + '/deadproj');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function run(input, envOver = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: R, HOME: H, ...envOver };
  delete env.GUARD_WHOLE_READ_CHARS;
  delete env.GUARD_WHOLE_READ_EXEMPT;
  return spawnSync('node', [hook], { input: JSON.stringify(input), env, encoding: 'utf8' });
}
const call = (tool_name, tool_input, cwd = R, envOver = {}) => run({ tool_name, tool_input, cwd }, envOver);
function denied(r, expected, msg) {
  assert.equal(r.status, 0, msg);
  const j = JSON.parse(r.stdout);
  assert.equal(j.hookSpecificOutput.permissionDecision, 'deny', msg);
  assert.equal(j.hookSpecificOutput.permissionDecisionReason, expected, msg);
}
function pass(r, msg) {
  assert.equal(r.status, 0, msg);
  assert.equal(r.stdout, '', msg);
}
const ENVF = 'a .env file';
const LAUNCH = 'scripts/launcher.config.json';
const SIGNIN = 'the Claude sign-in file';
const W1 = (given, what) => `Reading secret files is not allowed: ${given} is ${what} (Q-0459).`;
const W2 = (tool, what) => `Searching secret files is not allowed: this ${tool} can reach ${what} (Q-0459). Search a folder or a pattern that cannot match it.`;
const W3 = (tool, q) => `Searching secret files is not allowed: this ${tool} pattern cannot be checked: ${q} (Q-0459). Use a pattern without backslashes, extended globs or unbalanced brackets or braces.`;
const W5 = (where) => `Searching outside the repository is not allowed: this Grep searches ${where} (Q-0462). Search a folder inside the repository or a ticket worktree.`;

test('EZD-279 T1 secretName table (AC-EZD-279-1, AC-EZD-279-2, AC-EZD-279-3)', async () => {
  const { secretName } = await import(modUrl);
  const rows = [
    ['/r/.env', 'env'], ['/r/.ENV', 'env'], ['/r/app/.Env.Local', 'env'], ['/r/.env.staging', 'env'], ['/r/.ENV.STAGING', 'env'], ['/r/.env.ts', 'env'],
    ['/r/scripts/launcher.config.json', 'launcher'], ['/r/SCRIPTS/Launcher.Config.JSON', 'launcher'],
    ['/h/.claude/.credentials.json', 'signin'], ['/h/.CLAUDE/.Credentials.JSON', 'signin'], ['/x/.credentials.json', 'signin'], ['/h/.claude/.cred-old', 'signin'],
    ['/r/.env.example', null], ['/r/.ENV.EXAMPLE', null], ['/r/.environment', null], ['/r/app/env.ts', null], ['/r/launcher.config.json', null], ['/h/.claude/settings.json', null],
  ];
  for (const [p, want] of rows) assert.equal(secretName(p), want, p);
});

test('EZD-279 T2 Read in any case (AC-EZD-279-1)', () => {
  const rows = [
    ...[R + '/.env.local', R + '/.ENV.LOCAL', R + '/.Env.Local', R + '/.env', R + '/.ENV'].map((f) => [f, ENVF]),
    ...[R + '/scripts/launcher.config.json', R + '/SCRIPTS/LAUNCHER.CONFIG.JSON', R + '/Scripts/Launcher.Config.json'].map((f) => [f, LAUNCH]),
    ...[H + '/.claude/.credentials.json', H + '/.CLAUDE/.CREDENTIALS.JSON', H + '/.Claude/.Credentials.json'].map((f) => [f, SIGNIN]),
  ];
  for (const [f, what] of rows) denied(call('Read', { file_path: f }), W1(f, what), f);
});

test('EZD-279 T3 Read by ~ and relative path (AC-EZD-279-1)', () => {
  denied(call('Read', { file_path: '~/.claude/.Credentials.json' }), W1('~/.claude/.Credentials.json', SIGNIN));
  denied(call('Read', { file_path: '.ENV.local' }), W1('.ENV.local', ENVF));
});

test('EZD-279 T4 Read through a link (AC-EZD-279-1)', () => {
  denied(call('Read', { file_path: R + '/notes.txt' }), W1(R + '/notes.txt', ENVF));
});

test('EZD-279 T5 .env.staging like .env.local (AC-EZD-279-2, AC-EZD-279-3)', () => {
  for (const f of [R + '/.env.staging', R + '/.ENV.Staging', R + '/app/.env.production.local']) denied(call('Read', { file_path: f }), W1(f, ENVF), f);
  for (const f of [R + '/.env.example', R + '/.ENV.EXAMPLE']) pass(call('Read', { file_path: f }), f);
});

test('EZD-279 T6 non-secret and absent fields allowed (AC-EZD-279-3)', () => {
  const calls = [
    ...[R + '/README.md', R + '/app/env.ts', R + '/.environment', R + '/launcher.config.json', H + '/.claude/settings.json', R + '/scripts/launcher.mjs'].map((f) => ['Read', { file_path: f }]),
    ['Read', {}],
    ['Read', { file_path: 5 }],
    ['Grep', { pattern: 'x', path: 5 }],
    ['Grep', { pattern: 'x', path: R + '/app', glob: '' }],
    ['Glob', { pattern: '' }],
    ['Glob', { pattern: 5, path: R }],
  ];
  assert.equal(calls.length, 12);
  for (const [t, ti] of calls) pass(call(t, ti), t + JSON.stringify(ti));
});

test('EZD-279 T7 Grep or Glob path aimed (AC-EZD-279-2)', () => {
  denied(call('Grep', { pattern: 'FAKE', path: R + '/.ENV.local' }), W2('Grep', ENVF));
  denied(call('Grep', { pattern: 'x', path: H + '/.Claude/.credentials.json' }), W2('Grep', SIGNIN));
  denied(call('Grep', { pattern: 'x', path: 'Scripts/Launcher.config.json' }), W2('Grep', LAUNCH));
  denied(call('Glob', { pattern: '*', path: R + '/.env.Local' }), W2('Glob', ENVF));
});

test('EZD-279 T8 Grep glob (AC-EZD-279-2, AC-EZD-279-3)', () => {
  const g = (glob, p = R) => call('Grep', glob === undefined ? { pattern: 'x', path: p } : { pattern: 'x', path: p, glob });
  for (const glob of ['.env*', '*.LOCAL', '*', '.Env.Staging', '{*.ts,.env.local}', '*.ts .env', '*.ts', '*.{ts,tsx}', '*.md,*.mjs']) denied(g(glob), W2('Grep', ENVF), glob);
  denied(g('*.json', R + '/app'), W2('Grep', ENVF), 'app *.json');
  denied(g('launcher.config.json'), W2('Grep', LAUNCH), 'launcher.config.json');
  for (const glob of ['[!.]*.ts', '[a-z]*.{ts,tsx}', '!.env*', '.env.example', undefined]) pass(g(glob), String(glob));
  pass(g('[!.]*.json', R + '/app'), 'app [!.]*.json');
});

test('EZD-279 T9 Grep reaching the sign-in folder (AC-EZD-279-2, AC-EZD-279-3)', () => {
  for (const p of [H, H + '/.CLAUDE', '/']) denied(call('Grep', { pattern: 'x', path: p }), W2('Grep', SIGNIN), p);
  pass(call('Grep', { pattern: 'x', path: R + '/app' }));
});

test('EZD-279 T10 Glob pattern (AC-EZD-279-2, AC-EZD-279-3)', () => {
  const gl = (pattern, p = R) => call('Glob', p === undefined ? { pattern } : { pattern, path: p });
  for (const pat of ['**/.env.*', '**/.ENV', 'scripts/*.json', '**/*.json', '**/*.ts', '*.md']) denied(gl(pat), W2('Glob', ENVF), pat);
  for (const pat of ['scripts/launcher.*', '**/launcher.config.json']) denied(gl(pat), W2('Glob', LAUNCH), pat);
  for (const pat of [H + '/.claude/.cred*', H + '/.CLAUDE/.Cred*']) denied(gl(pat, undefined), W2('Glob', SIGNIN), pat);
  for (const pat of ['app/**/[!.]*.tsx', '**/[a-z]*.ts', 'app/**/[a-z]*.json', 'scripts/[!.]*.mjs', '[A-Z]*.md', 'README.md']) pass(gl(pat), pat);
});

test('EZD-279 T11 unreadable patterns refused (AC-EZD-279-2)', () => {
  const grepGlobs = ['.e\\nv', '@(x)', '[abc', '{a,b', 'sc\\ripts/launcher.config.json', 'a}b'];
  const globPats = ['+(a)', '{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}', '+(scripts)/launcher.config.json', '[s/x.json', 'x!(a)', '*(a)', '?(a)'];
  assert.equal(grepGlobs.length + globPats.length, 13);
  assert.equal(grepGlobs[0].length, 5);
  for (const q of grepGlobs) denied(call('Grep', { pattern: 'x', path: R, glob: q }), W3('Grep', q), q);
  for (const q of globPats) denied(call('Glob', { pattern: q, path: R }), W3('Glob', q), q);
});

test('EZD-279 T12 globReach table (AC-EZD-279-2, AC-EZD-279-3)', async () => {
  const { globReach } = await import(modUrl);
  const ctx = (tool) => ({ tool, home: '/h', repoRoot: '/r' });
  const seven = '{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}';
  const rows = [
    ['/r', '[.]env', 'Glob', 'env'], ['/r', '?env', 'Glob', 'env'], ['/r', '.e[!x]v', 'Glob', 'env'], ['/r', '.[F-n]nv', 'Glob', 'env'], ['/r', '.[!E]nv', 'Glob', 'env'], ['/r', '.[!E]nv.local', 'Glob', 'env'], ['/r', '*', 'Glob', 'env'],
    ['/r', '.Env.Staging', 'Glob', 'env'], ['/r', '.env.exampl?', 'Glob', 'env'], ['/r', '*.ci', 'Glob', 'env'], ['/r', '*.test', 'Grep', 'env'], ['/r', '*.ts', 'Glob', 'env'],
    ['/r/app/src', '*.ts', 'Glob', 'env'], ['/r', '*.json', 'Glob', 'env'], ['/r', '*.json', 'Grep', 'env'], ['/h', '**/*.json', 'Glob', 'env'],
    ['/r/scripts', '[M-z]auncher.config.json', 'Glob', 'launcher'], ['/r/scripts', '[!L]auncher.config.json', 'Glob', 'launcher'], ['/x', 'scripts/launcher.*', 'Glob', 'launcher'], ['/r', 'launcher.config.json', 'Grep', 'launcher'],
    ['/h', '**/.cred*', 'Glob', 'signin'], ['/h/.claude', '.c[r]edX', 'Glob', 'signin'], ['/h', '.claude/.[!C]red*', 'Glob', 'signin'],
    ['/h', '.claude/[!C]red*', 'Glob', null], ['/r', '.env.example', 'Glob', null], ['/r', '.ENV.EXAMPLE', 'Glob', null], ['/r', '[!.]*.ts', 'Glob', null], ['/r/app/src', '[a-z]*.json', 'Glob', null], ['/h', '[a-z]*.json', 'Glob', null],
    ['/r', '[]x]', 'Glob', null], ['/r', '!*.env', 'Grep', null], ['/r', '{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}', 'Glob', null],
    ['/r', seven, 'Glob', 'unreadable'], ['/r', '[z-a]', 'Glob', 'unreadable'],
  ];
  assert.equal(rows.length, 34);
  for (const [r, g, tool, want] of rows) assert.equal(globReach(r, g, ctx(tool)), want, `${r} ${g} ${tool}`);
});

test('EZD-279 T14 check error fails closed (AC-EZD-279-1)', () => {
  const r = run({ tool_name: 'Read', tool_input: { file_path: 'x' }, cwd: 5 });
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.hookSpecificOutput.permissionDecision, 'deny');
  const why = j.hookSpecificOutput.permissionDecisionReason;
  assert.ok(why.startsWith('The secret-file check could not run ('), why);
  assert.ok(why.endsWith('); this Read call is refused (Q-0459).'), why);
});

test('EZD-279 T15 Grep outside the repository (AC-EZD-279-2, AC-EZD-279-3)', () => {
  // (a) default env, cwd R
  denied(call('Grep', { pattern: 'x', path: O }), W5(O), 'a O');
  denied(call('Grep', { pattern: 'x', path: '../out' }), W5('../out'), 'a ../out');
  denied(call('Grep', { pattern: 'x', path: R + '/outlink' }), W5(R + '/outlink'), 'a outlink');
  denied(call('Grep', { pattern: 'x' }, O), W5(O), 'a cwd O');
  pass(call('Grep', { pattern: 'x', path: R + '/.claude/worktrees/EZD-990/app' }), 'a worktree app');
  pass(call('Grep', { pattern: 'x', path: R + '/app' }), 'a app');
  // (b) project dir and cwd are a ticket worktree
  const WT = R + '/.claude/worktrees/EZD-990';
  const envB = { CLAUDE_PROJECT_DIR: WT };
  pass(call('Grep', { pattern: 'x', path: R + '/app' }, WT, envB), 'b app');
  pass(call('Grep', { pattern: 'x' }, WT, envB), 'b no path');
  denied(call('Grep', { pattern: 'x', path: O }, WT, envB), W5(O), 'b O');
  // (c) repoRoot() is null
  denied(call('Grep', { pattern: 'x', path: R + '/app' }, R, { CLAUDE_PROJECT_DIR: tmp + '/deadproj' }), W5(R + '/app'), 'c');
});

test('EZD-279 T16 module load failure fails closed (AC-EZD-279-1)', () => {
  const C = tmp + '/copy';
  fs.mkdirSync(C + '/.claude/hooks', { recursive: true });
  fs.mkdirSync(C + '/vault/tools', { recursive: true });
  fs.copyFileSync(hook, C + '/.claude/hooks/guard-reads.mjs');
  fs.copyFileSync(path.join(root, '.claude/hooks/lib.mjs'), C + '/.claude/hooks/lib.mjs');
  fs.copyFileSync(path.join(root, 'vault/tools/outline.mjs'), C + '/vault/tools/outline.mjs');
  const runCopy = () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: R, HOME: H };
    delete env.GUARD_WHOLE_READ_CHARS;
    delete env.GUARD_WHOLE_READ_EXEMPT;
    return spawnSync('node', [C + '/.claude/hooks/guard-reads.mjs'], { input: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: R + '/README.md' }, cwd: R }), env, encoding: 'utf8' });
  };
  const check = (r, msg) => {
    assert.equal(r.status, 0, msg);
    const j = JSON.parse(r.stdout);
    assert.equal(j.hookSpecificOutput.permissionDecision, 'deny', msg);
    const why = j.hookSpecificOutput.permissionDecisionReason;
    assert.ok(why.startsWith('The secret-file check could not run ('), why);
    assert.ok(why.endsWith('); this Read call is refused (Q-0459).'), why);
  };
  check(runCopy(), 'missing module');
  fs.writeFileSync(C + '/.claude/hooks/secret-paths.mjs', 'export const = ;\n');
  check(runCopy(), 'broken module');
});
