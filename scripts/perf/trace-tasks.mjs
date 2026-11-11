// EZD-359 (vault/plans/EZD-359.md D-Attr, D-Split): each pan long task's main-thread CPU time, GC time and longest inner event, from the pan's Chrome trace.
// EZD-372: the 50 ms line (D-Match) and miss evidence (D-Miss).
// EZD-388 (vault/plans/EZD-388.md D-Count): the iPad pan row counts the trace's own tasks by CPU time × 4 (Q-0737 (a)).

/** D-Anchor: the user-timing mark page-hooks.browser.js makes at pan-start (same literal there; an init script cannot import). */
export const PAN_START_MARK = 'ezd-pan-start';

/** D-Consts: Playwright's default categories without the stack sampler, CPU profiler, console and latency, plus V8's GC events. */
export const TRACE_CATEGORIES = [
  '-*',
  'toplevel',
  'devtools.timeline',
  'blink.user_timing',
  'disabled-by-default-v8.gc',
];

/** D-Consts: the longest wait for browser.stopTracing(), in ms. */
export const TRACE_STOP_MS = 20000;

/** D-Read: the trace events in a stopTracing() buffer; anything that is not a trace gives []. Never throws. */
export function readTraceEvents(buf) {
  try {
    const parsed = JSON.parse(buf.toString('utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.traceEvents)) {
      return parsed.traceEvents;
    }
    return [];
  } catch {
    return [];
  }
}

const durOf = (e) => (typeof e.dur === 'number' ? e.dur : 0);
const catOf = (e) => (typeof e.cat === 'string' ? e.cat : '');

/** D-Attr (3): the outermost events, sorted by ts (ties: larger dur first); an event ending within the current outermost is nested. */
function outermost(events) {
  const sorted = [...events].sort((a, b) => a.ts - b.ts || durOf(b) - durOf(a));
  const out = [];
  let end = -Infinity;
  for (const e of sorted) {
    if (e.ts + durOf(e) <= end) continue;
    out.push(e);
    end = e.ts + durOf(e);
  }
  return out;
}

/** D-Shared: the thread's outermost top-level slices. */
function topLevel(thread) {
  return outermost(thread.filter((e) => e.ph === 'X' && catOf(e).split(',').includes('toplevel')));
}

/**
 * D-Attr: each pan long task `{ at, ms }` gains `cpu` (its main-thread CPU time), `gc` (its garbage-collection time) and `top`
 * (its longest inner non-top-level event), whole ms, from the trace's top-level task that starts within 3 ms of `at` and lasts over 50 ms or at least `ms` − 3 ms (EZD-372); null when none matches.
 */
export function attributeTasks(events, tasks) {
  const none = (t) => ({ at: t.at, ms: t.ms, cpu: null, gc: null, top: null });
  const anchor = events.find((e) => e.name === PAN_START_MARK);
  if (anchor === undefined) return tasks.map(none);
  const thread = events.filter((e) => e.pid === anchor.pid && e.tid === anchor.tid);
  const top = topLevel(thread);
  return tasks.map((t) => {
    const m = matchTop(
      top.filter((e) => durOf(e) > 50000 || durOf(e) >= (t.ms - 3) * 1000),
      anchor,
      t,
    );
    return m === null ? none(t) : { at: t.at, ms: t.ms, ...taskDetail(thread, m) };
  });
}

function matchTop(long, anchor, t) {
  let match = null;
  let best = Infinity;
  for (const e of long) {
    const diff = Math.abs((e.ts - anchor.ts) / 1000 - t.at);
    if (diff > 3) continue;
    if (diff < best || (diff === best && e.ts < match.ts)) {
      match = e;
      best = diff;
    }
  }
  return match;
}

function taskDetail(thread, e) {
  const start = e.ts;
  const stop = e.ts + durOf(e);
  const inside = thread.filter((x) => x.ts >= start && x.ts + durOf(x) <= stop);
  const gcEvents = outermost(inside.filter((x) => x.ph === 'X' && typeof x.name === 'string' && x.name.includes('GC')));
  const gcUs = gcEvents.reduce((s, x) => s + (typeof x.tdur === 'number' ? x.tdur : durOf(x)), 0);
  let longest = null;
  for (const x of inside) {
    if (catOf(x).includes('toplevel')) continue;
    if (longest === null || durOf(x) > durOf(longest)) longest = x;
  }
  return {
    cpu: typeof e.tdur === 'number' ? Math.round(e.tdur / 1000) : null,
    gc: Math.round(gcUs / 1000),
    top: longest === null ? null : longest.name,
  };
}

/** EZD-388 D-Count (Q-0737 (a)): the pan's top-level main-thread trace tasks whose CPU time × scale is over 50 ms, of any length (length when the trace gives no CPU time), plus each observed long task the trace has no task for or whose trace task is over the line; an observed long task whose trace task is under the line is a wait. null when the trace has no pan-start mark. */
export function countByCpu(events, tasks, scale, panMs) {
  const anchor = events.find((e) => e.name === PAN_START_MARK);
  if (anchor === undefined) return null;
  const thread = events.filter((e) => e.pid === anchor.pid && e.tid === anchor.tid);
  const top = outermost(thread.filter((e) => e.ph === 'X' && catOf(e).split(',').includes('toplevel')));
  const inWindow = (e) => e.ts - anchor.ts >= 0 && e.ts - anchor.ts <= panMs * 1000;
  const over = (e) => (typeof e.tdur === 'number' ? e.tdur : durOf(e)) * scale > 50000;
  const counted = [];
  const seen = new Set();
  for (const e of top) {
    if (!inWindow(e) || !over(e)) continue;
    counted.push({ at: Math.round((e.ts - anchor.ts) / 1000), ms: Math.round(durOf(e) / 1000), ...taskDetail(thread, e) });
    seen.add(e);
  }
  const long = top.filter((e) => durOf(e) > 50000);
  const waits = [];
  for (const t of tasks) {
    const m = matchTop(long, anchor, t);
    if (m === null) {
      counted.push({ at: t.at, ms: t.ms, cpu: null, gc: null, top: null });
    } else if (seen.has(m)) {
      continue;
    } else if (over(m)) {
      counted.push({ at: t.at, ms: t.ms, ...taskDetail(thread, m) });
      seen.add(m);
    } else {
      waits.push({ at: t.at, ms: t.ms, ...taskDetail(thread, m) });
    }
  }
  counted.sort((a, b) => a.at - b.at);
  return { counted, waits };
}

const MISS_REACH_MS = 20;
const MISS_MAX = 10;

/**
 * EZD-372 D-Miss: for each task with cpu null, whether the trace has the pan-start mark, its event count, and up to 10 top-level tasks within 20 ms of it (dt, dur, tdur in ms to one decimal).
 */
export function describeMisses(events, tasks) {
  const anchor = events.find((e) => e.name === PAN_START_MARK);
  const slices = anchor === undefined ? [] : topLevel(events.filter((e) => e.pid === anchor.pid && e.tid === anchor.tid));
  return tasks
    .filter((t) => t.cpu === null)
    .map((t) => {
      if (anchor === undefined) return { at: t.at, ms: t.ms, anchor: false, events: events.length, near: [] };
      const lo = anchor.ts + (t.at - MISS_REACH_MS) * 1000;
      const hi = anchor.ts + (t.at + t.ms + MISS_REACH_MS) * 1000;
      const gap = (e) => Math.abs(e.ts - anchor.ts - t.at * 1000);
      const near = slices
        .filter((e) => e.ts < hi && e.ts + durOf(e) > lo)
        .sort((a, b) => gap(a) - gap(b) || a.ts - b.ts)
        .slice(0, MISS_MAX)
        .sort((a, b) => a.ts - b.ts)
        .map((e) => ({
          dt: Math.round((e.ts - anchor.ts - t.at * 1000) / 100) / 10,
          dur: Math.round(durOf(e) / 100) / 10,
          tdur: typeof e.tdur === 'number' ? Math.round(e.tdur / 100) / 10 : null,
        }));
      return { at: t.at, ms: t.ms, anchor: true, events: events.length, near };
    });
}

/** D-Split (Q-0623): a task counts when its CPU time is unknown or cpu × rate − ms × (rate − 1) is over 50 ms (the throttle's spin shows as CPU time); the rest are waits. Input order kept. */
export function splitTasks(tasks, rate) {
  const counted = [];
  const waits = [];
  for (const t of tasks) {
    if (t.cpu === null || t.cpu * rate - t.ms * (rate - 1) > 50) counted.push(t);
    else waits.push(t);
  }
  return { counted, waits };
}
