// EZD-280: the shell guard denies any command that names a secret file, whatever the command word (plan vault/plans/EZD-280.md sections 3 and 4).
// Fake files only (CLAUDE.md rule 8), all under one temporary folder. T1 and T10 import .claude/hooks/secret-paths.mjs; the rest run guard-bash.mjs as a process.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hook = path.join(root, '.claude/hooks/guard-bash.mjs');
const modUrl = new URL('../../.claude/hooks/secret-paths.mjs', import.meta.url).href;

const tmp = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + '/ezd-280-'));
const R = tmp + '/repo';
const H = tmp + '/home';
for (const d of [R + '/scripts', R + '/app', H + '/.claude']) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(R + '/.env.local', 'FAKE=1\n');
fs.writeFileSync(R + '/.env.example', 'FAKE=1\n');
fs.writeFileSync(R + '/scripts/launcher.config.json', '{}\n');
fs.writeFileSync(H + '/.claude/.credentials.json', '{}\n');
fs.writeFileSync(R + '/README.md', '# r\n');
fs.symlinkSync(R + '/.env.local', R + '/notes.txt');
fs.symlinkSync(H + '/.claude/.credentials.json', R + '/app/creds');
fs.symlinkSync(R + '/.env.local', H + '/envlink');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const kindText = { env: 'a .env file', launcher: 'scripts/launcher.config.json', signin: 'the Claude sign-in file' };
const B1 = (shown, k) => `Naming secret files in a shell command is not allowed: ${shown} is ${kindText[k]} (Q-0461).`;
const B2 = (shown) => `Naming secret files in a shell command is not allowed: this word cannot be checked: ${shown} (Q-0461). Write it without $'…' number escapes or unbalanced brackets or braces.`;
const B3 = (shown, k) => `Naming secret files in a shell command is not allowed: ${shown} can match ${kindText[k]} (Q-0461). Name the files without wildcards or braces.`;
const q = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
const nest = (k) => (k === 0 ? 'sed p scripts/launcher.config.json' : 'sh -c ' + q(nest(k - 1)));

const baseEnv = () => ({ ...process.env, CLAUDE_PROJECT_DIR: R, HOME: H });
function run(command, cwd = R, script = hook) {
  return spawnSync('node', [script], { input: JSON.stringify({ tool_input: { command }, cwd }), env: baseEnv(), encoding: 'utf8' });
}
function reasonOf(r, msg) {
  assert.equal(r.status, 0, msg + ' (exit)');
  assert.notEqual(r.stdout, '', msg + ' (expected a deny, got an allow)');
  const j = JSON.parse(r.stdout);
  assert.equal(j.hookSpecificOutput.permissionDecision, 'deny', msg);
  return j.hookSpecificOutput.permissionDecisionReason;
}
function expectDeny(command, reason, cwd = R) {
  assert.equal(reasonOf(run(command, cwd), command), reason, command);
}
function expectPass(command, cwd = R) {
  const r = run(command, cwd);
  assert.equal(r.status, 0, command + ' (exit)');
  assert.equal(r.stdout, '', command + ' (expected an allow)');
}

// A word as the table writes it: text, then 'g' (glob) or 'u' (unreadable).
const w = (text, flag) => ({ text, glob: flag === 'g', unreadable: flag === 'u' });

test('EZD-280 T1 shellWords table (AC-EZD-280-1, AC-EZD-280-3)', async () => {
  const { shellWords } = await import(modUrl);
  const rows = [
    ['sed -n p .env.local', [[w('sed'), w('-n'), w('p'), w('.env.local')]]],
    ['cat ".e"\'nv\'.local', [[w('cat'), w('.env.local')]]],
    ['a && b | c; d', [[w('a')], [w('b')], [w('c')], [w('d')]]],
    ['x\\ y "q\\"r" \'a\\b\'', [[w('x y'), w('q"r'), w('a\\b')]]],
    ['cat<.env 2>&1', [[w('cat')], [w('.env'), w('2')], [w('1')]]],
    ['ls *.ts "*.md" ${HOME} [ x ]', [[w('ls'), w('*.ts', 'g'), w('*.md'), w('${HOME}'), w('['), w('x'), w(']')]]],
    ["echo $'a\\tb' $'\\x2e'", [[w('echo'), w('a\tb'), w('\\x2e', 'u')]]],
    ['echo $"hi" \'open', [[w('echo'), w('hi'), w('open')]]],
    ['x=`cat .env`$(y)', [[w('x=')], [w('cat'), w('.env')], [w('$')], [w('y')]]],
    ['{ a; }', [[w('{'), w('a')], [w('}')]]],
  ];
  for (const [cmd, want] of rows) assert.deepEqual(shellWords(cmd), want, cmd);
});

test('EZD-280 T2 any command word is denied for a secret path in any letter case (AC-EZD-280-1)', () => {
  expectDeny('sed -n p .env.local', B1('.env.local', 'env'));
  expectDeny('grep . .ENV.Local', B1('.ENV.Local', 'env'));
  expectDeny('cp .Env.Local /tmp/x', B1('.Env.Local', 'env'));
  expectDeny('ln -s .env.local n2.txt', B1('.env.local', 'env'));
  expectDeny('ln .ENV.LOCAL x', B1('.ENV.LOCAL', 'env'));
  expectDeny('cp SCRIPTS/Launcher.Config.JSON x', B1('SCRIPTS/Launcher.Config.JSON', 'launcher'));
  expectDeny('sed p app/creds', B1('app/creds', 'signin'));
  expectDeny('ln -s app/creds y', B1('app/creds', 'signin'));
  // Round 2: a written default inside ${...} is a word to judge.
  expectPass('echo ${X:-hello}');
  expectDeny('sed p ${X:-.env.local}', B1('.env.local', 'env'));
  expectDeny('sed p ${X-.env.local}', B1('.env.local', 'env'));
  expectDeny('cat .ENV.LOCAL', 'Reading .env files is not allowed.');
  expectDeny('grep x ~/.claude/.Credentials.json', 'The Claude sign-in file is never read from the shell. Only test -f <path> or [ -f <path> ] may name it (PA3 rule 8).');
});

test('EZD-280 T3 the launcher config and cd forms (AC-EZD-280-2)', () => {
  expectDeny('cat scripts/launcher.config.json', B1('scripts/launcher.config.json', 'launcher'));
  expectDeny('cat ./Scripts/launcher.config.json', B1('./Scripts/launcher.config.json', 'launcher'));
  expectDeny('cat launcher.config.json', B1('launcher.config.json', 'launcher'), R + '/scripts');
  expectDeny('cat ../scripts/launcher.config.json', B1('../scripts/launcher.config.json', 'launcher'), R + '/app');
  expectDeny('cd scripts && cat launcher.config.json', B1('launcher.config.json', 'launcher'));
  expectDeny('cd app; cd -; cd scripts; sed p launcher.config.json', B1('launcher.config.json', 'launcher'));
  expectDeny('cd; sed p envlink', B1('envlink', 'env'));
  // Round 2: a cd argument with a wildcard cannot be followed, so the next word is unjudgeable (B2 shows the cd argument after quote removal).
  assert.ok(reasonOf(run('cd ~/.claude; sed -n p .c*'), 'cd ~/.claude control').length > 0);
  expectDeny('cd ~/.[c]laude; sed -n p .c*', B2('~/.[c]laude'));
  expectDeny('cd ~/.cla*; sed -n p .c*', B2('~/.cla*'));
});

test('EZD-280 T4 quoting and nesting (AC-EZD-280-1)', () => {
  const env = B1('.env.local', 'env');
  const rows = [
    ['sed p ".env.local"', env],
    ["sed p .e'nv'.local", env],
    ['sed p .e\\nv.local', env],
    ['node --env-file=.env.local x.mjs', env],
    ['X=$(sed p .env.local)', env],
    ['echo "$(head -c1 .e\'nv\'.local)"', env],
    ["bash -c 'sed p .env.local'", env],
    ['sed p < .env.local', env],
    ['source .env.local', env],
    ['. .ENV', B1('.ENV', 'env')],
    ['scp h:.env.local .', env],
    ['sed p $D/.env.local', B1('$D/.env.local', 'env')],
    ['diff <(sed p .env.local) x', env],
    ['sed p notes.txt', B1('notes.txt', 'env')],
    ['python3 -c "open(\'.env.local\')"', env],
    ['git commit -m "see .env.local"', env],
    [nest(4), B1('scripts/launcher.config.json', 'launcher')],
    [nest(5), B2(nest(1))],
  ];
  assert.equal(rows.length, 18);
  for (const [cmd, why] of rows) expectDeny(cmd, why);
});

test('EZD-280 T5 wildcards and braces (AC-EZD-280-1, AC-EZD-280-3)', () => {
  expectDeny('sed p .e*', B3('.e*', 'env'));
  expectDeny('cat scripts/*', B3('scripts/*', 'launcher'));
  expectDeny('sed p {.env.local,x}', B3('{.env.local,x}', 'env'));
  expectDeny('sed p scripts/launcher.{config,x}.json', B3('scripts/launcher.{config,x}.json', 'launcher'));
  expectDeny('cd ~/.claude; sed p .c*', B3('.c*', 'signin'));
  for (const c of ['ls *.ts', 'ls app/*', 'ls *', 'ls ?env', 'echo "*.env"', 'ls [.]env*']) expectPass(c);
});

test('EZD-280 T6 unreadable words (AC-EZD-280-1, AC-EZD-280-3)', () => {
  expectDeny("sed p $'\\x2eenv.local'", B2('\\x2eenv.local'));
  expectDeny('sed p [abc', B2('[abc'));
  expectPass("printf $'a\\n'");
  expectPass('git commit -m "fix [WIP"');
});

test('EZD-280 T7 test -f exemption (AC-EZD-280-1, AC-EZD-280-3)', () => {
  for (const c of ['test -f .env.local', '[ -f .ENV.local ]', 'test -f scripts/launcher.config.json && echo found', 'test -f app/creds > /dev/null']) expectPass(c);
  expectDeny('test -f .env.local && sed p .env.local', B1('.env.local', 'env'));
  expectDeny('test -f .env.local -a -f x', B1('.env.local', 'env'));
  expectDeny('test -f ~/.claude/.credentials.json&&cat<~/.claude/.credentials.json', B1('~/.claude/.credentials.json', 'signin'));
});

test('EZD-280 T8 non-secret commands stay allowed (AC-EZD-280-3)', () => {
  const rows = [
    'sed -n p README.md', 'cat .env.example', 'cp .env.example /tmp/e', 'grep -n env app/env.ts', 'ls scripts/launcher.mjs',
    'cat launcher.config.json', 'echo .environment', 'ls -la', 'node --test scripts/hooks/secret-bash.test.mjs',
    '{ ls; } > /dev/null', '[[ -n x ]]', 'git commit -m "docs: plan"',
  ];
  assert.equal(rows.length, 12);
  for (const c of rows) expectPass(c);
});

test('EZD-280 T9 a check error fails closed (AC-EZD-280-1)', () => {
  const why = reasonOf(run('ls', 5), 'cwd 5');
  assert.ok(why.startsWith('The secret-file check could not run ('), why);
  assert.ok(why.endsWith('); this command is refused (Q-0461).'), why);
});

test('EZD-280 T10 globReach with tool Bash (AC-EZD-280-1, AC-EZD-280-3)', async () => {
  const { globReach } = await import(modUrl);
  const ctx = { home: '/h', repoRoot: '/r', tool: 'Bash' };
  const rows = [
    ['/r', '.e*', 'env'], ['/r', '.ENV.L*', 'env'], ['/r', '{.env,x}', 'env'],
    ['/r/scripts', '*', 'launcher'], ['/x', 'scripts/*', 'launcher'],
    ['/h/.claude', '.c*', 'signin'],
    ['/r', '.[!E]nv', 'env'],
    ['/r', '?env', null], ['/r', '[.]env', null], ['/r', '*', null], ['/h', '.claude/*', null],
    ['/r', '[abc', 'unreadable'],
  ];
  for (const [rt, g, want] of rows) assert.equal(globReach(rt, g, ctx), want, `Bash ${rt} ${g}`);
  const glob = { ...ctx, tool: 'Glob' };
  assert.equal(globReach('/r', '?env', glob), 'env', 'Glob ?env');
  assert.equal(globReach('/r', '*', glob), 'env', 'Glob *');
});

test('EZD-280 T11 module load failure fails closed (AC-EZD-280-1)', () => {
  const C = tmp + '/copy';
  fs.mkdirSync(C + '/.claude/hooks', { recursive: true });
  fs.copyFileSync(hook, C + '/.claude/hooks/guard-bash.mjs');
  fs.copyFileSync(path.join(root, '.claude/hooks/lib.mjs'), C + '/.claude/hooks/lib.mjs');
  const check = (r, msg) => {
    const why = reasonOf(r, msg);
    assert.ok(why.startsWith('The secret-file check could not run ('), why);
    assert.ok(why.endsWith('); this command is refused (Q-0461).'), why);
  };
  check(run('ls', R, C + '/.claude/hooks/guard-bash.mjs'), 'missing module');
  fs.writeFileSync(C + '/.claude/hooks/secret-paths.mjs', 'export const = ;\n');
  check(run('ls', R, C + '/.claude/hooks/guard-bash.mjs'), 'broken module');
});
