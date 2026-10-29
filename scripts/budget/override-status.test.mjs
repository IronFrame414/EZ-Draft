// EZD-239 T1-T3: the budget status printout shows an override only while it is for this week; the gates decide the same (vault/plans/EZD-239.md sections 3 and 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overrideActive, applyGates } from '../budget.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEEK = '2030-01-07T07:00:00.000Z';
const PAST_WEEK = '2029-12-31T07:00:00.000Z';
const NOW = new Date('2030-01-09T12:00:00.000Z');
const NEXT_TICKET_STUB = `export const weekStart = () => new Date('${WEEK}');\nexport const weekSpend = () => ({ start: new Date('${WEEK}'), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub week spend' });\n`;
const METERS = {
  source: 'statusline',
  read_at: NOW.toISOString(),
  five_hour: null,
  seven_day: { pct: 85, resets_at: '2030-01-14T07:00:00.000Z' },
  fable_seven_day: null,
  warning: null,
};
const STALE = { type: 'until-reset', week_start: PAST_WEEK, set_on: '2029-12-31' };
const CURRENT = { type: 'until-reset', week_start: WEEK, set_on: '2030-01-07' };
const CURRENT_API = { type: 'api-until-reset', week_start: WEEK, set_on: '2030-01-07' };

const tmpDir = (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-override-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

// A temporary copy of the CLI with a stub next_ticket.mjs (the week is fixed in 2030), so the CLI never reads the real vault.
function cliRoot(t, override) {
  const root = tmpDir(t);
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  mkdirSync(path.join(root, 'vault/tools'), { recursive: true });
  mkdirSync(path.join(root, 'vault/handoff'), { recursive: true });
  copyFileSync(path.join(repo, 'scripts/budget.mjs'), path.join(root, 'scripts/budget.mjs'));
  writeFileSync(path.join(root, 'vault/tools/next_ticket.mjs'), NEXT_TICKET_STUB);
  writeFileSync(path.join(root, 'vault/budget.json'), JSON.stringify({ meter_source: 'proxy', override }, null, 2) + '\n');
  writeFileSync(path.join(root, 'vault/handoff/.keep'), '');
  return root;
}

const runCli = (root) => spawnSync(process.execPath, [path.join(root, 'scripts/budget.mjs')], { encoding: 'utf8', timeout: 20000 });

// A temporary root for applyGates: the hold file and the warn marker are written here.
function gateRoot(t) {
  const root = tmpDir(t);
  mkdirSync(path.join(root, 'vault/handoff'), { recursive: true });
  mkdirSync(path.join(root, 'vault/cost'), { recursive: true });
  return root;
}

test('EZD-239 T1 a past week\'s override prints Override: none (AC-EZD-239-1)', (t) => {
  const root = cliRoot(t, STALE);
  const bj = path.join(root, 'vault/budget.json');
  const before = readFileSync(bj, 'utf8');
  const r = runCli(root);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('Override: none · Hold: none'), r.stdout);
  assert.ok(!r.stdout.includes('until-reset'), r.stdout);
  assert.equal(readFileSync(bj, 'utf8'), before);
});

test('EZD-239 T2 this week\'s override is still printed (AC-EZD-239-2)', (t) => {
  const a = runCli(cliRoot(t, CURRENT));
  assert.equal(a.status, 0, a.stderr);
  assert.ok(a.stdout.includes('Override: until-reset (week of 2030-01-07) · Hold: none'), a.stdout);
  const b = runCli(cliRoot(t, CURRENT_API));
  assert.equal(b.status, 0, b.stderr);
  assert.ok(b.stdout.includes('Override: api-until-reset (week of 2030-01-07) · Hold: none'), b.stdout);
});

test('EZD-239 T3 the gates decide the same as before for a past and a current override (AC-EZD-239-3)', async (t) => {
  assert.equal(overrideActive({ override: STALE }, NOW), null);
  assert.deepEqual(overrideActive({ override: CURRENT }, NOW), CURRENT);
  const run = async (budget) => {
    const root = gateRoot(t);
    const sent = [];
    const r = await applyGates({
      root, now: NOW, budget, meters: METERS, nextUnit: 'build EZD-999', inProgressBuild: false,
      notify: async (m) => { sent.push(m); },
    });
    return { root, sent, r };
  };

  const stale = await run({ override: STALE });
  assert.equal(stale.r.start, false);
  assert.equal(stale.r.reason, 'budget hold');
  assert.equal(stale.r.decision.hold, true);
  assert.equal(existsSync(path.join(stale.root, 'vault/handoff/BUDGET_HOLD.md')), true);
  assert.equal(stale.sent.length, 2);
  assert.ok(stale.sent[1].startsWith('budget hold: weekly usage at 85% (hold at 80%).'), stale.sent[1]);

  const none = await run({});
  assert.deepEqual(none.r, stale.r);
  assert.deepEqual(none.sent, stale.sent);

  const current = await run({ override: CURRENT });
  assert.equal(current.r.start, true);
  assert.equal(current.r.reason, null);
  assert.equal(current.r.decision.hold, true);
  assert.equal(existsSync(path.join(current.root, 'vault/handoff/BUDGET_HOLD.md')), false);
  assert.equal(existsSync(path.join(current.root, 'vault/handoff/.budget-warned-2030-01-14')), false);
  assert.equal(current.sent.length, 0);
});
