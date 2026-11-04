// EZD-174 L1-L15 (vault/plans/EZD-174.md section 4): the pure lane rules (scripts/launcher-idle.mjs), the lanes switch
// (vault/tools/lanes.mjs), the window pause writer (scripts/budget.mjs) and the question numbering (scripts/records.mjs).
// Node built-ins only; every file is a temporary one; no live service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkTmp, repo } from './test-utils/harness.mjs';
import * as LL from '../launcher-idle.mjs';
import * as BU from '../budget.mjs';
import * as RC from '../records.mjs';
import { laneWorkdir, checkLaneEnv } from '../db/lane.mjs';

const loadLN = () => import(pathToFileURL(path.join(repo, 'vault/tools/lanes.mjs')).href);
const U = (unit, arg, resume = false) => ({ unit, arg, resume });
const N1 = [U('plan', 'EZD-9170'), U('plan', 'EZD-9171'), U('build', 'EZD-9147'), U('build', 'EZD-9148'), U('build', 'EZD-9149'), U('build', 'EZD-9150')];
const keys = (r) => r.start.map((u) => `${u.unit} ${u.arg}`);
const L63 = { lanes: 6, buildLanes: 3 };
const running = (...xs) => xs.map(([unit, arg, dbLane = 0]) => ({ unit, arg, dbLane }));

// A temporary root with vault/handoff and vault/tickets, and the given STATUS rows.
function tempRoot({ rows = [] } = {}) {
  const root = mkTmp('ezd174-lanes-');
  mkdirSync(path.join(root, 'vault/handoff'), { recursive: true });
  mkdirSync(path.join(root, 'vault/tickets'), { recursive: true });
  mkdirSync(path.join(root, 'vault/cost'), { recursive: true });
  writeFileSync(path.join(root, 'vault/tickets/STATUS.md'), statusText(rows));
  return root;
}
const statusText = (rows) => ['| Ticket | Phase | Title | Status | Complexity | Commit | Tests | Notes |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ...rows.map(([id, st, notes = '']) => `| ${id} | 1 | t | ${st} | low |  |  | ${notes} |`)].join('\n') + '\n';
const lanesJson = (root, o) => writeFileSync(path.join(root, 'vault/handoff/LANES.json'), typeof o === 'string' ? o : JSON.stringify(o));

test('EZD-174 L1 pickUnits fills lanes with plans first, builds up to the build lanes, and never offers a running arg twice (AC-EZD-174-1)', () => {
  let r = LL.pickUnits({ offered: N1, running: [], limits: L63 });
  assert.deepEqual(keys(r), ['plan EZD-9170', 'plan EZD-9171', 'build EZD-9147', 'build EZD-9148', 'build EZD-9149']);
  assert.equal(r.reason, null);
  r = LL.pickUnits({ offered: N1, running: running(['build', 'EZD-9147', 1], ['build', 'EZD-9148', 2], ['build', 'EZD-9149', 3]), limits: L63 });
  assert.deepEqual(keys(r), ['plan EZD-9170', 'plan EZD-9171'], 'three builds run: only plans start');
  r = LL.pickUnits({ offered: N1, running: running(...['EZD-9160', 'EZD-9161', 'EZD-9162', 'EZD-9163', 'EZD-9164', 'EZD-9165'].map((a) => ['plan', a])), limits: L63 });
  assert.deepEqual(r, { start: [], reason: 'all lanes busy' });
  r = LL.pickUnits({ offered: N1, running: running(['plan', 'EZD-9170']), limits: L63 });
  assert.deepEqual(keys(r), ['plan EZD-9171', 'build EZD-9147', 'build EZD-9148', 'build EZD-9149'], 'no second EZD-9170');
  assert.equal(r.reason, null);
});

test('EZD-174 L2 a phase-wide unit starts only when nothing runs and nothing starts beside it (AC-EZD-174-1)', () => {
  const Q = [U('questions', '1')];
  assert.deepEqual(LL.pickUnits({ offered: Q, running: [], limits: L63 }), { start: [Q[0]], reason: null });
  assert.deepEqual(LL.pickUnits({ offered: Q, running: running(['build', 'EZD-9147', 1]), limits: L63 }), { start: [], reason: 'waiting for running units before questions 1' });
  assert.deepEqual(LL.pickUnits({ offered: N1, running: running(['questions', '1']), limits: L63 }), { start: [], reason: 'phase-wide unit running: questions 1' });
});

test('EZD-174 L4 lanes off schedules one unit at a time, as today (AC-EZD-174-2)', async () => {
  assert.deepEqual(LL.laneLimits({ on: false }), { lanes: 1, buildLanes: 1 });
  const { lanesState } = await loadLN();
  const off = { on: false, lanes: 1, buildLanes: 1 };
  assert.deepEqual(lanesState({ root: tempRoot() }), off);
  const a = tempRoot();
  lanesJson(a, { lanes: 6, build_lanes: 3, off: true });
  assert.deepEqual(lanesState({ root: a }), off);
  const b = tempRoot();
  lanesJson(b, '{not json');
  assert.deepEqual(lanesState({ root: b }), off);
  assert.deepEqual(keys(LL.pickUnits({ offered: N1, running: [], limits: { lanes: 1, buildLanes: 1 } })), ['plan EZD-9170']);
});

test('EZD-174 L5 a five-hour pause starts no unit in any lane; the pause comes from the file first, then the meter (AC-EZD-174-3)', () => {
  assert.deepEqual(LL.pickUnits({ offered: N1, running: [], limits: L63, paused: true }), { start: [], reason: 'five-hour pause' });
  const now = Date.parse('2026-11-04T12:00:00.000Z');
  const hour = new Date(now + 3_600_000).toISOString();
  assert.deepEqual(LL.pauseFrom({ fileText: `# Five-hour window pause\n\n- Resume at: ${hour}\n`, decision: {}, now }), { until: hour, source: 'file' });
  const X = new Date(now + 7_200_000).toISOString();
  const past = new Date(now - 60_000).toISOString();
  assert.deepEqual(LL.pauseFrom({ fileText: `- Resume at: ${past}\n`, decision: { pause: { resume_at: X } }, now }), { until: X, source: 'meter' });
  assert.equal(LL.pauseFrom({ fileText: '', decision: {}, now }), null);
});

test('EZD-174 L6 the database lane of a build is the lowest free build lane; any other unit, or lanes off, is lane 0 (AC-EZD-174-1)', () => {
  const run13 = running(['build', 'EZD-1', 1], ['build', 'EZD-2', 3]);
  assert.equal(LL.dbLaneFor({ unit: 'build', running: run13, limits: L63, lanesOn: true }), 2);
  assert.equal(LL.dbLaneFor({ unit: 'build', running: [], limits: L63, lanesOn: true }), 1);
  assert.equal(LL.dbLaneFor({ unit: 'plan', running: [], limits: L63, lanesOn: true }), 0);
  assert.equal(LL.dbLaneFor({ unit: 'build', running: [], limits: L63, lanesOn: false }), 0);
  assert.equal(LL.dbLaneFor({ unit: 'build', running: running(['build', 'EZD-1', 1], ['build', 'EZD-2', 2], ['build', 'EZD-3', 3]), limits: L63, lanesOn: true }), null);
});

test('EZD-174 L7 a unit made progress when its STATUS row changed or it is no longer offered', () => {
  const row = statusText([['EZD-9147', 'in-progress']]).split('\n')[2];
  assert.equal(LL.unitProgress({ key: 'build EZD-9147', before: row, after: row, offeredAfter: ['build EZD-9147'] }), false);
  assert.equal(LL.unitProgress({ key: 'build EZD-9147', before: row, after: row, offeredAfter: ['plan EZD-9170'] }), true);
  assert.equal(LL.unitProgress({ key: 'build EZD-9147', before: row, after: row.replace('in-progress', 'review'), offeredAfter: ['build EZD-9147'] }), true);
  assert.equal(LL.statusRow(statusText([['EZD-9147', 'review']]), 'EZD-9147'), statusText([['EZD-9147', 'review']]).split('\n')[2]);
  assert.equal(LL.statusRow(statusText([]), 'EZD-9147'), '');
});

test('EZD-174 L8 the no-progress and repeat-failure guards set one key aside; three asides pause new starts', () => {
  const A = 'build EZD-1';
  const B = 'build EZD-2';
  const C = 'build EZD-3';
  const np = (s, key) => LL.guardAfterUnit(s, { key, outcome: 'ok', progress: false });
  const prog = (s, key) => LL.guardAfterUnit(s, { key, outcome: 'ok', progress: true });
  const err = (s, key, outcome = 'error') => LL.guardAfterUnit(s, { key, outcome, progress: false });
  let s = LL.createGuards();
  assert.equal(np(s, A).action, 'go');
  const second = np(s, A);
  assert.equal(second.action, 'aside');
  assert.equal(second.why, 'two runs without progress');
  assert.equal(second.stopText, `unit ${A} ended twice without progress; launcher stopped. See vault/handoff/CURRENT.md.`);
  s = LL.createGuards();
  assert.equal(np(s, A).action, 'go');
  assert.equal(prog(s, B).action, 'go');
  const perKey = np(s, A);
  assert.equal(perKey.action, 'aside', 'no-progress is per key: B\'s progress does not reset A');
  assert.equal(perKey.why, 'two runs without progress');
  s = LL.createGuards();
  assert.equal(err(s, A).action, 'go');
  const failed = err(s, A);
  assert.equal(failed.action, 'aside');
  assert.equal(failed.why, 'failing twice (error)');
  assert.equal(failed.stopText, `unit ${A} failed twice (error); launcher stopped.`);
  s = LL.createGuards();
  assert.equal(err(s, A).action, 'go');
  assert.equal(prog(s, A).action, 'go');
  assert.equal(err(s, A).action, 'go', 'error, ok, error: no aside');
  s = LL.createGuards();
  assert.equal(err(s, A, 'error:other').action, 'go');
  assert.equal(err(s, A, 'error:other').action, 'go', 'not retried: neither error nor max_turns/budget');
  s = LL.createGuards();
  const aside = (key) => { np(s, key); return np(s, key); };
  assert.equal(aside(A).pause, false);
  assert.equal(aside(B).pause, false);
  assert.equal(aside(C).pause, true, 'the third aside in a row pauses');
  s = LL.createGuards();
  aside(A);
  aside(B);
  prog(s, 'build EZD-4');
  assert.equal(aside(C).pause, false, 'a unit with progress in between resets the count');
});

test('EZD-174 L9 the lane environment is the one scripts/db/lane.mjs accepts for the ticket worktree', () => {
  const root = mkTmp('ezd174-env-');
  const wt = path.join(root, '.claude/worktrees/EZD-1');
  const env = LL.laneEnvFor({ root, ticket: 'EZD-1', lane: 2 });
  assert.deepEqual(env, { EZD_LANE: '2', SUPABASE_WORKDIR: path.join(wt, '.lanes', 'lane2') });
  assert.equal(env.SUPABASE_WORKDIR, laneWorkdir(wt, 2));
  assert.deepEqual(checkLaneEnv(env, wt), { lane: 2, workdir: laneWorkdir(wt, 2) });
  assert.throws(() => checkLaneEnv({ EZD_LANE: '2', SUPABASE_WORKDIR: path.join(root, '.lanes', 'lane2') }, wt), (e) => e.code === 'lane_env_mismatch');
});

test('EZD-174 L10 a limit writes the window pause file the launcher waits on (AC-EZD-174-3)', async () => {
  const root = tempRoot();
  const now = new Date('2026-11-04T12:00:00.000Z');
  const T = new Date(now.getTime() + 3_600_000);
  const resume = new Date(T.getTime() + 60_000).toISOString();
  BU.writeWindowPause({ root, now, pause: { pct: 100, resets_at: T.toISOString(), resume_at: resume } });
  const file = path.join(root, 'vault/handoff/WINDOW_PAUSE.md');
  assert.ok(readFileSync(file, 'utf8').includes(`- Resume at: ${resume}`));
  const slept = [];
  await BU.waitForWindow({ root, now, sleep: async (ms) => { slept.push(ms); } });
  assert.deepEqual(slept, [T.getTime() + 60_000 - now.getTime()]);
  assert.equal(existsSync(file), false);
  const ms = now.getTime();
  const iso = (x) => new Date(x).toISOString();
  assert.deepEqual(LL.limitPause({ limit: { until: T.toISOString() }, now: ms }), { pct: 100, resets_at: T.toISOString(), resume_at: resume });
  assert.equal(LL.limitPause({ limit: {}, now: ms }).resume_at, iso(ms + 1_860_000));
  assert.equal(LL.limitPause({ limit: { until: iso(ms - 3_600_000) }, now: ms }).resume_at, iso(ms + 60_000));
});

test('EZD-174 L11 the in-progress count, the limit file and turning lanes off', async () => {
  const { inProgressCount, inProgressLimit, turnOff } = await loadLN();
  const two = [['EZD-9001', 'in-progress'], ['EZD-9002', 'in-progress']];
  assert.equal(inProgressCount(statusText(two)), 2);
  assert.equal(inProgressCount(statusText([...two, ['EZD-9003', 'review']])), 3);
  assert.equal(inProgressCount(statusText([['EZD-9001', 'in-progress', 'batch: EZD-9001+EZD-9002'], ['EZD-9002', 'in-progress', 'batch: EZD-9001+EZD-9002']])), 1);
  assert.equal(inProgressLimit({ root: tempRoot() }), 1);
  const bad = tempRoot();
  lanesJson(bad, '{not json');
  assert.equal(inProgressLimit({ root: bad }), 1);
  const b2 = tempRoot();
  lanesJson(b2, { lanes: 6, build_lanes: 2, set_at: 'x' });
  assert.equal(inProgressLimit({ root: b2 }), 2);
  const off3 = tempRoot();
  lanesJson(off3, { lanes: 6, build_lanes: 3, off: true });
  assert.equal(inProgressLimit({ root: off3 }), 3, 'off does not lower the limit');
  assert.equal(turnOff({ root: tempRoot() }), false);
  const f = (root) => path.join(root, 'vault/handoff/LANES.json');
  const one = tempRoot({ rows: [['EZD-9001', 'in-progress']] });
  lanesJson(one, { lanes: 6, build_lanes: 3, set_at: 'x' });
  assert.equal(turnOff({ root: one }), 'deleted');
  assert.equal(existsSync(f(one)), false);
  const many = tempRoot({ rows: two });
  lanesJson(many, { lanes: 6, build_lanes: 3, set_at: 'x' });
  assert.equal(turnOff({ root: many }), 'draining');
  const kept = JSON.parse(readFileSync(f(many), 'utf8'));
  assert.equal(kept.off, true);
  assert.equal(kept.lanes, 6);
  assert.equal(turnOff({ root: many, force: true }), 'deleted');
  assert.equal(existsSync(f(many)), false);
});

test('EZD-174 L13 the lanes and boost switches print the wording of section 6 and refuse bad numbers', () => {
  const root = tempRoot();
  const cli = (tool, ...args) => spawnSync(process.execPath, [path.join(root, 'vault/tools', tool), ...args], { encoding: 'utf8' });
  mkdirSync(path.join(root, 'vault/tools'), { recursive: true });
  copyFileSync(path.join(repo, 'vault/tools/lanes.mjs'), path.join(root, 'vault/tools/lanes.mjs'));
  copyFileSync(path.join(repo, 'vault/tools/boost.mjs'), path.join(root, 'vault/tools/boost.mjs'));
  const on = 'lanes on: 2 units at once, at most 2 of them builds, until you turn them off';
  let r = cli('lanes.mjs', 'on');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), on);
  r = cli('lanes.mjs', 'on', '--lanes', '7');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('lanes must be 1 to 6'), r.stderr);
  r = cli('lanes.mjs', 'on', '--lanes', '2', '--build-lanes', '3');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('build lanes must be 1 to 2'), r.stderr);
  r = cli('lanes.mjs', 'on', '--lanes', 'x');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('lanes must be 1 to 6'), r.stderr);
  r = cli('lanes.mjs', 'status');
  assert.equal(r.stdout.trim(), on);
  writeFileSync(path.join(root, 'vault/tickets/STATUS.md'), statusText([['EZD-9001', 'in-progress'], ['EZD-9002', 'in-progress']]));
  r = cli('lanes.mjs', 'off');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'lanes off: the 2 tickets in progress finish first, one unit at a time; the launcher then removes vault/handoff/LANES.json');
  writeFileSync(path.join(root, 'vault/tickets/STATUS.md'), statusText([['EZD-9001', 'in-progress']]));
  r = cli('lanes.mjs', 'off');
  assert.equal(r.stdout.trim(), 'lanes off');
  r = cli('boost.mjs', 'on', '--lanes', '2');
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('usage: node vault/tools/boost.mjs on | off | status'), r.stderr);
  const reset = new Date(Date.now() + 86_400_000).toISOString();
  writeFileSync(path.join(root, 'vault/cost/usage.json'), JSON.stringify({ seven_day: { pct: 10, resets_at: reset } }));
  r = cli('boost.mjs', 'on');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), `boost on: normal models, $80 per-step cap, no weekly hold, until ${reset} (the weekly reset)`);
});

test('EZD-174 L14 a lane lease is a pid file written whole, removed without error; neverRejects hands an error to its handler', async () => {
  const dir = mkTmp('ezd174-lease-');
  LL.writeLease(2, 123, dir);
  const file = LL.leasePath(2, dir);
  assert.equal(path.basename(file), 'ezdraft-lane2.lease');
  assert.equal(readFileSync(file, 'utf8').trim(), '123');
  assert.deepEqual(readdirSync(dir), ['ezdraft-lane2.lease'], 'no temp file left');
  LL.removeLease(2, dir);
  LL.removeLease(2, dir);
  assert.equal(existsSync(file), false);
  const seen = [];
  const boom = new Error('boom');
  await LL.neverRejects(async () => { throw boom; }, (e) => seen.push(e));
  assert.deepEqual(seen, [boom]);
});

test('EZD-174 L15 a question number skips every number a queued results file holds; a cover with nothing to cover is a no-op', () => {
  const dir = mkTmp('ezd174-qid-');
  const db = RC.openRecords(path.join(dir, 'records.db'));
  const q = (id) => ({ op: 'question', row: { id, phase_ticket: '1 / EZD-1', asked_by: 'planner (2026-11-04)', question: 'q', status: 'open', answered_by: '', answer: '', source: '' } });
  RC.applyOps(db, [q('Q-0007')]);
  const own = path.join(dir, 'own.results.jsonl');
  writeFileSync(own, JSON.stringify(q('Q-0009')) + '\n');
  const sib = path.join(dir, 'queue');
  mkdirSync(sib);
  writeFileSync(path.join(sib, 'other.results.jsonl'), 'not json\n' + JSON.stringify(q('Q-0012')) + '\n');
  writeFileSync(path.join(sib, 'old.results.jsonl.applied'), JSON.stringify(q('Q-0020')) + '\n');
  assert.equal(RC.nextQuestionId(db, own, [sib]), 'Q-0013');
  const before = db.prepare('select * from findings').all();
  assert.doesNotThrow(() => RC.applyOps(db, [{ op: 'cover', category: 'docs', lesson: 'L-901' }]));
  assert.deepEqual(db.prepare('select * from findings').all(), before);
  db.close();
});
