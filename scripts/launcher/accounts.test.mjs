// EZD-378 U1-U10, A1-A5, L1-L5, P1-P4 (vault/plans/EZD-378.md section 4): the launcher runs every unit on one of two account
// folders, switches at a limit message and pauses when no account can start a unit. Everything runs against fake commands in
// temporary folders: no live claude, no real `auth status`, no real account folder (rule 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLauncherRoot, runLauncher, why, mkTmp, repo } from './test-utils/harness.mjs';

const W = "You've hit your weekly limit \u00b7 resets Mon 12:00am";
const S = "You've hit your session limit \u00b7 resets 3:45pm";
const HOLD = 'none: budget hold (test)';
const BUILD = 'build EZD-901';
const BUILD_PROMPT = '/build-ticket EZD-901';
const LIMIT_NOTICE = (unit) =>
  new RegExp('^EZ Draft: limit error during ' + unit + ': raw text saved to vault/handoff/limit-error-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z\\.txt$');
const STOP_TEXT = (key) => `EZ Draft: launcher stopped: ${key} started 4 times in 10 minutes; no new unit starts until the launcher is restarted`;
const STRAY = { CLAUDE_CODE_OAUTH_TOKEN: 'ezd378-oauth', ANTHROPIC_API_KEY: 'ezd378-key', ANTHROPIC_AUTH_TOKEN: 'ezd378-token', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CONFIG_DIR: '/nonexistent/ezd378' };
const STRIKE_STUB = [
  'export const strikeExempt = () => false;',
  "export const strikeVerdict = () => 'strike';",
  "export const recordStrike = (key, verdict, o) => { writeFileSync(path.join(root, 'strikes.jsonl'), JSON.stringify({ key, verdict, outcome: o?.outcome ?? null }) + '\\n', { flag: 'a' }); return 1; };",
  '',
].join('\n');

// The first local 15:45:00.000 strictly after t (the rule of parseWhen in scripts/run.mjs).
const next1545 = (t) => {
  const d = new Date(t);
  d.setHours(15, 45, 0, 0);
  if (d.getTime() <= t) d.setDate(d.getDate() + 1);
  return d;
};
// The first local Monday 00:00:00.000 strictly after t.
const nextMon0 = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() !== 1 || d.getTime() <= t) d.setDate(d.getDate() + 1);
  return d;
};

const idle = () => import(pathToFileURL(path.join(repo, 'scripts/launcher-idle.mjs')).href);
const iso = (ms) => new Date(ms).toISOString();
const T = new Date(2026, 10, 10, 14, 0).getTime();
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const A = mkTmp('ezd378-acct-');
const B = mkTmp('ezd378-acct-');

// The repo's unit-sandbox.json with the credentials file of each account folder added to denyRead.
const sandboxWith = (dirs) => {
  const s = JSON.parse(readFileSync(path.join(repo, 'scripts/unit-sandbox.json'), 'utf8'));
  s.sandbox.filesystem.denyRead.push(...dirs.map((d) => d + '/.credentials.json'));
  return JSON.stringify(s);
};

// A launcher root with the accounts file, the sandbox file, the fake sign-in answers and (o.state) the accounts state file.
// o.accounts: the rows of the accounts file (default acct-1 = A, acct-2 = B). o.more: more files, by relative path.
const acctRoot = (o = {}) =>
  makeLauncherRoot({
    ...o,
    files: () => ({
      'scripts/launcher-accounts.json': JSON.stringify({ accounts: o.accounts ?? [{ id: 'acct-1', dir: A }, { id: 'acct-2', dir: B }] }),
      'scripts/unit-sandbox.json': sandboxWith([A, B]),
      'fake-auth.json': JSON.stringify(o.auth ?? {}),
      ...(o.state ? { 'logs/accounts-state.json': JSON.stringify(o.state) } : {}),
      ...(o.more ?? {}),
    }),
  });
// Lanes on (as `lanes` in limit-loop.test.mjs): nextUnits from the stub.
const lanesAcct = ({ units, ...o } = {}) => {
  const root = acctRoot({ ...o, stub: { nextUnits: units, next: [{ text: HOLD }] } });
  mkdirSync(root.at('tmp'), { recursive: true });
  writeFileSync(root.at('vault/handoff/LANES.json'), JSON.stringify({ lanes: 6, build_lanes: 3, set_at: new Date().toISOString() }));
  return root;
};
const runLanes = (root, o = {}) => runLauncher(root, { ...o, env: { TMPDIR: root.at('tmp'), EZD_LANE: '', SUPABASE_WORKDIR: '', ...o.env } });
const rows = (root) => readFileSync(root.at('vault/cost/log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const accState = (root) => JSON.parse(readFileSync(root.at('logs/accounts-state.json'), 'utf8'));
const fix = (n) => ({ prompt: `/build-ticket EZD-90${n}`, writes: [`d90${n}`], usd: 1 });
const three = [{ text: 'build EZD-901', until: 'd901' }, { text: 'build EZD-902', until: 'd902' }, { text: 'build EZD-903', until: 'd903' }, { text: HOLD }];
const NOT_SIGNED = `EZ Draft: account acct-2 cannot start units: not signed in (claude auth status exit 1). Units go to the other accounts. To sign in once: CLAUDE_CONFIG_DIR=${B} claude`;

const SHAPE = 'needs an "accounts" list of at least 2 accounts and no other key';
const SBX = 'scripts/unit-sandbox.json cannot be read';
const dirText = (n, d) => `account ${n}: dir "${d}" must start with ~/ or /, with no . or .. part and no trailing /`;
const insideText = (n, d, e) => `account ${n}: dir "${d}" is inside "${e}", which units may write (scripts/unit-sandbox.json allowWrite)`;

test('EZD-378 U1 vars: the seven names that override sign-in, in order, frozen (AC-EZD-378-1)', async () => {
  const { AUTH_OVERRIDE_VARS } = await idle();
  assert.deepEqual(AUTH_OVERRIDE_VARS, ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_PROFILE']);
  assert.equal(Object.isFrozen(AUTH_OVERRIDE_VARS), true);
});

test('EZD-378 U2 env: stray sign-in variables are removed, the account folder or the key is set, the input is not changed (AC-EZD-378-1)', async () => {
  const { unitAuthEnv } = await idle();
  const input = { ...STRAY, PATH: 'p' };
  assert.deepEqual(unitAuthEnv(input, { mode: 'plan', account: { path: A } }), { PATH: 'p', CLAUDE_CONFIG_DIR: A });
  assert.deepEqual(unitAuthEnv(input, { mode: 'plan' }), { PATH: 'p' });
  assert.deepEqual(unitAuthEnv(input, { mode: 'api', account: { path: A }, apiKey: 'k' }), { PATH: 'p', ANTHROPIC_API_KEY: 'k' });
  assert.deepEqual(input, { ...STRAY, PATH: 'p' });
});

test('EZD-378 U3 read ok: two accounts with their paths, and no file means off (AC-EZD-378-1)', async () => {
  const { readAccounts } = await idle();
  const H = mkTmp('ezd378-home-');
  const root = mkTmp('ezd378-root-');
  mkdirSync(path.join(root, 'scripts'));
  writeFileSync(path.join(root, 'scripts/launcher-accounts.json'), JSON.stringify({ accounts: [{ id: 'acct-1', dir: '~/.claude-acct-1' }, { id: 'acct-2', dir: '~/.claude-acct-2' }] }, null, 2) + '\n');
  writeFileSync(path.join(root, 'scripts/unit-sandbox.json'), sandboxWith(['~/.claude-acct-1', '~/.claude-acct-2']));
  assert.deepEqual(readAccounts(root, { home: H }), {
    on: true,
    accounts: [
      { id: 'acct-1', dir: '~/.claude-acct-1', path: H + '/.claude-acct-1' },
      { id: 'acct-2', dir: '~/.claude-acct-2', path: H + '/.claude-acct-2' },
    ],
  });
  assert.deepEqual(readAccounts(mkTmp('ezd378-empty-'), { home: H }), { on: false });
});

test('EZD-378 U4 read refusals: each bad accounts file or sandbox file gives its own problem text (AC-EZD-378-1)', async () => {
  const { readAccounts } = await idle();
  const H = mkTmp('ezd378-home-');
  const ok = [{ id: 'acct-1', dir: '~/.claude-acct-1' }, { id: 'acct-2', dir: '~/.claude-acct-2' }];
  const with1 = (r1) => [r1, ok[1]];
  // [file (object or raw text) or a function of the root, sandbox override (object or raw text) or undefined, expected problem]
  const cases = [
    ['{', undefined, 'is not valid JSON'],
    [[], undefined, SHAPE],
    [{ accounts: [ok[0]] }, undefined, SHAPE],
    [{ accounts: ok, extra: 1 }, undefined, SHAPE],
    [{ accounts: [ok[0], { id: 'acct-2', dir: '~/.claude-acct-2', x: 1 }] }, undefined, 'account 2 needs exactly an "id" and a "dir"'],
    [{ accounts: with1({ id: 'Acct 1', dir: '~/.claude-acct-1' }) }, undefined, 'account 1: id "Acct 1" must be 1 to 32 lower-case letters, digits or dashes, starting with a letter or digit'],
    [{ accounts: with1({ id: 'acct-1', dir: 'rel/x' }) }, undefined, dirText(1, 'rel/x')],
    [{ accounts: with1({ id: 'acct-1', dir: '~/a/../b' }) }, undefined, dirText(1, '~/a/../b')],
    [{ accounts: with1({ id: 'acct-1', dir: '/x/' }) }, undefined, dirText(1, '/x/')],
    [(root) => ({ accounts: with1({ id: 'acct-1', dir: root + '/acct' }) }), undefined, (root) => insideText(1, root + '/acct', './')],
    [{ accounts: with1({ id: 'acct-1', dir: '~/w/a' }) }, undefined, insideText(1, '~/w/a', '~/w')],
    [{ accounts: ok }, { allowWrite: ['w'] }, 'scripts/unit-sandbox.json allowWrite entry "w" cannot be read'],
    [{ accounts: [ok[0], { id: 'acct-1', dir: '~/.claude-acct-2' }] }, undefined, 'account 2: id "acct-1" is used twice'],
    [{ accounts: [{ id: 'acct-1', dir: '~/x' }, { id: 'acct-2', dir: H + '/x' }] }, undefined, `account 2: dir "${H}/x" is used twice`],
    [{ accounts: ok }, '{', SBX],
    [{ accounts: ok }, { denyRead: ['~/.claude-acct-1/.credentials.json'] }, 'scripts/unit-sandbox.json denyRead lacks "~/.claude-acct-2/.credentials.json"'],
    [{ accounts: ok }, { denyRead: {} }, SBX],
    [{ accounts: ok }, { allowWrite: './' }, SBX],
    [{ accounts: with1({ id: 'acct-1', dir: '~/' }) }, undefined, dirText(1, '~/')],
    [{ accounts: with1({ id: 'acct-1', dir: '' }) }, undefined, dirText(1, '')],
  ];
  for (const [i, [file, sbx, want]] of cases.entries()) {
    const root = mkTmp('ezd378-read-');
    mkdirSync(path.join(root, 'scripts'));
    const f = typeof file === 'function' ? file(root) : file;
    writeFileSync(path.join(root, 'scripts/launcher-accounts.json'), typeof f === 'string' ? f : JSON.stringify(f));
    const dirs = Array.isArray(f?.accounts) ? f.accounts.map((r) => r?.dir).filter((d) => typeof d === 'string') : [];
    const fs0 = { denyRead: dirs.map((d) => d + '/.credentials.json'), allowWrite: ['./', '~/w'] };
    const sandbox = typeof sbx === 'string' ? sbx : JSON.stringify({ sandbox: { filesystem: { ...fs0, ...(sbx ?? {}) } } });
    writeFileSync(path.join(root, 'scripts/unit-sandbox.json'), sandbox);
    const got = readAccounts(root, { home: H });
    assert.deepEqual(got, { on: true, problem: typeof want === 'function' ? want(root) : want }, `case ${i + 1}`);
  }
});

test('EZD-378 U5 sign-in verdict: each way a folder is not signed in to a subscription has its own reason (AC-EZD-378-1)', async () => {
  const { signInVerdict } = await idle();
  const acc = { path: A };
  const v = (r) => signInVerdict(r, acc);
  assert.deepEqual(v({ error: { code: 'ENOENT' } }), { ok: false, why: 'claude auth status did not run (ENOENT)' });
  assert.deepEqual(v({ status: 1, stdout: '{"authMethod":"none"}' }), { ok: false, why: 'not signed in (claude auth status exit 1)' });
  assert.deepEqual(v({ status: 0, stdout: 'x' }), { ok: false, why: 'claude auth status printed no JSON' });
  assert.deepEqual(v({ status: 0, stdout: '{"authMethod":"api_key","configDirectory":"' + A + '"}' }), { ok: false, why: 'signed in with api_key, not a claude.ai subscription' });
  assert.deepEqual(v({ status: 0, stdout: '{"authMethod":"claude.ai"}' }), { ok: false, why: 'claude auth status names no configDirectory (Claude Code 2.1.268 or later is needed)' });
  assert.deepEqual(v({ status: 0, stdout: '{"authMethod":"claude.ai","configDirectory":"/elsewhere"}' }), { ok: false, why: `claude auth status uses /elsewhere, not ${A}` });
  assert.deepEqual(v({ status: 0, stdout: 'noise {"authMethod":"claude.ai","configDirectory":"' + A + '"}' }), { ok: true, why: null });
});

test('EZD-378 U6 parseReset: the reset times Claude Code prints become the next such time (AC-EZD-378-2)', async () => {
  const { parseReset } = await idle();
  const at = (...a) => new Date(...a).getTime();
  const got = ['3:45pm', '1:00pm', '12:30pm', 'Tue 3pm', 'Tue 2:00pm', 'Mon 12:00am', 'Monday 9am', ' 3:45PM ', '13:00pm', '0:30am', '2026-11-12T05:00:00.000Z', '2020-01-01T00:00:00Z', 'soon', '', null, 42].map((s) => parseReset(s, T));
  assert.deepEqual(got, [
    at(2026, 10, 10, 15, 45),
    at(2026, 10, 11, 13, 0),
    at(2026, 10, 11, 12, 30),
    at(2026, 10, 10, 15, 0),
    at(2026, 10, 17, 14, 0),
    at(2026, 10, 16, 0, 0),
    at(2026, 10, 16, 9, 0),
    at(2026, 10, 10, 15, 45),
    null,
    null,
    Date.parse('2026-11-12T05:00:00.000Z'),
    null,
    null,
    null,
    null,
    null,
  ]);
});

test('EZD-378 U7 spend: estimated dollars per account over the last 7 days, the boundary excluded (AC-EZD-378-1)', async () => {
  const { accountSpend } = await idle();
  const line = (o) => JSON.stringify(o);
  const lines = [
    line({ ts: iso(T - 1000), account: 'acct-1', est_usd: 3 }),
    line({ ts: iso(T - 604_800_000), account: 'acct-1', est_usd: 2 }),
    line({ ts: iso(T - 10), account: 'acct-2', est_usd: 1.5 }),
    line({ ts: iso(T), est_usd: 9 }),
    'not json',
    line({ ts: iso(T), account: 'default', est_usd: 4 }),
  ];
  assert.deepEqual(accountSpend(lines, T), { 'acct-1': 3, 'acct-2': 1.5, default: 4 });
});

test('EZD-378 U8 pick: the account with the least spend, then the fewest running, then file order; none free gives the earliest return (AC-EZD-378-2)', async () => {
  const { pickAccount } = await idle();
  const accounts = [{ id: 'acct-1' }, { id: 'acct-2' }];
  const pick = (o) => pickAccount({ accounts, now: T, ...o });
  const first = pick({});
  assert.equal(first.account.id, 'acct-1');
  assert.equal(first.until, null);
  assert.deepEqual(first.parts, []);
  assert.equal(pick({ spend: { 'acct-1': 2, 'acct-2': 1 } }).account.id, 'acct-2');
  assert.equal(pick({ spend: { 'acct-1': 1, 'acct-2': 1 }, running: { 'acct-1': 1 } }).account.id, 'acct-2');
  assert.equal(pick({ state: { 'acct-1': { restingUntil: iso(T + 1000) } } }).account.id, 'acct-2');
  assert.equal(pick({ state: { 'acct-1': { restingUntil: iso(T) } } }).account.id, 'acct-1');
  assert.equal(pick({ state: { 'acct-1': { restingUntil: 'garbage' } } }).account.id, 'acct-1');
  assert.deepEqual(pick({ state: { 'acct-1': { restingUntil: iso(T + 5000) }, 'acct-2': { restingUntil: iso(T + 3000) } } }), {
    account: null,
    until: T + 3000,
    parts: ['acct-1 resting until ' + iso(T + 5000), 'acct-2 resting until ' + iso(T + 3000)],
  });
  assert.deepEqual(pick({ state: { 'acct-1': { restingUntil: iso(T + 5000) } }, blocked: { 'acct-2': T + 300000 } }), {
    account: null,
    until: T + 5000,
    parts: ['acct-1 resting until ' + iso(T + 5000), 'acct-2 not signed in'],
  });
  assert.equal(pick({ blocked: { 'acct-1': T } }).account.id, 'acct-1');
});

test('EZD-378 U9 state file: rests an account until the later time, written whole, bad file counts as empty (AC-EZD-378-2)', async () => {
  const { readAccountState, restAccount } = await idle();
  const d = path.join(mkTmp('ezd378-state-'), 'logs');
  const f = path.join(d, 'accounts-state.json');
  assert.deepEqual(readAccountState(d), {});
  restAccount(d, 'acct-1', T + 5000, 'n', T);
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { 'acct-1': { restingUntil: iso(T + 5000), note: 'n', at: iso(T) } });
  restAccount(d, 'acct-1', T + 1000, 'n', T);
  assert.equal(JSON.parse(readFileSync(f, 'utf8'))['acct-1'].restingUntil, iso(T + 5000));
  writeFileSync(f, '[]');
  assert.deepEqual(readAccountState(d), {});
  assert.equal(existsSync(f + '.tmp'), false);
});

test('EZD-378 U10 texts: the sign-in notice and the pause notice (AC-EZD-378-3)', async () => {
  const { accountSignInText, accountsPausedText } = await idle();
  assert.equal(accountSignInText({ id: 'acct-2', path: B }, 'w'), `account acct-2 cannot start units: w. Units go to the other accounts. To sign in once: CLAUDE_CONFIG_DIR=${B} claude`);
  assert.equal(accountsPausedText(['x', 'y'], T), `launcher paused: no account can start a unit (x, y); the next try is at ${iso(T)}`);
});

test('EZD-378 U11 recovered account: only a configDir that is a listed account folder is trusted from an in-flight record (AC-EZD-378-1)', async () => {
  const { recoveredAccount } = await idle();
  const ACC = [{ id: 'acct-1', dir: '~/a', path: A }, { id: 'acct-2', dir: '~/b', path: B }];
  assert.deepEqual(recoveredAccount({ configDir: A, account: 'acct-1' }, ACC), { configDir: A, account: 'acct-1' });
  assert.deepEqual(recoveredAccount({ configDir: '/tmp/planted', account: 'acct-1' }, ACC), { configDir: undefined, account: 'acct-1' });
  assert.deepEqual(recoveredAccount({ configDir: B, account: 'acct-9' }, ACC), { configDir: B, account: 'default' });
  assert.deepEqual(recoveredAccount({ account: 'api' }, ACC), { configDir: undefined, account: 'api' });
  assert.deepEqual(recoveredAccount({}, ACC), { configDir: undefined, account: 'default' });
  assert.deepEqual(recoveredAccount({ configDir: A, account: 'default' }, []), { configDir: undefined, account: 'default' });
});

test('EZD-378 A1 every unit on an account: the least-spent account first, a sign-in check once per account, no stray variable (AC-EZD-378-1)', async () => {
  const root = acctRoot({ stub: { next: three }, rules: [fix(1), fix(2), fix(3)] });
  const r = await runLauncher(root, { env: STRAY });
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.calls.map((c) => c.configDir), [A, B, A], why(r));
  for (const c of r.calls) assert.deepEqual(c.authVars, [], why(r));
  assert.deepEqual(r.authCalls, [{ configDir: A, authVars: [] }, { configDir: B, authVars: [] }], why(r));
  assert.deepEqual(rows(root).map((x) => x.account), ['acct-1', 'acct-2', 'acct-1'], why(r));
  assert.match(r.log, new RegExp(`^\\[run \\S+\\] accounts: acct-1 \\(${reEsc(A)}\\), acct-2 \\(${reEsc(B)}\\)$`, 'm'), why(r));
  assert.deepEqual(r.notified, [], why(r));
});

test('EZD-378 A2 default mode: without the accounts file no folder is set and the row says default (AC-EZD-378-1)', async () => {
  const root = makeLauncherRoot({ stub: { next: [{ text: BUILD, until: 'd' }, { text: HOLD }] }, rules: [{ prompt: BUILD_PROMPT, writes: ['d'] }] });
  const r = await runLauncher(root, { env: STRAY });
  assert.equal(r.status, 0, why(r));
  assert.equal(r.calls[0].configDir, null, why(r));
  assert.deepEqual(r.calls[0].authVars, [], why(r));
  assert.equal(existsSync(root.at('auth-calls.jsonl')), false, why(r));
  assert.equal(rows(root)[0].account, 'default', why(r));
});

test('EZD-378 A3 api mode: no account is picked, only the API key is set (AC-EZD-378-1)', async () => {
  const root = acctRoot({ config: { auth_mode: 'api', api_key: 'sk-ant-api03-ezd378-fake' }, stub: { next: [{ text: BUILD, until: 'd' }, { text: HOLD }] }, rules: [{ prompt: BUILD_PROMPT, writes: ['d'] }] });
  const r = await runLauncher(root, { env: STRAY });
  assert.equal(r.status, 0, why(r));
  assert.equal(r.calls[0].configDir, null, why(r));
  assert.deepEqual(r.calls[0].authVars, ['ANTHROPIC_API_KEY'], why(r));
  assert.equal(existsSync(root.at('auth-calls.jsonl')), false, why(r));
  const row = rows(root)[0];
  assert.equal(row.account, 'api', why(r));
  assert.equal(row.auth, 'api', why(r));
});

test('EZD-378 A4 bad file stops: a bad accounts file stops the launcher before any unit, with one notice (AC-EZD-378-1)', async () => {
  const root = acctRoot({ accounts: [{ id: 'acct-1', dir: A }] });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, [], why(r));
  assert.deepEqual(r.notified, ['EZ Draft: launcher stopped: scripts/launcher-accounts.json: needs an "accounts" list of at least 2 accounts and no other key'], why(r));
});

test('EZD-378 A5 not signed in: an account that is not signed in gets one notice and the units go to the other (AC-EZD-378-1)', async () => {
  const root = acctRoot({ auth: { [B]: { exit: 1 } }, stub: { next: [{ text: 'build EZD-901', until: 'd901' }, { text: 'build EZD-902', until: 'd902' }, { text: HOLD }] }, rules: [fix(1), fix(2)] });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.calls.map((c) => c.configDir), [A, A], why(r));
  assert.deepEqual(r.authCalls.map((c) => c.configDir), [A, B], why(r));
  assert.deepEqual(r.notified, [NOT_SIGNED], why(r));
});

const weeklyRoot = (resultA = W) =>
  acctRoot({
    ntExtra: STRIKE_STUB,
    stub: { next: [{ text: BUILD, until: 'done' }, { text: HOLD }] },
    rules: [
      { prompt: BUILD_PROMPT, configDir: A, exit: 1, result: resultA },
      { prompt: BUILD_PROMPT, configDir: B, writes: ['done'] },
    ],
  });

test('EZD-378 L1 weekly limit switches: only that account rests, the unit goes to the other with no hold and no retry (AC-EZD-378-2)', async () => {
  const root = weeklyRoot();
  const t0 = Date.now();
  const r = await runLauncher(root);
  const t1 = Date.now();
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, [BUILD_PROMPT, BUILD_PROMPT], why(r));
  assert.deepEqual(r.calls.map((c) => c.configDir), [A, B], why(r));
  assert.equal(existsSync(root.at('vault/handoff/BUDGET_HOLD.md')), false, why(r));
  assert.equal(existsSync(root.at('vault/handoff/last-failure.json')), false, why(r));
  assert.deepEqual(r.strikes, [{ key: BUILD, verdict: 'strike', outcome: 'ok' }], why(r));
  const until = accState(root)['acct-1'].restingUntil;
  assert.ok([iso(nextMon0(t0).getTime()), iso(nextMon0(t1).getTime())].includes(until), `restingUntil ${until}\n${why(r)}`);
  assert.ok(r.log.includes(`account acct-1 hit a weekly limit during ${BUILD}; resting until ${until}; the next unit goes to another account`), why(r));
  assert.doesNotMatch(r.log, /retrying/, why(r));
  assert.equal(r.notified.length, 1, why(r));
  assert.match(r.notified[0], LIMIT_NOTICE(BUILD), why(r));
});

test('EZD-378 L2 lanes session limit: the lane unit goes to the other account and no window pause is written (AC-EZD-378-2)', async () => {
  const P = '/build-ticket EZD-9401';
  const root = lanesAcct({
    ntExtra: STRIKE_STUB,
    units: [{ unit: 'build', arg: 'EZD-9401', resume: false, runs: 2 }],
    rules: [
      { prompt: P, configDir: A, exit: 1, result: S },
      { prompt: P, configDir: B },
    ],
  });
  const t0 = Date.now();
  const r = await runLanes(root);
  const t1 = Date.now();
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.calls.map((c) => c.configDir), [A, B], why(r));
  assert.equal(existsSync(root.at('vault/handoff/WINDOW_PAUSE.md')), false, why(r));
  const until = accState(root)['acct-1'].restingUntil;
  assert.ok([iso(next1545(t0).getTime()), iso(next1545(t1).getTime())].includes(until), `restingUntil ${until}\n${why(r)}`);
  assert.deepEqual(r.strikes.map((s) => s.outcome), ['ok'], why(r));
});

test('EZD-378 L3 no reset time: a limit message without one rests the account 30 minutes (AC-EZD-378-2)', async () => {
  const root = weeklyRoot("You've hit your Opus limit");
  const t0 = Date.now();
  const r = await runLauncher(root);
  const t1 = Date.now();
  assert.deepEqual(r.calls.map((c) => c.configDir), [A, B], why(r));
  const at = Date.parse(accState(root)['acct-1'].restingUntil);
  assert.ok(at >= t0 + 1_800_000 && at <= t1 + 1_800_000, `restingUntil ${at - t0}\n${why(r)}`);
});

test('EZD-378 L4 control: a plain error is no switch, the unit restarts on the same account until the start-loop stop (AC-EZD-378-2)', async () => {
  const root = acctRoot({ ntExtra: STRIKE_STUB, stub: { next: [{ text: BUILD }] }, rules: [{ prompt: BUILD_PROMPT, exit: 1, turns: 2 }] });
  const r = await runLauncher(root);
  assert.equal(r.prompts.length, 4, why(r));
  assert.deepEqual(r.calls.map((c) => c.configDir), [A, A, A, A], why(r));
  assert.deepEqual(r.strikes.map((s) => s.outcome), ['error:success', 'error:success', 'error:success', 'error:success'], why(r));
  assert.equal(existsSync(root.at('logs/accounts-state.json')), false, why(r));
  assert.deepEqual(r.notified, [STOP_TEXT(BUILD)], why(r));
});

test('EZD-378 L5 state write fails: the launcher stops with a notice instead of starting more units (AC-EZD-378-2)', async () => {
  const root = acctRoot({
    ntExtra: STRIKE_STUB,
    stub: { next: [{ text: BUILD, until: 'done' }, { text: HOLD }] },
    rules: [
      { prompt: BUILD_PROMPT, configDir: A, exit: 1, result: W },
      { prompt: BUILD_PROMPT, configDir: B, writes: ['done'] },
    ],
    more: { 'logs/accounts-state.json/keep': 'x' },
  });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, [BUILD_PROMPT], why(r));
  assert.equal(r.notified.length, 2, why(r));
  assert.match(r.notified[1], /^EZ Draft: launcher stopped: account state not written \(.+\)$/, why(r));
});

const RESTING = () => ({ 'acct-1': { restingUntil: iso(Date.now() + 10 * 86_400_000) } });

test('EZD-378 P1 both resting pause: when the other account rests at its limit too, the launcher waits and tells Josh once (AC-EZD-378-3)', async () => {
  const state = RESTING();
  const root = acctRoot({ state, stub: { next: [{ text: BUILD }] }, rules: [{ prompt: BUILD_PROMPT, configDir: B, exit: 1, result: S }] });
  const t0 = Date.now();
  const r = await runLauncher(root, { timeout: 10000 });
  const t1 = Date.now();
  assert.equal(r.timedOut, true, why(r));
  assert.equal(r.prompts.length, 1, why(r));
  assert.deepEqual(r.calls.map((c) => c.configDir), [B], why(r));
  assert.equal(r.state?.state, 'limit-wait', why(r));
  assert.ok([iso(next1545(t0).getTime()), iso(next1545(t1).getTime())].includes(r.state?.until), `until ${r.state?.until}\n${why(r)}`);
  assert.equal(r.notified.length, 2, why(r));
  assert.match(r.notified[0], LIMIT_NOTICE(BUILD), why(r));
  assert.equal(
    r.notified[1],
    `EZ Draft: launcher paused: no account can start a unit (acct-1 resting until ${state['acct-1'].restingUntil}, acct-2 resting until ${r.state?.until}); the next try is at ${r.state?.until}`,
    why(r),
  );
});

test('EZD-378 P2 --once: with both resting nothing starts and the log says why (AC-EZD-378-3)', async () => {
  const now = Date.now();
  const root = acctRoot({ state: { 'acct-1': { restingUntil: iso(now + 7_200_000) }, 'acct-2': { restingUntil: iso(now + 3_600_000) } }, stub: { next: [{ text: BUILD }] } });
  const r = await runLauncher(root, { args: ['--once'] });
  assert.deepEqual(r.prompts, [], why(r));
  assert.deepEqual(r.notified, [], why(r));
  assert.match(r.log, /build EZD-901: not started: launcher paused: no account can start a unit \(acct-1 resting until \S+, acct-2 resting until (\S+)\); the next try is at \1 \(--once\)$/m, why(r));
});

test('EZD-378 P3 lanes both resting: no lane starts, the pause is recorded and Josh is told once (AC-EZD-378-3)', async () => {
  const now = Date.now();
  const s1 = iso(now + 7_200_000);
  const s2 = iso(now + 3_600_000);
  const root = lanesAcct({ state: { 'acct-1': { restingUntil: s1 }, 'acct-2': { restingUntil: s2 } }, units: [{ unit: 'build', arg: 'EZD-9401', resume: false, runs: 1 }] });
  const r = await runLanes(root, { timeout: 8000 });
  assert.equal(r.timedOut, true, why(r));
  assert.deepEqual(r.prompts, [], why(r));
  assert.equal(r.state?.until, s2, why(r));
  assert.deepEqual(r.notified, [`EZ Draft: launcher paused: no account can start a unit (acct-1 resting until ${s1}, acct-2 resting until ${s2}); the next try is at ${s2}`], why(r));
});

test('EZD-378 P4 resting and not signed in: the pause waits for the next sign-in check (AC-EZD-378-3)', async () => {
  const state = RESTING();
  const root = acctRoot({ state, auth: { [B]: { exit: 1 } }, stub: { next: [{ text: BUILD }] } });
  const t0 = Date.now();
  const r = await runLauncher(root, { timeout: 8000 });
  const t1 = Date.now();
  assert.deepEqual(r.prompts, [], why(r));
  assert.equal(r.notified.length, 2, why(r));
  assert.equal(r.notified[0], NOT_SIGNED, why(r));
  const m = r.notified[1].match(new RegExp(`^EZ Draft: launcher paused: no account can start a unit \\(acct-1 resting until ${reEsc(state['acct-1'].restingUntil)}, acct-2 not signed in\\); the next try is at (\\S+)$`));
  assert.ok(m, why(r));
  const at = Date.parse(m[1]);
  assert.ok(at >= t0 + 300000 && at <= t1 + 300000, `next try ${at - t0}\n${why(r)}`);
  assert.equal(at, Date.parse(r.state?.until), why(r));
});
