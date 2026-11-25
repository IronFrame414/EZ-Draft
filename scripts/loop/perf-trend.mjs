// EZD-1946 (audit 2026-11-23 B1, B2): the performance trend, recorded on develop once a day. When a lane is free and
// 24 h have passed since the last start, the loop builds develop in a detached worktree (.claude/worktrees/PERF-TREND)
// and runs that worktree's scripts/perf/run.mjs (the scripts/perf/check.mjs CLI), which appends one line to the main
// checkout's perf-results/history.jsonl. The editor's download size (download.editor, gzip -6 of the page's
// JavaScript by measureJsSize, the same measurement the gate's e2e size tests use) is logged, with a warning above 95%
// of its budget. A red perf run is trend only: logged, never a red check or a set-aside ticket. Node built-ins only,
// plus the budget table (scripts/perf/budgets.mjs); Playwright stays in the child process.
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BUDGETS } from '../perf/budgets.mjs';
import { release, slotsFrom, tryTake } from './heavy-lock.mjs';

export const PERF_TREND_ID = 'PERF-TREND';
export const TREND_HOURS = 24;
export const WARN_SHARE = 0.95;
export const EDITOR_BUDGET = 'download.editor';
export const STEP_TIMEOUT_MS = 45 * 60000;
export const HEAVY_LOCK = path.join(os.tmpdir(), 'ezdraft-check-heavy.lock');

const fmt = (n) => n.toLocaleString('en-US');

/** True when no trend run has started yet, or the last one started `hours` or more ago. */
export function perfDue(lastAt, nowMs = Date.now(), hours = TREND_HOURS) {
  const last = Date.parse(lastAt || '');
  return !Number.isFinite(last) || nowMs - last >= hours * 3600000;
}

/** The download.editor compressed size in bytes from one perf results object, or null when it was not measured. */
export function editorSize(results) {
  if (!results || results.error !== undefined) return null;
  const row = (results.measurements || []).find((m) => m.budgetId === EDITOR_BUDGET);
  if (!row || row.status === 'error' || row.status === 'pending' || typeof row.value !== 'number') return null;
  return row.value;
}

/** The warning line when the size is above 95% of the budget, else null. */
export function warnLine(size, budget = BUDGETS[EDITOR_BUDGET].value) {
  if (typeof size !== 'number' || !(size > WARN_SHARE * budget)) return null;
  const pct = ((size / budget) * 100).toFixed(1);
  return `PERF WARNING: download.editor is ${fmt(size)} bytes, ${pct}% of its ${fmt(budget)}-byte budget (warning above ${WARN_SHARE * 100}%)`;
}

/** The last line of history.jsonl as an object, or null. */
export function lastHistory(outDir) {
  const f = path.join(outDir, 'history.jsonl');
  if (!existsSync(f)) return null;
  const lines = readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  try { return lines.length ? JSON.parse(lines[lines.length - 1]) : null; } catch { return null; }
}

/** The log lines for one recorded trend entry: the size line, then the warning when there is one. */
export function trendLines(results, budget = BUDGETS[EDITOR_BUDGET].value) {
  const size = editorSize(results);
  const commit = results?.commit ? String(results.commit).slice(0, 8) : 'unknown';
  const verdict = results?.error ? `run error ${results.error}` : results?.pass ? 'pass' : 'fail';
  const lines = [size === null
    ? `perf trend recorded for develop ${commit} (${verdict}); download.editor was not measured`
    : `perf trend recorded for develop ${commit} (${verdict}): download.editor ${fmt(size)} of ${fmt(budget)} bytes`];
  const w = warnLine(size, budget);
  if (w) lines.push(w);
  return lines;
}

const tail = (out) => String(out || '').trim().split('\n').slice(-3).join(' | ').slice(0, 300);

/**
 * One trend run. `git(args, cwd)` -> { ok, out, err }; `run({ cmd, args, cwd, env, timeoutMs })` -> { code, out,
 * timedOut } (scripts/loop/check-run.mjs runCheck); `env` is the lane's environment; `log(line)`.
 * The heavy slot (scripts/loop/heavy-lock.mjs) is held for the build and the measurement, so they never compete with
 * another lane's build or e2e; `heavyWaitMs` bounds the wait for it. Returns { ok, lines }.
 */
export async function runPerfTrend({ root, env, git, run, log, lockBase = HEAVY_LOCK, sleep, heavyWaitMs = 4 * 3600000 }) {
  const wt = path.join(root, '.claude/worktrees', PERF_TREND_ID);
  const outDir = path.join(root, 'perf-results');
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const startedMs = Date.now();
  const fail = (why) => { const line = `perf trend not recorded: ${why}`; log(line); return { ok: false, lines: [line] }; };
  const g = existsSync(wt) ? git(['checkout', '-q', '--detach', '--force', 'develop'], wt) : git(['worktree', 'add', '-q', '--detach', wt, 'develop'], root);
  if (!g.ok) return fail(`worktree of develop (${String(g.err || '').slice(0, 200)})`);
  const step = async (name, cmd, args) => {
    const r = await run({ cmd, args, cwd: wt, env, timeoutMs: STEP_TIMEOUT_MS });
    return r.code === 0 ? null : `${name} ${r.timedOut ? 'timed out' : `exited ${r.code}`}: ${tail(r.out)}`;
  };
  const bad = await step('install', 'pnpm', ['install', '--frozen-lockfile']);
  if (bad) return fail(bad);
  let lock = null;
  const until = Date.now() + heavyWaitMs;
  while (!(lock = tryTake(lockBase, slotsFrom(path.join(root, 'vault/build/config.json')), `perf trend ${wt}`))) {
    if (Date.now() >= until) return fail('the heavy slot stayed busy');
    await wait(5000);
  }
  let perf;
  try {
    const b = await step('build', 'pnpm', ['run', 'build']);
    if (b) return fail(b);
    perf = await run({ cmd: process.execPath, args: [path.join(wt, 'scripts/perf/run.mjs'), '--out', outDir], cwd: wt, env, timeoutMs: STEP_TIMEOUT_MS });
  } finally {
    release(lock);
  }
  // Exit 0 pass, 1 a failed or errored row (results still written), 2 usage error (nothing written).
  if (perf.code !== 0 && perf.code !== 1) return fail(`perf check ${perf.timedOut ? 'timed out' : `exited ${perf.code}`}: ${tail(perf.out)}`);
  const entry = lastHistory(outDir);
  // A run that wrote nothing leaves an older line last; that one is not this run's.
  if (!entry || !(Date.parse(entry.runAt) >= startedMs - 1000)) return fail('the perf check wrote no history line');
  const lines = trendLines(entry);
  for (const l of lines) log(l);
  return { ok: true, lines };
}
