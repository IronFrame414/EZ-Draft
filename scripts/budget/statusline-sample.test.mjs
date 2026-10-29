// EZD-240: scripts/statusline.mjs saves its raw sample only from a payload that yields both windows (vault/plans/EZD-240.md
// Sections 3-4, AC-EZD-240-1, AC-EZD-240-2; EZD-000h C1, C2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const NO_LIMITS = [
  '{"session_id":"06ee896f","cost":{"total_api_duration_ms":0}}',
  'not json',
  '',
  '{"rate_limits":null}',
  '{"rate_limits":[]}',
  '{"rate_limits":{}}',
  '{"rate_limits":{"five_hour":{"used_percentage":12,"resets_at":1793110200}}}',
];
const LIMITS =
  '{"session_id":"fixture","cost":{"total_api_duration_ms":1200},"rate_limits":{"five_hour":{"used_percentage":12,"resets_at":1793110200},"seven_day":{"used_percentage":34,"resets_at":1793599200}}}';
const LIMITS_2 =
  '{"session_id":"fixture-2","rate_limits":{"five_hour":{"used_percentage":56,"resets_at":1793110200},"seven_day":{"used_percentage":78,"resets_at":1793599200}}}';
const LIMITS_ISO =
  '{"rate_limits":{"five_hour":{"used_percentage":12,"resets_at":"2026-10-27T14:10:00.000Z"},"seven_day":{"used_percentage":34,"resets_at":"2026-11-02T06:00:00.000Z"}}}';

const tmpRoot = (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd240-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  copyFileSync(path.join(repo, 'scripts/statusline.mjs'), path.join(root, 'scripts/statusline.mjs'));
  return root;
};
const run = (root, input) =>
  spawnSync(process.execPath, [path.join(root, 'scripts/statusline.mjs')], { input, encoding: 'utf8' });
const sampleOf = (root) => path.join(root, 'vault/cost/usage-raw-sample.json');
const usageOf = (root) => path.join(root, 'vault/cost/usage.json');

test('EZD-240 T1: a payload without both meters writes no raw sample', (t) => {
  const root = tmpRoot(t);
  for (const input of NO_LIMITS) {
    const r = run(root, input);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.equal(r.stdout.trim(), 'usage: no data', r.stdout);
    assert.equal(existsSync(sampleOf(root)), false);
    assert.equal(existsSync(usageOf(root)), false);
  }
});

test('EZD-240 T2: the first payload with rate_limits after an early payload becomes the sample', (t) => {
  const root = tmpRoot(t);
  const early = run(root, NO_LIMITS[0]);
  assert.equal(early.status, 0, early.stderr);
  assert.equal(early.stderr, '');
  assert.equal(existsSync(sampleOf(root)), false);
  const r = run(root, LIMITS);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout.trim(), '5h 12% · week 34%', r.stdout);
  assert.equal(readFileSync(sampleOf(root), 'utf8'), LIMITS);
  const sample = JSON.parse(readFileSync(sampleOf(root), 'utf8'));
  assert.deepEqual(Object.keys(sample.rate_limits).sort(), ['five_hour', 'seven_day']);
  for (const w of [sample.rate_limits.five_hour, sample.rate_limits.seven_day]) {
    assert.equal(typeof w.used_percentage, 'number');
    assert.equal(typeof w.resets_at, 'number');
    assert.ok(w.resets_at < 1e10);
  }
  const usage = JSON.parse(readFileSync(usageOf(root), 'utf8'));
  assert.equal(usage.source, 'statusline');
  assert.equal(usage.five_hour.pct, 12);
  assert.equal(usage.seven_day.pct, 34);
});

test('EZD-240 T3: a later payload with rate_limits never replaces the sample', (t) => {
  const root = tmpRoot(t);
  const first = run(root, LIMITS);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stderr, '');
  assert.equal(readFileSync(sampleOf(root), 'utf8'), LIMITS);
  const second = run(root, LIMITS_2);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stderr, '');
  assert.equal(second.stdout.trim(), '5h 56% · week 78%', second.stdout);
  assert.equal(readFileSync(sampleOf(root), 'utf8'), LIMITS);
  const usage = JSON.parse(readFileSync(usageOf(root), 'utf8'));
  assert.equal(usage.five_hour.pct, 56);
  assert.equal(usage.seven_day.pct, 78);
});

test('EZD-240 T4: windows with ISO resets_at still give a sample', (t) => {
  const root = tmpRoot(t);
  const r = run(root, LIMITS_ISO);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout.trim(), '5h 12% · week 34%', r.stdout);
  assert.equal(readFileSync(sampleOf(root), 'utf8'), LIMITS_ISO);
  const usage = JSON.parse(readFileSync(usageOf(root), 'utf8'));
  assert.equal(usage.five_hour.resets_at, '2026-10-27T14:10:00.000Z');
  assert.equal(usage.seven_day.resets_at, '2026-11-02T06:00:00.000Z');
});
