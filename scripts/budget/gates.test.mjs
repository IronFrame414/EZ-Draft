// EZD-000h T1-T7: gate decisions, meter sources, the five-hour pause and the weekly warn/hold (vault/plans/EZD-000h.md sections 3 and 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gateDecision, readMeters, waitForWindow, applyGates } from '../budget.mjs';

const NOW = new Date('2026-10-19T12:00:00Z');
const iso = (mins) => new Date(NOW.getTime() + mins * 60000).toISOString();
const W = (pct, mins) => ({ pct, resets_at: iso(mins) });
const meters = (over = {}) => ({ source: 'statusline', read_at: NOW.toISOString(), five_hour: W(0, 60), seven_day: W(0, 3000), fable_seven_day: W(0, 3000), warning: null, ...over });
const tmpRoot = () => {
  const r = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-gates-')));
  mkdirSync(path.join(r, 'vault/handoff'), { recursive: true });
  mkdirSync(path.join(r, 'vault/cost'), { recursive: true });
  return r;
};
const PCTS = [69, 70, 79, 80, 89, 90];

test('EZD-000h T1: five-hour pause at or above 90, with resume two minutes after the reset', () => {
  const pauses = PCTS.map((p) => gateDecision(meters({ five_hour: W(p, 60) }), {}, NOW).pause);
  assert.deepEqual(pauses.slice(0, 5), [null, null, null, null, null]);
  assert.deepEqual(pauses[5], { pct: 90, resets_at: iso(60), resume_at: iso(62) });
  assert.equal(gateDecision(meters({ five_hour: W(95, -1) }), {}, NOW).pause, null);
});

test('EZD-000h T2: weekly warn at 70 and hold at 80, none for a window that has reset', () => {
  const d = PCTS.map((p) => gateDecision(meters({ seven_day: W(p, 3000) }), {}, NOW));
  assert.deepEqual(d.map((x) => x.warn), [false, true, true, true, true, true]);
  assert.deepEqual(d.map((x) => x.hold), [false, false, false, true, true, true]);
  const past = gateDecision(meters({ seven_day: W(85, -1) }), {}, NOW);
  assert.equal(past.warn, false);
  assert.equal(past.hold, false);
});

test('EZD-000h T3: Fable falls back to Opus at 90; no Fable meter keeps Fable', () => {
  const d = PCTS.map((p) => gateDecision(meters({ fable_seven_day: W(p, 3000) }), {}, NOW).fable);
  assert.deepEqual(d, ['fable', 'fable', 'fable', 'fable', 'fable', 'opus']);
  assert.equal(gateDecision(meters({ fable_seven_day: null }), {}, NOW).fable, 'fable');
});

test('EZD-000h T4: meter source order is usage.json, then fallback, then the dollar proxy', async () => {
  const spend = { main: 150, fable: 0, pct: 50, start: new Date(NOW.getTime() - 86400000) };
  const base = { weekly_ceiling_usd_est: 300 };
  const run = async (readAtMinsAgo, extra = {}, budget = base) => {
    const root = tmpRoot();
    const fixture = { five_hour: W(10, 60), seven_day: W(63, 3000), fable_seven_day: null, read_at: new Date(NOW.getTime() - readAtMinsAgo * 60000).toISOString(), source: 'statusline' };
    writeFileSync(path.join(root, 'vault/cost/usage.json'), JSON.stringify(fixture));
    return readMeters({ root, now: NOW, budget, spend, ...extra });
  };
  const a = await run(19);
  assert.equal(a.source, 'statusline');
  assert.equal(a.seven_day.pct, 63);
  assert.equal(a.warning, null);
  const b = await run(21, { fallback: async () => meters({ source: 'oauth' }) });
  assert.equal(b.source, 'oauth');
  const c = await run(21);
  assert.equal(c.source, 'proxy');
  assert.equal(c.seven_day.pct, 50);
  assert.equal(c.five_hour, null);
  assert.ok(c.warning.includes('dollar proxy'));
  const d = await run(19, {}, { ...base, meter_source: 'proxy' });
  assert.equal(d.source, 'proxy');
  assert.equal(d.warning, null);
});

test('EZD-000h T5: the pause writes WINDOW_PAUSE.md, waits until resets_at plus 2 minutes, then deletes the file', async () => {
  const file = (r) => path.join(r, 'vault/handoff/WINDOW_PAUSE.md');
  const stub = (r) => { const s = { calls: [], text: null }; s.fn = async (ms) => { s.calls.push(ms); s.text = existsSync(file(r)) ? readFileSync(file(r), 'utf8') : null; }; return s; };
  // (a)
  let root = tmpRoot(); let s = stub(root);
  const pause = gateDecision(meters({ five_hour: W(92, 10) }), {}, NOW).pause;
  const ret = await waitForWindow({ root, now: NOW, pause, sleep: s.fn });
  assert.deepEqual(s.calls, [720000]);
  assert.ok(s.text.includes('92%'));
  assert.ok(s.text.includes(iso(10)));
  assert.ok(s.text.includes(`- Resume at: ${iso(12)}`));
  assert.equal(existsSync(file(root)), false);
  assert.equal(ret, 720000);
  // (b)
  root = tmpRoot(); s = stub(root);
  writeFileSync(file(root), `# Five-hour window pause\n\n- Resume at: ${iso(5)}\n`);
  await waitForWindow({ root, now: NOW, sleep: s.fn });
  assert.deepEqual(s.calls, [300000]);
  assert.equal(existsSync(file(root)), false);
  // (c)
  root = tmpRoot(); s = stub(root);
  assert.equal(await waitForWindow({ root, now: NOW, sleep: s.fn }), 0);
  assert.deepEqual(s.calls, []);
});

test('EZD-000h T6: the weekly warning fires once per window', async () => {
  const root = tmpRoot();
  const sent = [];
  const opts = { root, now: NOW, budget: { weekly_ceiling_usd_est: 300 }, meters: meters({ seven_day: W(75, 3000) }), nextUnit: 'build EZD-999', inProgressBuild: false, notify: async (m) => { sent.push(m); } };
  const r1 = await applyGates(opts);
  const r2 = await applyGates(opts);
  assert.equal(r1.start, true);
  assert.equal(r2.start, true);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].includes('75%'));
  assert.ok(existsSync(path.join(root, `vault/handoff/.budget-warned-${iso(3000).slice(0, 10)}`)));
  assert.equal(existsSync(path.join(root, 'vault/handoff/BUDGET_HOLD.md')), false);
});

test('EZD-000h T7: the weekly hold lets the in-progress ticket finish and blocks new ones', async () => {
  const root = tmpRoot();
  const sent = [];
  const opts = { root, now: NOW, budget: { weekly_ceiling_usd_est: 300 }, meters: meters({ seven_day: W(85, 3000) }), nextUnit: 'build EZD-999', notify: async (m) => { sent.push(m); } };
  const a = await applyGates({ ...opts, inProgressBuild: true });
  assert.equal(a.start, true);
  const hold = readFileSync(path.join(root, 'vault/handoff/BUDGET_HOLD.md'), 'utf8');
  assert.ok(hold.includes('85%'));
  assert.ok(hold.includes('build EZD-999'));
  assert.equal(sent.length, 2);
  assert.ok(sent[1].includes('budget hold'));
  const b = await applyGates({ ...opts, inProgressBuild: false });
  assert.equal(b.start, false);
  assert.ok(b.reason.includes('budget hold'));
  assert.equal(sent.length, 2);
});
