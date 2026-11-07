// EZD-359 (vault/plans/EZD-359.md D-Attr, D-Split): each pan long task's main-thread CPU time, GC time and longest inner event, from the pan's Chrome trace.

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

/**
 * D-Attr: each pan long task `{ at, ms }` gains `cpu` (its main-thread CPU time), `gc` (its garbage-collection time) and `top`
 * (its longest inner non-top-level event), whole ms, from the trace's top-level task within 3 ms of `at`; null when none matches.
 */
export function attributeTasks(events, tasks) {
  const none = (t) => ({ at: t.at, ms: t.ms, cpu: null, gc: null, top: null });
  const anchor = events.find((e) => e.name === PAN_START_MARK);
  if (anchor === undefined) return tasks.map(none);
  const thread = events.filter((e) => e.pid === anchor.pid && e.tid === anchor.tid);
  const top = outermost(
    thread.filter((e) => e.ph === 'X' && catOf(e).split(',').includes('toplevel')),
  ).filter((e) => durOf(e) > 50000);
  return tasks.map((t) => {
    let match = null;
    let best = Infinity;
    for (const e of top) {
      const diff = Math.abs((e.ts - anchor.ts) / 1000 - t.at);
      if (diff > 3) continue;
      if (diff < best || (diff === best && e.ts < match.ts)) {
        match = e;
        best = diff;
      }
    }
    if (match === null) return none(t);
    const start = match.ts;
    const stop = match.ts + durOf(match);
    const inside = thread.filter((e) => e.ts >= start && e.ts + durOf(e) <= stop);
    const gcEvents = outermost(inside.filter((e) => e.ph === 'X' && typeof e.name === 'string' && e.name.includes('GC')));
    const gcUs = gcEvents.reduce((s, e) => s + (typeof e.tdur === 'number' ? e.tdur : durOf(e)), 0);
    let longest = null;
    for (const e of inside) {
      if (catOf(e).includes('toplevel')) continue;
      if (longest === null || durOf(e) > durOf(longest)) longest = e;
    }
    return {
      at: t.at,
      ms: t.ms,
      cpu: typeof match.tdur === 'number' ? Math.round(match.tdur / 1000) : null,
      gc: Math.round(gcUs / 1000),
      top: longest === null ? null : longest.name,
    };
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
