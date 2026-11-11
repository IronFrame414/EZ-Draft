// EZD-017 Step 5 (vault/plans/EZD-017.md P1-P5, H1, H2): the scripted pan. Counts React commits, long tasks and
// animation frame intervals between the pan-start and pan-end marks (11 rule 4; Q-0073 (a)).
// EZD-356: the pan rows also list each pan long task (at = ms after pan-start, ms = its length) and the 1-minute load average.
// EZD-359: the pan is traced; each pan long task carries cpu, gc and top.
// EZD-388: a profile with cpuCountScale counts the trace's top-level tasks by CPU time × cpuCountScale (countByCpu); no trace is trace_missing.
// EZD-235b Build step 11: HOOKS_PATH, stopTrace and twoFrames are exported for the worker-job collector.
import os from 'node:os';
import path from 'node:path';
import { settlePage } from './js-size.mjs';
import { TRACE_CATEGORIES, TRACE_STOP_MS, attributeTasks, countByCpu, readTraceEvents, splitTasks } from './trace-tasks.mjs';

export const HOOKS_PATH = path.join(import.meta.dirname, 'page-hooks.browser.js');

const PAN_PX = 300;
const STEPS = 45;
export const STEP_WAIT_MS = 16;
export const WHEEL_STEPS = 4;
export const WHEEL_DELTA_PX = 100;
// EZD-207c D-Gesture: two sweeps of 2 x STEPS moves each, then WHEEL_STEPS wheel steps in and out, 16 ms apart.
export const GESTURE_MS = (4 * STEPS + 2 * WHEEL_STEPS) * STEP_WAIT_MS;
export const PLAN_READY_MS = 30000;
export const PLAN_POLL_MS = 100;
export const PLAN_READY_SELECTOR = '[data-testid="plan-canvas"][data-plan-state="ready"]';

/** EZD-207c D-Throttle: slows the page's CPU by `rate` (1 = none); the session lives until the page closes. */
export async function applyCpuThrottle(context, page, rate) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return cdp;
}

/** EZD-359 D-Trace: stops the browser's trace within TRACE_STOP_MS; its events, or [] on any throw or timeout. */
export async function stopTrace(browser) {
  let timer;
  try {
    const buffer = await Promise.race([
      browser.stopTracing(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('trace_stop_timeout')), TRACE_STOP_MS);
      }),
    ]);
    return readTraceEvents(buffer);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** P4: nearest-rank percentile of a sorted array. */
const rank = (sorted, p) => sorted[Math.ceil((p / 100) * sorted.length) - 1];

/** P4: frame interval statistics; empty input → count 0 and every other field null. */
export function frameStats(intervals) {
  const n = intervals.length;
  if (n === 0) {
    return {
      count: 0,
      mean: null,
      p50: null,
      p95: null,
      p99: null,
      max: null,
      over16_7: null,
      over33_3: null,
      over100: null,
    };
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const over = (limit) => intervals.filter((x) => x > limit).length;
  return {
    count: n,
    mean: intervals.reduce((s, x) => s + x, 0) / n,
    p50: rank(sorted, 50),
    p95: rank(sorted, 95),
    p99: rank(sorted, 99),
    max: sorted[n - 1],
    over16_7: over(1000 / 60),
    over33_3: over(1000 / 30),
    over100: over(100),
  };
}

export const twoFrames = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );

/** P2: 45 moves out to cx + 300 and 45 back to cx, one pointer move each, 16 ms apart. */
async function sweep(page, cx, cy) {
  let moves = 0;
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(cx + (PAN_PX * i) / STEPS, cy);
    moves++;
    await page.waitForTimeout(STEP_WAIT_MS);
  }
  for (let j = 1; j <= STEPS; j++) {
    await page.mouse.move(cx + (PAN_PX * (STEPS - j)) / STEPS, cy);
    moves++;
    await page.waitForTimeout(STEP_WAIT_MS);
  }
  return moves;
}

/**
 * Runs the pan on baseUrl + panUrl in `context` under `profile` (CPU throttle set before the page loads). Resolves PanResult, or PanFailure
 * `{ error, status, reactDetected }` when the page does not load, the plan is not ready (`plan_not_ready`) or it has no canvas region (P1, P5).
 */
export async function runPan(context, baseUrl, panUrl, profile) {
  await context.addInitScript({ path: HOOKS_PATH });
  const page = await context.newPage();
  const cdp = await applyCpuThrottle(context, page, profile.cpuThrottleRate);
  const browser = context.browser();
  let tracing = false;
  try {
    let response;
    try {
      response = await page.goto(baseUrl + panUrl, { waitUntil: 'load' });
    } catch {
      return { error: 'navigation_failed', status: null, reactDetected: false };
    }
    if (!response) return { error: 'navigation_failed', status: null, reactDetected: false };
    const status = response.status();
    if (status !== 200) return { error: `http_${status}`, status, reactDetected: false };

    await settlePage(page);
    if ((await page.$('[data-perf-wait-plan]')) !== null) {
      try {
        // EZD-207c D-Wait: the plan is ready and its text is uploaded.
        await page.waitForFunction(
          (sel) =>
            document.querySelector(sel) !== null &&
            window.__ezdraftPlan !== undefined &&
            window.__ezdraftPlan.stats().glyphs > 0,
          PLAN_READY_SELECTOR,
          { timeout: PLAN_READY_MS, polling: PLAN_POLL_MS },
        );
      } catch {
        const renderers = await page.evaluate(() => window.__EZD_PERF__.renderers);
        return { error: 'plan_not_ready', status: 200, reactDetected: renderers >= 1 };
      }
    }
    const canvas = await page.$('[data-shell-region="canvas"]');
    const box = canvas ? await canvas.boundingBox() : null;
    if (!box) {
      const renderers = await page.evaluate(() => window.__EZD_PERF__.renderers);
      return { error: 'canvas_not_found', status: 200, reactDetected: renderers >= 1 };
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // P2: the one move to the start position and any commit it causes land before pan-start.
    await page.mouse.move(cx, cy);
    await twoFrames(page);
    const load1 = Math.round(os.loadavg()[0] * 100) / 100;
    if (browser !== null) {
      try {
        await browser.startTracing(page, { categories: TRACE_CATEGORIES });
        tracing = true;
      } catch {
        tracing = false;
      }
    }
    const startCommits = await page.evaluate(() => {
      window.__EZD_PERF__.mark('pan-start');
      return window.__EZD_PERF__.commits;
    });

    let pointerMoves = 0;
    await page.mouse.down({ button: 'right' });
    pointerMoves += await sweep(page, cx, cy);
    await page.mouse.up({ button: 'right' });

    await page.keyboard.down('Space');
    await page.mouse.down();
    pointerMoves += await sweep(page, cx, cy);
    await page.mouse.up();
    await page.keyboard.up('Space');

    let wheelSteps = 0;
    for (const delta of [-WHEEL_DELTA_PX, WHEEL_DELTA_PX]) {
      for (let k = 0; k < WHEEL_STEPS; k++) {
        await page.mouse.wheel(0, delta);
        wheelSteps++;
        await page.waitForTimeout(STEP_WAIT_MS);
      }
    }

    await twoFrames(page);
    const end = await page.evaluate(() => {
      const p = window.__EZD_PERF__;
      p.mark('pan-end');
      return {
        commits: p.commits,
        renderers: p.renderers,
        longTasks: p.longTasks.slice(),
        rafTimes: p.rafTimes.slice(),
        panStart: p.panStart,
        panEnd: p.panEnd,
      };
    });
    const events = tracing ? await stopTrace(browser) : [];
    tracing = false;

    // P3
    const intervals = [];
    for (let i = 1; i < end.rafTimes.length; i++) intervals.push(end.rafTimes[i] - end.rafTimes[i - 1]);
    const raw = end.longTasks
      .filter((t) => t.startTime >= end.panStart && t.startTime <= end.panEnd)
      .map((t) => ({ at: Math.round(t.startTime - end.panStart), ms: Math.round(t.duration) }))
      .sort((a, b) => a.at - b.at);
    // EZD-359 branch H: own work (cpu × rate − ms × (rate − 1)) of 50 ms or less is a wait: listed, not counted. EZD-388: a profile with cpuCountScale counts by trace CPU time instead (Q-0737 (a)).
    const split = profile.cpuCountScale === undefined ? splitTasks(attributeTasks(events, raw), profile.cpuThrottleRate) : countByCpu(events, raw, profile.cpuCountScale, end.panEnd - end.panStart);
    if (split === null) return { error: 'trace_missing', status: 200, reactDetected: end.renderers >= 1 };
    return {
      reactDetected: end.renderers >= 1,
      renderers: end.renderers,
      commits: end.commits - startCommits,
      pointerMoves,
      wheelSteps,
      durationMs: end.panEnd - end.panStart,
      longTasksPan: split.counted.length,
      longTasksLoad: end.longTasks.filter((t) => t.startTime < end.panStart).length,
      panTasks: split.counted,
      panWaits: split.waits,
      load1,
      intervals,
    };
  } finally {
    if (tracing) await stopTrace(browser);
    await cdp.detach().catch(() => {});
    await page.close();
  }
}
