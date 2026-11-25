// EZD-1946 (audit 2026-11-23 B1, B2): the loop's daily perf trend on develop. Expected numbers come from the AC text:
// once a day (24 h), a warning above 95% of the 500,000-byte download.editor budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGETS } from '../../perf/budgets.mjs';
import { PERF_TREND_ID, editorSize, perfDue, runPerfTrend, trendLines, warnLine } from '../perf-trend.mjs';

const H = 3600000;
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'perf-trend-'));
const results = (value, extra = {}) => ({
  schema: 1, runAt: new Date().toISOString(), commit: 'abcdef1234567', pass: true,
  measurements: [
    { id: 'js-size:sign-in', budgetId: 'download.sign-in', status: 'pass', value: 90000 },
    { id: 'js-size:editor', budgetId: 'download.editor', status: value > 500000 ? 'fail' : 'pass', value },
  ],
  ...extra,
});

test('the trend is due once a day: never run, or 24 h since the last start', () => {
  const t0 = Date.parse('2026-11-24T06:00:00Z');
  assert.equal(perfDue(undefined, t0), true);
  assert.equal(perfDue('2026-11-12T20:19:00Z', t0), true);
  assert.equal(perfDue('2026-11-23T06:00:00Z', t0), true, 'exactly 24 h');
  assert.equal(perfDue('2026-11-23T06:01:00Z', t0), false, '23 h 59 min');
  assert.equal(perfDue(new Date(t0 - H).toISOString(), t0), false);
});

test('the editor budget the warning uses is 500,000 bytes', () => {
  assert.equal(BUDGETS['download.editor'].value, 500000);
});

test('download.editor is read from the results row; missing or errored is null', () => {
  assert.equal(editorSize(results(494473)), 494473);
  assert.equal(editorSize({ ...results(1), error: 'server_not_ready', measurements: [] }), null);
  assert.equal(editorSize({ measurements: [{ id: 'js-size:editor', budgetId: 'download.editor', status: 'error', value: null }] }), null);
  assert.equal(editorSize({ measurements: [] }), null);
  assert.equal(editorSize(null), null);
});

test('a warning with the size only above 95% of 500,000 bytes', () => {
  assert.equal(warnLine(475000), null, 'exactly 95% is not above');
  assert.equal(warnLine(400000), null);
  assert.equal(warnLine(null), null);
  const w = warnLine(475001);
  assert.match(w, /^PERF WARNING/);
  assert.match(w, /475,001 bytes/);
  assert.match(w, /500,000-byte budget/);
  assert.match(warnLine(494473), /494,473 bytes, 98\.9%/);
});

test('trend lines: the size always, the warning only when near the budget', () => {
  const near = trendLines(results(494473));
  assert.equal(near.length, 2);
  assert.match(near[0], /download\.editor 494,473 of 500,000 bytes/);
  assert.match(near[0], /develop abcdef12/);
  assert.match(near[1], /^PERF WARNING.*494,473/);
  const ok = trendLines(results(300000));
  assert.equal(ok.length, 1);
  assert.match(ok[0], /300,000 of 500,000/);
  assert.match(trendLines({ error: 'no_build', measurements: [] })[0], /not measured/);
});

// A stub run: records each call and, for the perf step, appends a history line the way scripts/perf/check.mjs does.
function harness({ size = 494473, fail = {} } = {}) {
  const root = tmp();
  mkdirSync(path.join(root, 'vault/build'), { recursive: true });
  const calls = [];
  const logs = [];
  const lockBase = path.join(root, 'heavy.lock');
  const heldDuring = {};
  const git = (args, cwd) => { calls.push({ git: args, cwd }); if (args[0] === 'worktree') mkdirSync(args.at(-2), { recursive: true }); return { ok: true, out: '', err: '' }; };
  const run = async ({ cmd, args, cwd, env, timeoutMs }) => {
    const name = args.includes('install') ? 'install' : args.includes('build') ? 'build' : 'perf';
    calls.push({ name, cmd, args, cwd, env, timeoutMs });
    heldDuring[name] = existsSync(lockBase);
    if (fail[name]) return { code: fail[name], out: `${name} broke`, timedOut: false };
    if (name === 'perf') {
      const out = args[args.indexOf('--out') + 1];
      mkdirSync(out, { recursive: true });
      appendFileSync(path.join(out, 'history.jsonl'), JSON.stringify(results(size)) + '\n');
      return { code: size > 500000 ? 1 : 0, out: 'PERF PASS', timedOut: false };
    }
    return { code: 0, out: '', timedOut: false };
  };
  const opts = { root, env: { EZD_LANE: '2' }, git, run, log: (l) => logs.push(l), lockBase, sleep: async () => {} };
  return { root, calls, logs, lockBase, heldDuring, opts, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('a run builds develop in its own worktree, then runs the perf check into the main checkout history', async () => {
  const h = harness();
  try {
    const r = await runPerfTrend(h.opts);
    assert.equal(r.ok, true);
    const wt = path.join(h.root, '.claude/worktrees', PERF_TREND_ID);
    assert.deepEqual(h.calls[0].git, ['worktree', 'add', '-q', '--detach', wt, 'develop']);
    const steps = h.calls.filter((c) => c.name);
    assert.deepEqual(steps.map((c) => c.name), ['install', 'build', 'perf']);
    assert.deepEqual(steps[0].args, ['install', '--frozen-lockfile']);
    assert.deepEqual(steps[1].args, ['run', 'build']);
    const perf = steps[2];
    assert.equal(perf.cmd, process.execPath);
    assert.equal(perf.args[0], path.join(wt, 'scripts/perf/run.mjs'), "the worktree's own perf CLI, so it measures develop's build");
    assert.equal(perf.args[perf.args.indexOf('--out') + 1], path.join(h.root, 'perf-results'));
    for (const s of steps) { assert.equal(s.cwd, wt); assert.equal(s.env.EZD_LANE, '2'); assert.ok(s.timeoutMs > 0); }
    const hist = readFileSync(path.join(h.root, 'perf-results/history.jsonl'), 'utf8').trim().split('\n');
    assert.equal(hist.length, 1);
    assert.equal(JSON.parse(hist[0]).measurements[1].value, 494473);
    assert.match(h.logs.join('\n'), /download\.editor 494,473 of 500,000 bytes/);
    assert.match(h.logs.join('\n'), /PERF WARNING: download\.editor is 494,473 bytes/);
    assert.deepEqual(h.heldDuring, { install: false, build: true, perf: true }, 'the heavy slot covers the build and the measurement');
    assert.equal(existsSync(h.lockBase), false, 'the heavy slot is released');
  } finally { h.done(); }
});

test('a size well inside the budget logs no warning; a failed perf row is still recorded', async () => {
  const h = harness({ size: 300000 });
  try {
    await runPerfTrend(h.opts);
    assert.equal(h.logs.some((l) => /PERF WARNING/.test(l)), false);
  } finally { h.done(); }
  const over = harness({ size: 510000 });
  try {
    const r = await runPerfTrend(over.opts);
    assert.equal(r.ok, true, 'perf exit 1 (a failed row) is trend, not an error');
    assert.match(over.logs.join('\n'), /PERF WARNING: download\.editor is 510,000 bytes/);
  } finally { over.done(); }
});

test('a failed build is logged, runs no perf check and releases the heavy slot', async () => {
  const h = harness({ fail: { build: 1 } });
  try {
    const r = await runPerfTrend(h.opts);
    assert.equal(r.ok, false);
    assert.equal(h.calls.some((c) => c.name === 'perf'), false);
    assert.match(h.logs[0], /^perf trend not recorded: build exited 1/);
    assert.equal(existsSync(h.lockBase), false);
  } finally { h.done(); }
});

test('a perf usage error (exit 2, nothing written) is reported as not recorded', async () => {
  const h = harness({ fail: { perf: 2 } });
  try {
    const r = await runPerfTrend(h.opts);
    assert.equal(r.ok, false);
    assert.match(h.logs[0], /perf check exited 2/);
    assert.equal(existsSync(h.lockBase), false);
  } finally { h.done(); }
});

test('an existing trend worktree is moved to develop instead of added again', async () => {
  const h = harness();
  try {
    mkdirSync(path.join(h.root, '.claude/worktrees', PERF_TREND_ID), { recursive: true });
    await runPerfTrend(h.opts);
    assert.deepEqual(h.calls[0].git, ['checkout', '-q', '--detach', '--force', 'develop']);
  } finally { h.done(); }
});

test('the loop starts the trend on a free lane once a day and keeps it out of the ticket bookkeeping', () => {
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../loop.mjs'), 'utf8');
  assert.match(src, /from '\.\/loop\/perf-trend\.mjs'/);
  assert.match(src, /perfDue\(s\.perf_trend_at/);
  assert.match(src, /runPerfTrend\(/);
  assert.match(src, /s\.running\[PERF_TREND_ID\]/);
});
