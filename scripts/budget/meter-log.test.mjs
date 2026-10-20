// Optimize plan C1 (vault/cost/optimize-plan-2026-10-20.md): token expiry in the probe, three new cost-log fields, and a
// hold written from the dollar proxy that says it is an estimate. Keychain, git and the clock are stubs (CLAUDE.md rule 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tokenExpiry } from '../oauth-usage.mjs';
import { costEntry } from '../cost-log.mjs';
import { writeHold } from '../budget.mjs';

const NOW = new Date('2026-10-20T09:08:52Z');
const TOKEN = 'opt-c1-fixture-token-3b8e';
const tmp = (p) => realpathSync(mkdtempSync(path.join(tmpdir(), p)));
const homeWith = (oauth) => {
  const h = tmp('opt-c1-home-');
  mkdirSync(path.join(h, '.claude'));
  writeFileSync(path.join(h, '.claude/.credentials.json'), JSON.stringify({ claudeAiOauth: oauth }));
  return h;
};
const noKeychain = () => ({ status: 44, stdout: '' });

test('OPT-C1 T1: probe expiry line says expired or valid from the credentials, never the token', () => {
  const past = tokenExpiry({ home: homeWith({ accessToken: TOKEN, expiresAt: Date.parse('2026-10-20T08:00:00Z') }), platform: 'linux', now: NOW });
  assert.equal(past, 'token expiry: 2026-10-20T08:00:00.000Z (expired)');
  const future = tokenExpiry({ home: homeWith({ accessToken: TOKEN, expiresAt: '2026-10-20T12:00:00Z' }), platform: 'linux', now: NOW });
  assert.equal(future, 'token expiry: 2026-10-20T12:00:00.000Z (valid)');
  assert.equal(tokenExpiry({ home: homeWith({ accessToken: TOKEN }), platform: 'linux', now: NOW }), 'token expiry: not in credentials');
  assert.equal(tokenExpiry({ home: homeWith({ accessToken: TOKEN, expiresAt: 'soon' }), platform: 'linux', now: NOW }), 'token expiry: not readable');
  assert.equal(tokenExpiry({ home: tmp('opt-c1-empty-'), platform: 'darwin', exec: noKeychain, now: NOW }), 'token expiry: no credentials');
  const kc = () => ({ status: 0, stdout: JSON.stringify({ claudeAiOauth: { accessToken: TOKEN, expiresAt: Date.parse('2026-10-20T09:00:00Z') } }) });
  const fromKeychain = tokenExpiry({ home: tmp('opt-c1-empty-'), platform: 'darwin', exec: kc, now: NOW });
  assert.equal(fromKeychain, 'token expiry: 2026-10-20T09:00:00.000Z (expired)');
  for (const l of [past, future, fromKeychain]) assert.ok(!l.includes(TOKEN));
});

test('OPT-C1 T2: cost-log row keeps the old fields and adds wall_ms, meter_source and process_rev', () => {
  const parsed = { session_id: 's1', num_turns: 8, duration_ms: 90_000 };
  const row = costEntry({ ts: '2026-10-20T10:24:38.381Z', unit: 'build', ticket: 'EZD-007a', models: ['m'], total: 15.36, fable: 13.5, outcome: 'ok', parsed, startedMs: 1_000, endedMs: 1_341_000, auth: 'plan', meterSource: 'proxy', processRev: '8e656fb' });
  assert.deepEqual(row, {
    ts: '2026-10-20T10:24:38.381Z', unit: 'build', ticket: 'EZD-007a', models: ['m'], est_usd: 15.36, fable_est_usd: 13.5, outcome: 'ok',
    session_id: 's1', num_turns: 8, duration_ms: 90_000, auth: 'plan', wall_ms: 1_340_000, meter_source: 'proxy', process_rev: '8e656fb',
  });
  const bare = costEntry({ ts: 't', unit: 'plan', ticket: 'EZD-1', models: [], total: 0, fable: 0, outcome: 'error', parsed: null, startedMs: 0, endedMs: 5_000, auth: 'plan', meterSource: 'oauth', processRev: null });
  assert.equal(bare.duration_ms, 5_000);
  assert.equal(bare.wall_ms, 5_000);
  assert.equal(bare.process_rev, null);
  assert.equal(bare.session_id, undefined);
});

const proxyMeters = { source: 'proxy', read_at: NOW.toISOString(), five_hour: null, seven_day: { pct: 119, resets_at: '2026-10-26T06:00:00.000Z' }, fable_seven_day: null };
const holdRoot = (usage) => {
  const r = tmp('opt-c1-hold-');
  mkdirSync(path.join(r, 'vault/handoff'), { recursive: true });
  mkdirSync(path.join(r, 'vault/cost'), { recursive: true });
  if (usage) writeFileSync(path.join(r, 'vault/cost/usage.json'), JSON.stringify(usage));
  return r;
};
const hold = (r) => readFileSync(path.join(r, 'vault/handoff/BUDGET_HOLD.md'), 'utf8');

test('OPT-C1 T3: a hold from the dollar proxy says it is an estimate and gives the last real reading', () => {
  const r = holdRoot({ five_hour: { pct: 40 }, seven_day: { pct: 25, resets_at: '2026-10-26T05:59:59.550Z' }, read_at: '2026-10-20T00:34:54.408Z', source: 'oauth' });
  writeHold({ root: r, now: NOW, reason: 'weekly usage reached the hold (119%)', meters: proxyMeters, budget: {}, nextUnit: 'build EZD-007a' });
  const t = hold(r);
  assert.match(t, /^- Estimated: this percent is the cost log against weekly_ceiling_usd_est, not the plan's usage meter\. Check Settings → Usage before acting\.$/m);
  assert.match(t, /^- Last real reading: weekly 25% at 2026-10-20 00:34 UTC \(oauth\), 8\.6 hours before this hold\.$/m);
  assert.match(t, /^- Reason: weekly usage reached the hold \(119%\)$/m);

  const none = holdRoot(null);
  writeHold({ root: none, now: NOW, reason: 'x', meters: proxyMeters, budget: {}, nextUnit: 'n' });
  assert.match(hold(none), /^- Last real reading: none on file\.$/m);
});

test('OPT-C1 T4: a hold from a real meter has no estimate lines', () => {
  const r = holdRoot(null);
  writeHold({ root: r, now: NOW, reason: 'weekly usage reached the hold (82%)', meters: { ...proxyMeters, source: 'oauth', seven_day: { pct: 82, resets_at: '2026-10-26T06:00:00.000Z' } }, budget: {}, nextUnit: 'n' });
  const t = hold(r);
  assert.doesNotMatch(t, /Estimated:/);
  assert.doesNotMatch(t, /Last real reading:/);
  assert.match(t, /source: oauth/);
});
