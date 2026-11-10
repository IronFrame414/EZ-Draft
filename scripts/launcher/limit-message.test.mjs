// EZD-377 L1-L7 (vault/plans/EZD-377.md section 4): the one limit matcher, vault/tools/limit-message.mjs, and the two callers
// that must use it. The documented strings are those of https://code.claude.com/docs/en/errors.md (Usage limits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLedgerCopy } from './test-utils/ledger-copy.mjs';
import { repo } from './test-utils/harness.mjs';

// The module is loaded inside each test, so a missing module fails each test, not the file.
const load = () => import(pathToFileURL(path.join(repo, 'vault/tools/limit-message.mjs')).href);

const W = "You've hit your weekly limit \u00b7 resets Mon 12:00am";
const S = "You've hit your session limit \u00b7 resets 3:45pm";
const O = "You've hit your Opus limit \u00b7 resets 3:45pm";
const N = "You've hit your Sonnet limit \u00b7 resets 3:45pm";
const TEAM = "You've hit your team's shared budget \u00b7 ask your admin to raise it at https://claude.ai/admin-settings/usage";
const SPEND = "You've hit your monthly spend limit \u00b7 raise it at https://claude.ai/settings/usage?from=cc_cli_limit_message";
const WARN = "You've used 85% of your session limit \u00b7 resets 3:45pm";
const UPPER = "YOU'VE HIT YOUR SESSION LIMIT \u00b7 RESETS 3:45PM";
const legacy = (text) => ({ documented: false, scope: null, kind: null, until: null, text });
const doc = (scope, kind, until, text) => ({ documented: true, scope, kind, until, text });

test('EZD-377 L1 documented messages: weekly, session, Opus and Sonnet are read by their own words (AC-EZD-377-1)', async () => {
  const { matchLimit } = await load();
  assert.deepEqual(matchLimit(W), doc('weekly', 'weekly', 'Mon 12:00am', W));
  assert.deepEqual(matchLimit(S), doc('session', 'five-hour', '3:45pm', S));
  assert.deepEqual(matchLimit(O), doc('Opus', 'weekly', '3:45pm', O));
  assert.deepEqual(matchLimit(N), doc('Sonnet', 'weekly', '3:45pm', N));
});

test('EZD-377 L2 variants: curly apostrophe, upper case, surrounding text, no reset time, a bare hour (AC-EZD-377-1)', async () => {
  const { matchLimit } = await load();
  const a = matchLimit(S.replace("'", '\u2019'));
  assert.equal(a.kind, 'five-hour');
  assert.equal(a.until, '3:45pm');
  const b = matchLimit(UPPER);
  assert.equal(b.scope, 'SESSION');
  assert.equal(b.kind, 'five-hour');
  assert.equal(b.until, '3:45PM');
  const c = matchLimit('API Error\n' + S + '\nmore text');
  assert.equal(c.until, '3:45pm');
  assert.equal(c.text, S);
  const d = matchLimit("You've hit your weekly limit");
  assert.equal(d.kind, 'weekly');
  assert.equal(d.until, null);
  assert.equal(d.text, "You've hit your weekly limit");
  const e = matchLimit("You've hit your weekly limit \u00b7 resets 2am");
  assert.equal(e.until, '2am');
});

test('EZD-377 L3 spend and budget messages are documented and weekly (AC-EZD-377-1)', async () => {
  const { matchLimit } = await load();
  const t = matchLimit(TEAM);
  assert.equal(t.documented, true);
  assert.equal(t.scope, "team's shared");
  assert.equal(t.kind, 'weekly');
  assert.equal(t.until, null);
  const s = matchLimit(SPEND);
  assert.equal(s.documented, true);
  assert.equal(s.scope, 'monthly spend');
  assert.equal(s.kind, 'weekly');
  assert.equal(s.until, null);
});

test('EZD-377 L4 not a limit: a warning, a done line, an empty text and non-strings all give null (AC-EZD-377-1)', async () => {
  const { matchLimit } = await load();
  for (const v of [WARN, 'fake unit done', '', undefined, null, 42]) assert.equal(matchLimit(v), null, String(v));
});

test('EZD-377 L5 legacy: a text matching only the old pattern is undocumented, with the first match as its text (AC-EZD-377-1)', async () => {
  const { matchLimit } = await load();
  assert.deepEqual(matchLimit('usage limit reached'), legacy('usage limit'));
  assert.deepEqual(matchLimit('5-hour limit reached'), legacy('limit reached'));
  assert.deepEqual(matchLimit('FAKE-STDERR-193: rate limit (test text)'), legacy('rate limit'));
});

test('EZD-377 L6 one answer: strikeExempt agrees with matchLimit for every string (AC-EZD-377-1)', async () => {
  const { matchLimit } = await load();
  const copy = makeLedgerCopy();
  const nt = await import(pathToFileURL(copy.file('tools/next_ticket.mjs')).href);
  const all = [
    W, S, O, N, S.replace("'", '\u2019'), UPPER, 'API Error\n' + S + '\nmore text', "You've hit your weekly limit",
    "You've hit your weekly limit \u00b7 resets 2am", TEAM, SPEND, WARN, 'fake unit done', '', undefined, null, 42,
    'usage limit reached', '5-hour limit reached', 'FAKE-STDERR-193: rate limit (test text)',
  ];
  for (const s of all) assert.equal(nt.strikeExempt({ outcome: 'error:success', note: s }), matchLimit(s)?.documented === true, String(s));
  for (const s of ['usage limit reached', '5-hour limit reached', 'FAKE-STDERR-193: rate limit (test text)']) assert.equal(nt.strikeExempt({ outcome: 'error:success', note: s }), false, String(s));
  assert.equal(nt.strikeExempt({ outcome: 'error:success', note: S }), true);
  assert.equal(nt.strikeExempt({ outcome: 'ok', note: W }), false);
  assert.equal(nt.strikeExempt({ outcome: 'limit-weekly' }), true);
});

test('EZD-377 L8 mixed messages: a weekly message wins over a session message in either order (AC-EZD-377-1)', async () => {
  const { matchLimit } = await load();
  for (const t of [S + '\n' + W, W + '\n' + S]) {
    const m = matchLimit(t);
    assert.equal(m.kind, 'weekly', t);
    assert.equal(m.scope, 'weekly', t);
    assert.equal(m.until, 'Mon 12:00am', t);
    assert.equal(m.text, W, t);
  }
  const c = matchLimit(S + '\n' + S);
  assert.equal(c.kind, 'five-hour');
  assert.equal(c.text, S);
});

test('EZD-377 L7 one matcher: run.mjs and next_ticket.mjs import it and keep no pattern of their own (AC-EZD-377-1)', () => {
  const run = readFileSync(path.join(repo, 'scripts/run.mjs'), 'utf8');
  const nt = readFileSync(path.join(repo, 'vault/tools/next_ticket.mjs'), 'utf8');
  assert.ok(run.split('\n').some((l) => l.startsWith('import') && l.includes('matchLimit') && l.includes("'../vault/tools/limit-message.mjs'")), 'run.mjs imports matchLimit');
  assert.doesNotMatch(run, /const LIMIT_RE\s*=/);
  assert.ok(nt.split('\n').some((l) => l.startsWith('import') && l.includes('matchLimit') && l.includes("'./limit-message.mjs'")), 'next_ticket.mjs imports matchLimit');
  const i = nt.indexOf('export function strikeExempt');
  assert.ok(i >= 0, 'strikeExempt is exported');
  const j = nt.indexOf('\nexport ', i + 1);
  const body = nt.slice(i, j < 0 ? undefined : j);
  assert.ok(body.includes('matchLimit('), 'strikeExempt calls matchLimit');
  assert.ok(!body.includes('hit your'), 'strikeExempt has no limit text of its own');
});
