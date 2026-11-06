// EZD-337 (Q-0594 (a), Q-0112): the post-audit security hold. S1-S9 of vault/plans/EZD-337.md section 4.
// vault/tools/security-paths.mjs is imported lazily so a missing module fails each test that needs it, not the whole file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as idle from '../launcher-idle.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sp = () => import(pathToFileURL(path.join(repo, 'vault/tools/security-paths.mjs')).href);
const PR = 'https://github.com/o/r/pull/5';
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const tmp = (p) => realpathSync(mkdtempSync(path.join(os.tmpdir(), p)));
const git = (dir, ...a) => {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const put = (dir, rel, text) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), text);
};

test('EZD-337 S1 list: the shared production-sensitive list (AC-EZD-337-1)', async () => {
  const { SECURITY_PATHS } = await sp();
  assert.deepEqual([...SECURITY_PATHS], ['auth/', 'api/', 'db/', 'middleware', 'migrations', 'billing', '.github/workflows/', 'scripts/release/',
    'scripts/backup/', 'scripts/hosting/', 'supabase/migrations/', 'supabase/bootstrap/', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc']);
  assert.equal(Object.isFrozen(SECURITY_PATHS), true);
});

test('EZD-337 S2 matcher: isSecurityPath (AC-EZD-337-1)', async () => {
  const { isSecurityPath } = await sp();
  for (const f of ['supabase/migrations/1.sql', 'app/src/auth/x.ts', 'AUTH/x.ts', '.github/workflows/ci.yml', 'app/package.json', 'scripts/release/a.mjs'])
    assert.equal(isSecurityPath(f), true, f);
  for (const f of ['vault/tickets/gates/phase-02.md', 'app/src/author/x.ts', 'app/src/oauth/x.ts', 'docs/architecture.md'])
    assert.equal(isSecurityPath(f), false, f);
});

test('EZD-337 S3 one source: gate.mjs takes the list from vault/tools/security-paths.mjs (AC-EZD-337-1)', () => {
  const text = readFileSync(path.join(repo, 'scripts/gate.mjs'), 'utf8');
  assert.ok(text.includes("from '../vault/tools/security-paths.mjs'"), 'gate.mjs lacks the import');
  for (const gone of ['const SECURITY_PATHS', 'securityRes', 'escapeRe']) assert.ok(!text.includes(gone), `gate.mjs still has ${gone}`);
});

test('EZD-337 S4 gate flags: the real gate flags sensitive files by raw name and both sides of a move (AC-EZD-337-1)', () => {
  const fx = tmp('ezd337-fx-');
  git(fx, 'init', '-q', '-b', 'develop');
  put(fx, 'supabase/migrations/1.sql', 'x');
  git(fx, 'add', '-A');
  git(fx, 'commit', '-q', '-m', 'base');
  git(fx, 'checkout', '-q', '-b', 't');
  put(fx, 'auth/café.ts', 'x');
  put(fx, 'app/readme.md', 'x');
  mkdirSync(path.join(fx, 'notes'));
  git(fx, 'mv', 'supabase/migrations/1.sql', 'notes/1.sql');
  git(fx, 'add', '-A');
  git(fx, 'commit', '-q', '-m', 'change');
  const t = tmp('ezd337-gt-');
  const env = { ...process.env, TMP: t, TEMP: t, TMPDIR: t };
  for (const k of ['EZD_TEST_GREP', 'EZD_PHASE', 'EZD_TEST_SCOPE', 'NODE_TEST_CONTEXT', 'EZD_LANE', 'SUPABASE_WORKDIR']) delete env[k];
  const r = spawnSync(process.execPath, [path.join(repo, 'scripts/gate.mjs'), fx], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = r.stdout.split('\n').map((l) => l.trim());
  assert.ok(lines.includes('SECURITY FLAG: auth/café.ts'), r.stdout);
  assert.ok(lines.includes('SECURITY FLAG: supabase/migrations/1.sql'), r.stdout);
  const flags = lines.filter((l) => l.startsWith('SECURITY FLAG:'));
  assert.ok(!flags.some((l) => l.includes('app/readme.md') || l.includes('notes/1.sql')), flags.join('\n'));
});

test('EZD-337 S5 splitNames: NUL-separated raw names (AC-EZD-337-1)', async () => {
  const { splitNames } = await sp();
  assert.deepEqual(splitNames('a\0b c\0"q"\0'), ['a', 'b c', '"q"']);
  assert.deepEqual(splitNames(''), []);
});

test('EZD-337 S6 reviewedBase: the last valid pass line, else Develop at PR (AC-EZD-337-2)', async () => {
  const { reviewedBase } = await sp();
  const a = `Develop at PR: ${A}\n`;
  assert.deepEqual(reviewedBase(a), { sha: A }, '(a)');
  assert.deepEqual(reviewedBase(`${a}Security pass at: ${B}\nSecurity pass at: ${C}\n`), { sha: C }, '(b)');
  assert.deepEqual(reviewedBase(`${a}Security pass at: abc\n`), { error: 'gate record pass line unreadable' }, '(c)');
  assert.deepEqual(reviewedBase(`${a}security pass at: ${B}\n`), { error: 'gate record pass line unreadable' }, '(d)');
  assert.deepEqual(reviewedBase('PR: x\n'), { error: 'gate record has no Develop at PR commit' }, '(e)');
  assert.deepEqual(reviewedBase('Develop at PR: 1234567\n'), { sha: '1234567' }, '(f)');
});

test('EZD-337 S7 postAuditDelta: the files changed from the reviewed commit to the PR head (AC-EZD-337-1)', async () => {
  const { postAuditDelta } = await sp();
  const dir = tmp('ezd337-repo-');
  git(dir, 'init', '-q', '-b', 'develop');
  put(dir, 'app/a.ts', '1');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'c0');
  const c0 = git(dir, 'rev-parse', 'HEAD');
  put(dir, 'app/a.ts', '2');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'c1');
  const c1 = git(dir, 'rev-parse', 'HEAD');
  put(dir, 'supabase/migrations/2.sql', 'x');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'c2');
  const c2 = git(dir, 'rev-parse', 'HEAD');
  mkdirSync(path.join(dir, 'notes'));
  git(dir, 'mv', 'supabase/migrations/2.sql', 'notes/2.sql');
  git(dir, 'commit', '-q', '-m', 'c3');
  const c3 = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-q', '--orphan', 'side');
  git(dir, 'rm', '-rf', '-q', '.');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 's');
  const s = git(dir, 'rev-parse', 'HEAD');
  const d = (base, head) => postAuditDelta({ cwd: dir, base, head });
  assert.deepEqual(d(c0, c1), { base: c0, head: c1, files: ['app/a.ts'], sensitive: [] }, '(a)');
  const b = d(c0, c2);
  assert.deepEqual(b.sensitive, ['supabase/migrations/2.sql'], '(b)');
  const c = d(c2, c3);
  assert.ok(c.files.includes('notes/2.sql') && c.files.includes('supabase/migrations/2.sql'), `(c) ${JSON.stringify(c)}`);
  assert.deepEqual(c.sensitive, ['supabase/migrations/2.sql'], '(c)');
  assert.deepEqual(d(c1, c1).files, [], '(d)');
  assert.deepEqual(d(s, c3), { error: `${s.slice(0, 7)} is not an ancestor of ${c3.slice(0, 7)}` }, '(e)');
  assert.deepEqual(d('0'.repeat(40), c1), { error: `base commit ${'0'.repeat(40)} not found` }, '(f)');
  assert.deepEqual(d(c0, 'f'.repeat(40)), { error: 'PR head fffffff is not in the local repository' }, '(g)');
  assert.deepEqual(d(c0, null), { error: 'PR head commit unreadable' }, '(h)');
});

test('EZD-337 S8 launcher-idle: the PR waits, their repair kinds and the hard limit (AC-EZD-337-2)', () => {
  const w1 = `none: phase 1 PR auto-merge is on (${PR})`;
  const w2 = `none: phase 1 PR merge held for a security pass of ${A}..${B} (${PR})`;
  const w3 = `none: phase 1 PR merge held: the change since the phase audit is unreadable (${PR}; PR head commit unreadable)`;
  const w4 = `none: phase 1 PR gate is green but not merged (${PR}; head ${A})`;
  assert.equal(idle.AUTO_MERGE_ON_RE.exec(w1)?.[1], PR);
  const g = idle.PR_GREEN_OPEN_RE.exec(w4);
  assert.deepEqual([g?.[1], g?.[2]], [PR, A]);
  const h = idle.SECURITY_HOLD_RE.exec(w2);
  assert.deepEqual([h?.[1], h?.[2], h?.[3]], [A, B, PR]);
  for (const t of [w1, w3, w4]) assert.equal(idle.SECURITY_HOLD_RE.test(t), false, t);
  const dec = (next) => idle.repairDecision({ next, state: null, consecutive: 0 });
  for (const t of [w1, w4]) assert.deepEqual(dec(t), { action: 'skip', why: 'josh' }, t);
  assert.equal(dec(w2).action, 'repair');
  assert.equal(dec(w2).kind, 'security');
  assert.equal(dec(w3).kind, 'waiting');
  for (const t of [w1, w4]) assert.equal(idle.idleAction({ stopExists: false, next: t }).notify, null, t);
  assert.equal('AUTO_MERGE_OFF_RE' in idle, false);
  assert.equal(idle.REPAIR_UNIT_RE.test('repair-security'), false);
  assert.equal(typeof idle.repairForbidden('vault/tools/security-paths.mjs'), 'string');
});

test('EZD-337 S9 guard: sessions never merge the phase PR; only --disable-auto is allowed (AC-EZD-337-2)', () => {
  const hook = path.join(repo, '.claude/hooks/guard-bash.mjs');
  const run = (command) => {
    const r = spawnSync('node', [hook], { input: JSON.stringify({ tool_input: { command } }), env: { ...process.env, CLAUDE_PROJECT_DIR: repo }, encoding: 'utf8' });
    const denied = r.stdout.includes('"deny"');
    return { denied, reason: denied ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason : '' };
  };
  const WHY = 'Sessions never merge the phase PR or turn on auto-merge; the launcher merges it after its post-audit security check (Q-0594). Allowed: gh pr merge <url> --disable-auto.';
  for (const c of [`gh pr merge ${PR} --merge`, 'gh pr merge 5 --auto --merge', `gh pr merge ${PR} --merge --match-head-commit ${A}`]) {
    const r = run(c);
    assert.equal(r.denied, true, c);
    assert.equal(r.reason, WHY, c);
  }
  for (const c of [`gh pr merge ${PR} --disable-auto`, `gh pr view ${PR}`]) assert.equal(run(c).denied, false, c);
});
