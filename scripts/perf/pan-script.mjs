// EZD-017 Step 5 (vault/plans/EZD-017.md P1-P5, H1, H2): the scripted pan. Counts React commits, long tasks and
// animation frame intervals between the pan-start and pan-end marks (11 rule 4; Q-0073 (a)).
import path from 'node:path';
import { settlePage } from './js-size.mjs';

const HOOKS_PATH = path.join(import.meta.dirname, 'page-hooks.browser.js');

const PAN_PX = 300;
const STEPS = 45;
const STEP_WAIT_MS = 16;

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

const twoFrames = (page) =>
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
 * Runs the pan on baseUrl + panUrl in `context` (desktop profile). Resolves PanResult, or PanFailure
 * `{ error, status, reactDetected }` when the page does not load or has no canvas region (P1, P5).
 */
export async function runPan(context, baseUrl, panUrl) {
  await context.addInitScript({ path: HOOKS_PATH });
  const page = await context.newPage();
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

    // P3
    const intervals = [];
    for (let i = 1; i < end.rafTimes.length; i++) intervals.push(end.rafTimes[i] - end.rafTimes[i - 1]);
    return {
      reactDetected: end.renderers >= 1,
      renderers: end.renderers,
      commits: end.commits - startCommits,
      pointerMoves,
      longTasksPan: end.longTasks.filter((t) => t.startTime >= end.panStart && t.startTime <= end.panEnd)
        .length,
      longTasksLoad: end.longTasks.filter((t) => t.startTime < end.panStart).length,
      intervals,
    };
  } finally {
    await page.close();
  }
}
