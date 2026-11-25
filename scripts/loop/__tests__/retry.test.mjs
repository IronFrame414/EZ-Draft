// EZD-1944 (audit 2026-11-23 W7): `node scripts/loop.mjs --retry <T>` replaces hand edits of state.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HISTORY_SHOWN, retryCli, retryTicket, setAsideMarkdown, takeInRetries } from '../retry.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const aside = (id, ts, reason) => ({ title: `Title of ${id}`, ts, reason, detail: 'last lines', branch: `t/${id}`, worktree: `.claude/worktrees/${id}` });
const baseState = () => ({
  done: ['EZD-001'], retries: { 'EZD-604': 1, 'EZD-700': 1 }, running: {},
  set_aside: { 'EZD-604': aside('EZD-604', '2026-11-23T02:41:00Z', 'check still red after 2 fix rounds (first try: builder crashed (no result))'), 'EZD-700': aside('EZD-700', '2026-11-22T10:00:00Z', 'reviewer error') },
});

function tempFiles(t, state) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'retry-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = { state: path.join(dir, 'state.json'), setAside: path.join(dir, 'set-aside.md') };
  writeFileSync(paths.state, JSON.stringify(state, null, 2) + '\n');
  return paths;
}

test('AC-EZD-1944-1: --retry moves the ticket out of set_aside and appends one history row with the five fields', (t) => {
  const paths = tempFiles(t, baseState());
  const out = [];
  const code = retryCli(['node', 'loop.mjs', '--retry', 'EZD-604', '--by', 'josh'], paths, { ts: '2026-11-24T12:00:00Z', print: (m) => out.push(m), printErr: (m) => out.push(m) });
  assert.equal(code, 0);
  const s = JSON.parse(readFileSync(paths.state, 'utf8'));
  assert.deepEqual(Object.keys(s.set_aside), ['EZD-700']);
  assert.deepEqual(s.set_aside_history, [{ ticket: 'EZD-604', reason: 'check still red after 2 fix rounds (first try: builder crashed (no result))',
    set_aside_ts: '2026-11-23T02:41:00Z', retried_ts: '2026-11-24T12:00:00Z', by: 'josh' }]);
  // Nothing else in the state changes.
  assert.deepEqual(s.done, ['EZD-001']);
  assert.deepEqual(s.retries, { 'EZD-604': 1, 'EZD-700': 1 });
  assert.match(out.join('\n'), /EZD-604 is back in the queue/);
});

test('AC-EZD-1944-1: a second retry appends to the history, it never replaces it; by defaults to the user name', (t) => {
  const paths = tempFiles(t, baseState());
  assert.equal(retryCli(['--retry', 'EZD-604'], paths, { ts: '2026-11-24T12:00:00Z', print() {}, user: 'josh' }), 0);
  assert.equal(retryCli(['--retry', 'EZD-700'], paths, { ts: '2026-11-24T12:05:00Z', print() {}, user: 'overseer' }), 0);
  const s = JSON.parse(readFileSync(paths.state, 'utf8'));
  assert.deepEqual(s.set_aside, {});
  assert.deepEqual(s.set_aside_history.map((h) => [h.ticket, h.by, h.retried_ts]), [['EZD-604', 'josh', '2026-11-24T12:00:00Z'], ['EZD-700', 'overseer', '2026-11-24T12:05:00Z']]);
});

test('AC-EZD-1944-1: a ticket that is not set aside is refused and the state file is left as it was', (t) => {
  const paths = tempFiles(t, baseState());
  const before = readFileSync(paths.state, 'utf8');
  const err = [];
  assert.equal(retryCli(['--retry', 'EZD-999'], paths, { print() {}, printErr: (m) => err.push(m) }), 1);
  assert.equal(readFileSync(paths.state, 'utf8'), before);
  assert.match(err.join('\n'), /EZD-999 is not set aside \(set aside now: EZD-604, EZD-700\)/);
  assert.equal(retryCli(['--retry'], paths, { print() {}, printErr() {} }), 2);
});

test('retryTicket does not change the state it is given', () => {
  const s = baseState();
  const copy = JSON.parse(JSON.stringify(s));
  const r = retryTicket(s, 'EZD-604', { by: 'josh', ts: '2026-11-24T12:00:00Z' });
  assert.equal(r.ok, true);
  assert.deepEqual(s, copy);
});

test('AC-EZD-1944-2: set-aside.md lists the open set-asides and the retry history with reasons', (t) => {
  const paths = tempFiles(t, baseState());
  retryCli(['--retry', 'EZD-604', '--by', 'josh'], paths, { ts: '2026-11-24T12:00:00Z', print() {} });
  const md = readFileSync(paths.setAside, 'utf8');
  assert.match(md, /## EZD-700 · Title of EZD-700\n- When: 2026-11-22T10:00:00Z\n- Reason: reviewer error/);
  assert.doesNotMatch(md, /## EZD-604 ·/);
  assert.match(md, /\| EZD-604 \| 2026-11-23T02:41:00Z \| 2026-11-24T12:00:00Z \| josh \| check still red after 2 fix rounds \(first try: builder crashed \(no result\)\) \|/);
  assert.match(md, /node scripts\/loop\.mjs --retry <ticket>/);
});

test('AC-EZD-1944-2: the history shows the last 20 rows only, newest first', () => {
  assert.equal(HISTORY_SHOWN, 20);
  const history = Array.from({ length: 25 }, (_, i) => ({ ticket: `EZD-${String(i + 1).padStart(3, '0')}`, reason: `reason ${i + 1}`, set_aside_ts: 'a', retried_ts: 'b', by: 'josh' }));
  const md = setAsideMarkdown({ set_aside: {}, set_aside_history: history });
  const rows = md.split('\n').filter((l) => /^\| EZD-/.test(l));
  assert.equal(rows.length, 20);
  assert.match(rows[0], /^\| EZD-025 .*reason 25 \|$/);
  assert.match(rows[19], /^\| EZD-006 .*reason 6 \|$/);
  assert.doesNotMatch(md, /EZD-005/);
  assert.match(md, /None\./);
});

test('set-aside.md with no history says so', () => {
  const md = setAsideMarkdown({ set_aside: {} });
  assert.match(md, /## History \(last 20 retries\)\n\nNone yet\./);
});

test('loop.mjs: --retry is wired to retryCli, writeSetAside uses the shared renderer and hand-edit adoption takes in the history', () => {
  const src = readFileSync(path.join(REPO, 'scripts/loop.mjs'), 'utf8');
  assert.match(src, /process\.argv\.includes\('--retry'\)\) \{\n\s*process\.exit\(retryCli\(process\.argv, \{ state: P\.state, setAside: P\.setAside \}\)\);/);
  assert.match(src, /function writeSetAside\(s\) \{ writeFileSync\(P\.setAside, setAsideMarkdown\(s\)\); \}/);
  assert.match(src, /s\.set_aside_history = disk\.set_aside_history/);
});

test('loop.mjs --retry with no ticket prints the usage and exits 2 without starting the loop', () => {
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/loop.mjs'), '--retry'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: node scripts\/loop\.mjs --retry <ticket>/);
});

test('AC-EZD-1944-1: a loop save after --retry keeps the retry (the in-memory state takes in the new history rows)', () => {
  const mem = baseState();
  const disk = retryTicket(baseState(), 'EZD-604', { by: 'josh', ts: '2026-11-24T12:00:00Z' }).state;
  // Meanwhile the loop set aside another ticket in memory; that entry must survive.
  mem.set_aside['EZD-800'] = aside('EZD-800', '2026-11-24T12:00:30Z', 'reviewer error');
  const added = takeInRetries(mem, disk);
  assert.deepEqual(added.map((h) => h.ticket), ['EZD-604']);
  assert.deepEqual(Object.keys(mem.set_aside).sort(), ['EZD-700', 'EZD-800']);
  assert.deepEqual(mem.set_aside_history, disk.set_aside_history);
  // Taking in again adds nothing.
  assert.deepEqual(takeInRetries(mem, disk), []);
  assert.deepEqual(Object.keys(mem.set_aside).sort(), ['EZD-700', 'EZD-800']);
});

test('loop.mjs: saveState takes in --retry rows before it writes state.json', () => {
  const src = readFileSync(path.join(REPO, 'scripts/loop.mjs'), 'utf8');
  const save = src.slice(src.indexOf('function saveState(s) {'), src.indexOf('function adoptHandEdits(s) {'));
  assert.ok(save.indexOf('takeInRetries(s, readJson(P.state, null))') >= 0);
  assert.ok(save.indexOf('takeInRetries') < save.indexOf('writeFileSync(tmp'));
});
