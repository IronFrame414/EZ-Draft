// EZD-017 T7, T8, T9 (vault/plans/EZD-017.md section 4). node:test, Node built-ins only. Expected values come
// from section 3 table B (11 Budgets; 11 rule 4; Q-0061 (a); Q-0071 (a); Q-0072 (a); Q-0073 (a)), P4 and R2/G6.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';
import { seeded } from './helpers.mjs';

const budgets = () => import('../budgets.mjs');
const pan = () => import('../pan-script.mjs');
const check = () => import('../check.mjs');

// Section 3 table B, row for row.
const TABLE_B = {
  'download.projects-settings': { kind: 'gate', unit: 'bytes', value: 200000 },
  'download.editor': { kind: 'gate', unit: 'bytes', value: 500000 },
  'download.client-link': { kind: 'gate', unit: 'bytes', value: 200000 },
  'download.field-pack': { kind: 'gate', unit: 'bytes', value: 200000 },
  'download.sign-in': { kind: 'gate', unit: 'bytes', value: 200000 },
  'react-commits.pan': { kind: 'gate', unit: 'count', value: 0 },
  'long-tasks.pan': { kind: 'gate', unit: 'count', value: 0 },
  'long-tasks.load': { kind: 'trend', unit: 'count', value: null },
  'frame.desktop': { kind: 'trend', unit: 'ms', value: 1000 / 60, statistic: 'p95', toleranceMs: 1 },
  'frame.ipad': { kind: 'trend', unit: 'ms', value: 1000 / 30, statistic: 'p95', toleranceMs: 1 },
  'frame.max': { kind: 'trend', unit: 'ms', value: 100, statistic: 'max', toleranceMs: 0 },
  'tool-pick': { kind: 'trend', unit: 'ms', value: 50 },
  'tab-switch': { kind: 'trend', unit: 'ms', value: 150 },
  'tab-first-3d': { kind: 'trend', unit: 'ms', value: 1000 },
  'open.cached': { kind: 'trend', unit: 'ms', value: 1000 },
  'open.cold': { kind: 'trend', unit: 'ms', value: 2500 },
  'projects.first-cards': { kind: 'trend', unit: 'ms', value: 1000 },
  autosave: { kind: 'trend', unit: 'ms', value: 300 },
  'rows-per-save': { kind: 'gate', unit: 'relative', value: null, rule: 'value <= changed' },
  'buffers-per-edit': { kind: 'gate', unit: 'relative', value: null, rule: 'value <= changed' },
  'draw-calls.frame': { kind: 'gate', unit: 'count', value: null },
};

describe('EZD-017 budgets, frame statistics and evaluate', () => {
  test('EZD-017 T7 Budgets table', async () => {
    const { BUDGETS, KB_BYTES, compressedSize } = await budgets();
    assert.equal(KB_BYTES, 1000);

    const buf = Buffer.from(seeded(10000), 'utf8');
    assert.equal(buf.length, 10000);
    assert.equal(compressedSize(buf), zlib.gzipSync(buf, { level: 6 }).length);

    assert.equal(Object.keys(BUDGETS).length, 21);
    assert.deepEqual(Object.keys(BUDGETS).sort(), Object.keys(TABLE_B).sort());
    for (const [id, want] of Object.entries(TABLE_B)) {
      const b = BUDGETS[id];
      assert.ok(b, `${id} present`);
      assert.equal(b.id, id, `${id} id`);
      assert.equal(b.kind, want.kind, `${id} kind`);
      assert.equal(b.unit, want.unit, `${id} unit`);
      if (want.value === null) assert.equal(b.value, null, `${id} value`);
      else if (id === 'frame.desktop' || id === 'frame.ipad')
        assert.ok(Math.abs(b.value - want.value) <= 1e-9, `${id} value ${b.value}`);
      else assert.equal(b.value, want.value, `${id} value`);
      assert.equal(b.statistic, want.statistic, `${id} statistic`);
      assert.equal(b.toleranceMs, want.toleranceMs, `${id} toleranceMs`);
      assert.equal(b.rule, want.rule, `${id} rule`);
      assert.equal(typeof b.source, 'string', `${id} source`);
      assert.ok(b.source.trim().length > 0, `${id} source non-empty`);
    }
  });

  test('EZD-017 T8 Frame statistics', async () => {
    const { frameStats } = await pan();
    const a = frameStats([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.equal(a.count, 10);
    assert.equal(a.mean, 55);
    assert.equal(a.p50, 50);
    assert.equal(a.p95, 100);
    assert.equal(a.p99, 100);
    assert.equal(a.max, 100);
    assert.equal(a.over16_7, 9);
    assert.equal(a.over33_3, 7);
    assert.equal(a.over100, 0);

    const b = frameStats([16.66, 16.67, 33.33, 33.34, 100, 100.01]);
    assert.equal(b.over16_7, 5);
    assert.equal(b.over33_3, 3);
    assert.equal(b.over100, 1);

    const e = frameStats([]);
    assert.equal(e.count, 0);
    for (const k of ['mean', 'p50', 'p95', 'p99', 'max', 'over16_7', 'over33_3', 'over100'])
      assert.equal(e[k], null, `empty ${k}`);
  });

  test('EZD-017 T9 Evaluate', async () => {
    const { evaluate } = await check();
    const { BUDGETS } = await budgets();
    const row = (id, budgetId, extra) => ({ id, budgetId, owner: 'EZD-017', ...extra });
    const gateRows = [
      row('c0', 'react-commits.pan', { value: 0 }),
      row('c1', 'react-commits.pan', { value: 1 }),
      row('b0', 'download.client-link', { value: 200000 }),
      row('b1', 'download.client-link', { value: 200001 }),
      row('as', 'autosave', { value: 400 }),
      row('pd', 'draw-calls.frame', { pending: true }),
      row('er', 'download.editor', { error: 'x' }),
      row('r3', 'rows-per-save', { value: 3, details: { changed: 3 } }),
      row('r4', 'rows-per-save', { value: 4, details: { changed: 3 } }),
    ];
    const frameRows = [
      row('f1', 'frame.desktop', { value: 17.66, details: { stats: { max: 50 } } }),
      row('f2', 'frame.desktop', { value: 17.67, details: { stats: { max: 50 } } }),
      row('f3', 'frame.desktop', { value: 16, details: { stats: { max: 100 } } }),
      row('f4', 'frame.desktop', { value: 16, details: { stats: { max: 100.01 } } }),
    ];
    const loadRow = row('lt', 'long-tasks.load', { value: 2 });

    const all = evaluate([...gateRows, ...frameRows, loadRow], BUDGETS);
    const byId = Object.fromEntries(all.rows.map((r) => [r.id, r]));
    assert.equal(all.rows.length, 14);

    assert.deepEqual(
      gateRows.map((r) => byId[r.id].status),
      ['pass', 'fail', 'pass', 'fail', 'trend', 'pending', 'error', 'pass', 'fail'],
    );
    assert.equal(byId.as.withinBudget, false);
    assert.deepEqual(
      frameRows.map((r) => byId[r.id].status),
      ['trend', 'trend', 'trend', 'trend'],
    );
    assert.deepEqual(
      frameRows.map((r) => byId[r.id].withinBudget),
      [true, false, true, false],
    );
    assert.equal(byId.lt.status, 'trend');
    assert.equal(byId.lt.withinBudget, null);
    assert.equal(all.pass, false);

    // Output row shape (R2): id, status, value, budgetId, budget, unit, source, owner, details.
    assert.equal(byId.c1.budgetId, 'react-commits.pan');
    assert.equal(byId.c1.budget, 0);
    assert.equal(byId.c1.value, 1);
    assert.equal(byId.c1.unit, 'count');
    assert.equal(byId.c1.owner, 'EZD-017');
    assert.equal(byId.c1.source, BUDGETS['react-commits.pan'].source);
    assert.equal(byId.b1.budget, 200000);
    assert.equal(byId.r4.budget, 'value <= changed');

    // pass is false only because of fail and error rows: trend and pending rows alone leave it true.
    const pick = (ids) => [...gateRows, ...frameRows, loadRow].filter((r) => ids.includes(r.id));
    assert.equal(evaluate(pick(['c0', 'b0', 'as', 'pd', 'r3', 'f2', 'f4', 'lt']), BUDGETS).pass, true);
    assert.equal(evaluate(pick(['c0', 'as', 'pd', 'c1']), BUDGETS).pass, false);
    assert.equal(evaluate(pick(['c0', 'as', 'pd', 'er']), BUDGETS).pass, false);
  });
});
