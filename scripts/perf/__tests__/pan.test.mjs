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
const B200 = 'var t=performance.now();while(performance.now()-t<200){}';

const WHEEL_HTML = `<!doctype html><html><head></head><body>${M}<script>addEventListener('wheel',function(){${B200}})</script></body></html>`;
const WAIT_HTML = `<!doctype html><html><head></head><body>${M}<script>addEventListener('wheel',function(){var x=new XMLHttpRequest();x.open('GET','/slow',false);x.send()})</script></body></html>`;
const LATE_HTML = `<!doctype html><html><head></head><body data-perf-wait-plan="">${M}<script>setTimeout(function(){window.__ezdraftPlan={stats:function(){return{glyphs:1}}}},1000);setTimeout(function(){${B60}},2500);setTimeout(function(){var d=document.createElement('div');d.setAttribute('data-testid','plan-canvas');d.setAttribute('data-plan-state','ready');document.body.appendChild(d)},3000)</script></body></html>`;
const NEVER_HTML = `<!doctype html><html><head></head><body data-perf-wait-plan="">${M}</body></html>`;

const NOTEXT_HTML = `<!doctype html><html><head></head><body data-perf-wait-plan="">${M}<div data-testid="plan-canvas" data-plan-state="ready"></div><script>window.__ezdraftPlan={stats:function(){return{glyphs:0}}}</script></body></html>`;

let server;

before(async () => {
  server = await startFixtureServer({
    '/pan.html': { body: PAN_HTML },
    '/wheel.html': { body: WHEEL_HTML },
    '/wait.html': { body: WAIT_HTML },
    '/slow': { body: 'ok', type: 'text/plain; charset=utf-8', delayMs: 100 },
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
    let diag = `${r.stdout}${r.stderr}`;
    for (const m of (latest?.measurements ?? []).filter((x) => String(x.id).startsWith('long-tasks-during-pan'))) {
      diag += `\n${m.id} status=${m.status} value=${m.value} details=${JSON.stringify(m.details)}`;
    }
    return { r, latest, diag };
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
    const { r, latest, diag } = await runPanCli('/wheel.html', [
      'long-tasks-during-pan',
      'long-tasks-during-pan:ipad',
    ]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const id of ['long-tasks-during-pan', 'long-tasks-during-pan:ipad']) {
      const row = rowOf(latest, id);
      assert.equal(row.status, 'fail', `${id}\n${diag}`);
      assert.equal(row.value, 8, `${id}\n${diag}`);
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

describe('EZD-356 long-task list on the pan rows', () => {
  test('EZD-356 T1 pan rows list each long task and the load', { timeout: 200000 }, async () => {
    const { r, latest } = await runPanCli('/wheel.html', [
      'long-tasks-during-pan',
      'long-tasks-during-pan:ipad',
    ]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const id of ['long-tasks-during-pan', 'long-tasks-during-pan:ipad']) {
      const row = rowOf(latest, id);
      assert.equal(row.value, 8, id);
      assert.deepEqual(Object.keys(row.details), ['profile', 'tasks', 'waits', 'load1'], id);
      assert.deepEqual(row.details.waits, [], id);
      assert.equal(row.details.tasks.length, 8, id);
      let prev = 0;
      for (const t of row.details.tasks) {
        assert.ok(Number.isInteger(t.ms) && t.ms >= 50, `${id} ms ${t.ms}`);
        assert.ok(Number.isInteger(t.at) && t.at >= 0, `${id} at ${t.at}`);
        assert.ok(t.at >= prev, `${id} at ${t.at} before ${prev}`);
        prev = t.at;
      }
      assert.ok(Number.isFinite(row.details.load1) && row.details.load1 >= 0, `${id} load1`);
    }
  });

  test('EZD-356 T2 tasks before pan-start are not listed', { timeout: 200000 }, async () => {
    const { r, latest } = await runPanCli('/late.html', ['long-tasks-during-pan']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const row = rowOf(latest, 'long-tasks-during-pan');
    assert.equal(row.value, 0);
    assert.deepEqual(row.details.tasks, []);
    assert.equal(row.details.profile, 'desktop');
  });
});

describe('EZD-359 pan task attribution', () => {
  test('EZD-359 I1 pan tasks carry trace attribution', { timeout: 200000 }, async () => {
    const { r, latest } = await runPanCli('/wheel.html', [
      'long-tasks-during-pan',
      'long-tasks-during-pan:ipad',
    ]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const id of ['long-tasks-during-pan', 'long-tasks-during-pan:ipad']) {
      const row = rowOf(latest, id);
      assert.ok(row.details.tasks.length >= 1, `${id} tasks`);
      for (const t of row.details.tasks) {
        assert.deepEqual(Object.keys(t), ['at', 'ms', 'cpu', 'gc', 'top'], id);
        assert.ok(Number.isInteger(t.cpu) && t.cpu >= 0, `${id} cpu ${t.cpu}`);
        assert.ok(Number.isInteger(t.gc) && t.gc >= 0 && t.gc <= t.ms, `${id} gc ${t.gc}`);
        assert.ok(typeof t.top === 'string' && t.top.length > 0, `${id} top ${t.top}`);
        if (row.details.profile === 'desktop') assert.ok(t.cpu >= 50, `${id} cpu ${t.cpu}`);
      }
    }
  });

  test('EZD-359 I2 a waiting task is listed, not counted', { timeout: 200000 }, async () => {
    const { r, latest, diag } = await runPanCli('/wait.html', [
      'long-tasks-during-pan',
      'long-tasks-during-pan:ipad',
    ]);
    assert.equal(r.status, 0, diag);
    for (const id of ['long-tasks-during-pan', 'long-tasks-during-pan:ipad']) {
      const row = rowOf(latest, id);
      const rate = row.details.profile === 'ipad-1x' ? 4 : 1;
      assert.equal(row.status, 'pass', `${id}\n${diag}`);
      assert.equal(row.value, 0, `${id}\n${diag}`);
      assert.deepEqual(row.details.tasks, [], `${id}\n${diag}`);
      assert.ok(row.details.waits.length >= 1, `${id} waits`);
      for (const w of row.details.waits) {
        assert.ok(w.ms >= 50, `${id} ms ${w.ms}`);
        assert.ok(Number.isInteger(w.cpu), `${id} cpu ${w.cpu}`);
        assert.ok(w.cpu * rate - w.ms * (rate - 1) <= 50, `${id} cpu ${w.cpu} ms ${w.ms} rate ${rate}`);
      }
    }
  });
});
