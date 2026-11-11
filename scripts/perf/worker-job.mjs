// EZD-235b Build step 12 (vault/plans/EZD-235b.md): the worker-job collector; counts main-thread long tasks while a job runs in a Web Worker (Q-0664).
import os from 'node:os';
import { settlePage } from './js-size.mjs';
import { HOOKS_PATH, applyCpuThrottle, stopTrace, twoFrames } from './pan-script.mjs';
import { TRACE_CATEGORIES, attributeTasks, splitTasks } from './trace-tasks.mjs';

export const PROBE_SELECTOR = '[data-testid="worker-probe"]';
export const PROBE_READY_MS = 30000;
export const PROBE_POLL_MS = 100;
export const PROBE_RUN_MS = 30000;
export const WORKER_JOB_MIN_MS = 500;

/**
 * Runs one probe job on baseUrl + url in `context` under `profile`. Resolves
 * `{ longTasks, tasks, waits, load1, rooms, passes, ranMs, jobMs, where }`, or `{ error }` (D-Ready, D-Window, D-Validate).
 */
export async function runWorkerJob(context, baseUrl, url, profile) {
  await context.addInitScript({ path: HOOKS_PATH });
  const page = await context.newPage();
  const cdp = await applyCpuThrottle(context, page, profile.cpuThrottleRate);
  const browser = context.browser();
  let tracing = false;
  try {
    let response;
    try {
      response = await page.goto(baseUrl + url, { waitUntil: 'load' });
    } catch {
      return { error: 'navigation_failed' };
    }
    if (!response) return { error: 'navigation_failed' };
    const status = response.status();
    if (status !== 200) return { error: `http_${status}` };

    await settlePage(page);
    let ready;
    try {
      const handle = await page.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          if (el === null) return false;
          const state = el.getAttribute('data-worker-probe');
          if (state === 'failed') return 'failed';
          if (state === 'ready' && window.__ezdraftWorkerProbe !== undefined) return 'ready';
          return false;
        },
        PROBE_SELECTOR,
        { timeout: PROBE_READY_MS, polling: PROBE_POLL_MS },
      );
      ready = await handle.jsonValue();
    } catch {
      return { error: 'probe_not_ready' };
    }
    if (ready === 'failed') return { error: 'probe_start_failed' };

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
    await page.evaluate(() => {
      window.__EZD_PERF__.mark('pan-start');
    });
    // A separate task after the mark: the job runs from a microtask and settles within PROBE_RUN_MS.
    const job = await page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ok: false }), ms);
          queueMicrotask(() => {
            Promise.resolve()
              .then(() => window.__ezdraftWorkerProbe.run())
              .then(
                (r) => {
                  clearTimeout(timer);
                  resolve({ ok: true, r });
                },
                () => {
                  clearTimeout(timer);
                  resolve({ ok: false });
                },
              );
          });
        }),
      PROBE_RUN_MS,
    );
    await twoFrames(page);
    const end = await page.evaluate(() => {
      const p = window.__EZD_PERF__;
      p.mark('pan-end');
      return { longTasks: p.longTasks.slice(), panStart: p.panStart, panEnd: p.panEnd };
    });
    const events = tracing ? await stopTrace(browser) : [];
    tracing = false;

    if (!job.ok) return { error: 'probe_failed' };
    const r = job.r;
    if (typeof r !== 'object' || r === null || r.where !== 'worker') return { error: 'probe_not_worker' };
    if (typeof r.ranMs !== 'number' || !Number.isFinite(r.ranMs) || r.ranMs < WORKER_JOB_MIN_MS)
      return { error: 'probe_too_short' };

    const raw = end.longTasks
      .filter((t) => t.startTime >= end.panStart && t.startTime <= end.panEnd)
      .map((t) => ({ at: Math.round(t.startTime - end.panStart), ms: Math.round(t.duration) }))
      .sort((a, b) => a.at - b.at);
    const split = splitTasks(attributeTasks(events, raw), profile.cpuThrottleRate);
    return {
      longTasks: split.counted.length,
      tasks: split.counted,
      waits: split.waits,
      load1,
      rooms: r.rooms,
      passes: r.passes,
      ranMs: Math.round(r.ranMs),
      jobMs: Math.round(r.jobMs),
      where: r.where,
    };
  } finally {
    if (tracing) await stopTrace(browser);
    await cdp.detach().catch(() => {});
    await page.close();
  }
}

/** D-Details: the InputRow fields of one worker-job row from runWorkerJob's result. */
export function workerJobInput(result, profileName) {
  if (result.error !== undefined) return { error: result.error, details: { profile: profileName } };
  const { tasks, waits, load1, rooms, passes, ranMs, jobMs, where } = result;
  return {
    value: result.longTasks,
    details: { profile: profileName, tasks, waits, load1, rooms, passes, ranMs, jobMs, where },
  };
}
