// EZD-207c N1-N5 (vault/plans/EZD-207c.md section 4; AC-EZD-207-5). node:test. Profiles, registry rows, the iPad
// frame rule, the gesture constants and the CPU throttle. Matches numbers and ids, never wording.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// R = the iPad CPU throttle rate, 4 (Q-0616 (a)); the test's own literal.
const R = 4;

const config = () => import('../perf.config.mjs');
const registry = () => import('../registry.mjs');
const budgets = () => import('../budgets.mjs');
const check = () => import('../check.mjs');
const pan = () => import('../pan-script.mjs');

describe('EZD-207c perf profiles and gesture', () => {
  test('EZD-207c N1 profiles and config', async () => {
    const { PROFILES, default: cfg } = await config();
    assert.deepEqual(Object.keys(PROFILES), ['desktop', 'ipad']);
    assert.deepEqual(PROFILES.ipad, {
      browser: 'chromium',
      viewport: { width: 1180, height: 820 },
      deviceScaleFactor: 2,
      hasTouch: false,
      isMobile: false,
      cpuThrottleRate: R,
    });
    assert.deepEqual(PROFILES.desktop, {
      browser: 'chromium',
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      cpuThrottleRate: 1,
    });
    assert.equal(cfg.profile, 'desktop');
    assert.equal(cfg.panUrl, '/dev/benchmark-plan');
    assert.equal(cfg.measurements.find((m) => m.id === 'js-size:editor').url, '/dev/benchmark-plan');
    assert.equal(cfg.measurements.length, 11);
  });

  test('EZD-207c N2 registry rows', async () => {
    const { MEASUREMENTS } = await registry();
    const { BUDGETS } = await budgets();
    assert.equal(MEASUREMENTS.length, 27);
    const panRows = MEASUREMENTS.filter((m) => m.id.includes('-during-'));
    assert.deepEqual(
      panRows.map((m) => m.id),
      [
        'react-commits-during-pan',
        'react-commits-during-pan:ipad',
        'long-tasks-during-pan',
        'long-tasks-during-pan:ipad',
        'long-tasks-during-load',
        'long-tasks-during-load:ipad',
        'frame-times-during-pan',
        'frame-times-during-pan:ipad',
      ],
    );
    assert.deepEqual(
      panRows.map((m) => m.budget),
      [
        'react-commits.pan',
        'react-commits.pan',
        'long-tasks.pan',
        'long-tasks.pan',
        'long-tasks.load',
        'long-tasks.load',
        'frame.desktop',
        'frame.ipad',
      ],
    );
    panRows.forEach((m, i) => {
      assert.equal(m.status, 'active', m.id);
      assert.equal(m.collector, 'pan', m.id);
      assert.equal(m.profile, i % 2 === 0 ? 'desktop' : 'ipad', m.id);
    });
    for (const m of MEASUREMENTS) {
      if (!panRows.includes(m)) assert.equal(m.profile, null, m.id);
      assert.ok(Object.hasOwn(BUDGETS, m.budget), `${m.id} budget ${m.budget}`);
    }
    assert.equal(MEASUREMENTS.find((m) => m.id === 'draw-calls-per-frame').status, 'pending');
  });

  test('EZD-207c N3 iPad frame rule', async () => {
    const { evaluate } = await check();
    const { BUDGETS } = await budgets();
    const row = (id, value, max) => ({
      id,
      budgetId: 'frame.ipad',
      owner: 'EZD-207c',
      value,
      details: { stats: { max } },
    });
    const rows = [
      row('i1', 34.33, 50),
      row('i2', 34.34, 50),
      row('i3', 20, 100),
      row('i4', 20, 100.01),
      row('i5', null, null),
    ];
    const out = evaluate(rows, BUDGETS);
    assert.deepEqual(
      out.rows.map((r) => r.status),
      ['trend', 'trend', 'trend', 'trend', 'trend'],
    );
    assert.deepEqual(
      out.rows.map((r) => r.withinBudget),
      [true, false, true, false, null],
    );
    assert.equal(out.pass, true);
  });

  test('EZD-207c N4 gesture constants', async () => {
    const p = await pan();
    assert.equal(p.STEP_WAIT_MS, 16);
    assert.equal(p.WHEEL_STEPS, 4);
    assert.equal(p.WHEEL_DELTA_PX, 100);
    assert.equal(p.GESTURE_MS, 3008);
    assert.equal(p.PLAN_READY_MS, 30000);
    assert.equal(p.PLAN_POLL_MS, 100);
    assert.equal(p.PLAN_READY_SELECTOR, '[data-testid="plan-canvas"][data-plan-state="ready"]');
  });

  test('EZD-207c N5 throttle slows the page', { timeout: 120000 }, async () => {
    const { applyCpuThrottle } = await pan();
    const browser = await chromium.launch({ headless: true });
    try {
      const work = () => {
        let x = 0;
        for (let i = 0; i < 2e7; i++) x += i % 7;
        return x;
      };
      const median = async (page) => {
        await page.evaluate(work);
        const times = [];
        for (let i = 0; i < 3; i++) {
          const t = Date.now();
          await page.evaluate(work);
          times.push(Date.now() - t);
        }
        return times.sort((a, b) => a - b)[1];
      };
      const ctxA = await browser.newContext();
      const pageA = await ctxA.newPage();
      const a = await median(pageA);
      const ctxB = await browser.newContext();
      const pageB = await ctxB.newPage();
      await applyCpuThrottle(ctxB, pageB, 4);
      const b = await median(pageB);
      assert.ok(b >= 2 * a, `throttled median ${b} ms vs plain ${a} ms`);
    } finally {
      await browser.close();
    }
  });
});
