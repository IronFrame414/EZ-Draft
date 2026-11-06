// EZD-207c P1-P4 (vault/plans/EZD-207c.md section 4; AC-EZD-207-5). node:test. Runs the perf CLI against inline
// fixture pages on the in-memory fixture server (async spawn, L-021). Matches exit codes, ids, statuses and
// numbers, never wording. Temp folders are removed in `finally` (L-051).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { startFixtureServer } from './fixture-server.mjs';
import { PAN_HTML, readLatest, rowOf, runCli, tmpDir, writeConfig } from './helpers.mjs';

// R = the iPad CPU throttle rate, 4 (Q-0616 (a)).
const R = 4;

const M = '<main data-shell-region="canvas" style="position:fixed;inset:0"></main>';
const B60 = 'var t=performance.now();while(performance.now()-t<60){}';

const WHEEL_HTML = `<!doctype html><html><head></head><body>${M}<script>addEventListener('wheel',function(){${B60}})</script></body></html>`;
const LATE_HTML = `<!doctype html><html><head></head><body data-perf-wait-plan="">${M}<script>setTimeout(function(){window.__ezdraftPlan={stats:function(){return{glyphs:1}}}},1000);setTimeout(function(){${B60}},2500);setTimeout(function(){var d=document.createElement('div');d.setAttribute('data-testid','plan-canvas');d.setAttribute('data-plan-state','ready');document.body.appendChild(d)},3000)</script></body></html>`;
const NEVER_HTML = `<!doctype html><html><head></head><body data-perf-wait-plan="">${M}</body></html>`;

const NOTEXT_HTML = `<!doctype html><html><head></head><body data-perf-wait-plan="">${M}<div data-testid="plan-canvas" data-plan-state="ready"></div><script>window.__ezdraftPlan={stats:function(){return{glyphs:0}}}</script></body></html>`;

let server;

before(async () => {
  server = await startFixtureServer({
    '/pan.html': { body: PAN_HTML },
    '/wheel.html': { body: WHEEL_HTML },
    '/late.html': { body: LATE_HTML },
    '/never.html': { body: NEVER_HTML },
    '/notext.html': { body: NOTEXT_HTML },
  });
});

after(async () => {
  await server?.close();
});

async function runPanCli(panUrl, only) {
  const dir = tmpDir();
  try {
    const out = path.join(dir, 'out');
    const cfg = writeConfig(dir, [], panUrl);
    const r = await runCli(['--config', cfg, '--base-url', server.baseUrl, '--out', out, '--only', only.join(',')]);
    let latest;
    try {
      latest = readLatest(out);
    } catch {
      latest = undefined;
    }
    return { r, latest };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('EZD-207c pan on fixture pages', () => {
  test('EZD-207c P1 rows per profile', { timeout: 200000 }, async () => {
    const { r, latest } = await runPanCli('/pan.html', [
      'frame-times-during-pan',
      'frame-times-during-pan:ipad',
    ]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(
      latest.measurements.map((m) => m.id),
      ['frame-times-during-pan', 'frame-times-during-pan:ipad'],
    );
    const d = rowOf(latest, 'frame-times-during-pan');
    const i = rowOf(latest, 'frame-times-during-pan:ipad');
    assert.equal(d.status, 'trend');
    assert.equal(i.status, 'trend');
    assert.equal(d.budgetId, 'frame.desktop');
    assert.equal(i.budgetId, 'frame.ipad');
    assert.ok(Math.abs(d.budget - 1000 / 60) <= 1e-9, `desktop budget ${d.budget}`);
    assert.ok(Math.abs(i.budget - 1000 / 30) <= 1e-9, `ipad budget ${i.budget}`);
    assert.equal(d.details.profile, 'desktop');
    assert.equal(i.details.profile, 'ipad');
    assert.deepEqual(d.details.viewport, { width: 1600, height: 1000 });
    assert.deepEqual(i.details.viewport, { width: 1180, height: 820 });
    assert.equal(d.details.deviceScaleFactor, 1);
    assert.equal(i.details.deviceScaleFactor, 2);
    assert.equal(d.details.cpuThrottleRate, 1);
    assert.equal(i.details.cpuThrottleRate, R);
    for (const row of [d, i]) {
      assert.ok(row.details.durationMs >= 3008, `${row.id} durationMs ${row.details.durationMs}`);
      assert.ok(row.details.stats.count >= 1, `${row.id} stats.count`);
      assert.equal(typeof row.withinBudget, 'boolean', `${row.id} withinBudget`);
    }
    assert.equal(latest.profile, 'desktop');
  });

  test('EZD-207c P2 wheel steps reach the page', { timeout: 200000 }, async () => {
    const { r, latest } = await runPanCli('/wheel.html', [
      'long-tasks-during-pan',
      'long-tasks-during-pan:ipad',
    ]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const id of ['long-tasks-during-pan', 'long-tasks-during-pan:ipad']) {
      const row = rowOf(latest, id);
      assert.equal(row.status, 'fail', id);
      assert.equal(row.value, 8, id);
    }
  });

  test('EZD-207c P3 waits for the plan', { timeout: 200000 }, async () => {
    const { r, latest } = await runPanCli('/late.html', ['long-tasks-during-pan', 'long-tasks-during-load']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const p = rowOf(latest, 'long-tasks-during-pan');
    assert.equal(p.status, 'pass');
    assert.equal(p.value, 0);
    const l = rowOf(latest, 'long-tasks-during-load');
    assert.equal(l.status, 'trend');
    assert.ok(l.value >= 1, `load long tasks ${l.value}`);
  });

  test('EZD-207c P4 plan never ready', { timeout: 120000 }, async () => {
    const { r, latest } = await runPanCli('/never.html', ['long-tasks-during-pan']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const row = rowOf(latest, 'long-tasks-during-pan');
    assert.equal(row.status, 'error');
    assert.equal(row.error, 'plan_not_ready');
    assert.equal(row.details.profile, 'desktop');
  });

  test('EZD-207c P5 plan text never drawn', { timeout: 120000 }, async () => {
    const { r, latest } = await runPanCli('/notext.html', ['long-tasks-during-pan']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const row = rowOf(latest, 'long-tasks-during-pan');
    assert.equal(row.status, 'error');
    assert.equal(row.error, 'plan_not_ready');
    assert.equal(row.details.profile, 'desktop');
  });
});
