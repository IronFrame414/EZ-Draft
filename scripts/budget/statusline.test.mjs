// EZD-000h T8: scripts/statusline.mjs writes usage.json from a fixture payload (vault/plans/EZD-000h.md C1-C3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, unlinkSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = () => {
  const r = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-statusline-')));
  mkdirSync(path.join(r, 'scripts'), { recursive: true });
  copyFileSync(path.join(repo, 'scripts/statusline.mjs'), path.join(r, 'scripts/statusline.mjs'));
  return r;
};
const run = (r, input) => spawnSync(process.execPath, [path.join(r, 'scripts/statusline.mjs')], { input, encoding: 'utf8' });
const PAYLOAD = '{"session_id":"fixture","rate_limits":{"five_hour":{"used_percentage":42,"resets_at":1893999600},"seven_day":{"used_percentage":63,"resets_at":1894255200}}}';

test('EZD-000h T8: statusline.mjs writes usage.json from a fixture payload, ignores payloads without meters', () => {
  const r = tmpRoot();
  const usage = path.join(r, 'vault/cost/usage.json');
  const sample = path.join(r, 'vault/cost/usage-raw-sample.json');
  const before = Date.now();
  const a = run(r, PAYLOAD);
  const after = Date.now();
  assert.equal(a.status, 0);
  assert.equal(a.stdout.trim(), '5h 42% · week 63%');
  const u = JSON.parse(readFileSync(usage, 'utf8'));
  const { read_at, ...rest } = u;
  assert.deepEqual(rest, {
    five_hour: { pct: 42, resets_at: '2030-01-07T07:00:00.000Z' },
    seven_day: { pct: 63, resets_at: '2030-01-10T06:00:00.000Z' },
    fable_seven_day: null,
    source: 'statusline',
  });
  assert.ok(Date.parse(read_at) >= before && Date.parse(read_at) <= after);
  assert.equal(readFileSync(sample, 'utf8'), PAYLOAD);
  // (b) no new sample once one has been taken
  unlinkSync(sample);
  const b = run(r, PAYLOAD);
  assert.equal(b.status, 0);
  assert.equal(existsSync(sample), false);
  // (c) no meters: exit 0, no usage.json
  const r2 = tmpRoot();
  for (const input of ['{"session_id":"x"}', 'not json']) {
    const c = run(r2, input);
    assert.equal(c.status, 0);
    assert.equal(c.stdout.trim(), 'usage: no data');
    assert.equal(c.stderr, '');
    assert.equal(existsSync(path.join(r2, 'vault/cost/usage.json')), false);
  }
  // settings and gitignore
  const settings = JSON.parse(readFileSync(path.join(repo, '.claude/settings.json'), 'utf8'));
  assert.equal(settings.statusLine.type, 'command');
  assert.ok(settings.statusLine.command.includes('scripts/statusline.mjs'));
  const lines = readFileSync(path.join(repo, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.ok(lines.includes('vault/cost/usage.json'));
  assert.ok(lines.includes('vault/cost/usage-raw-sample.json'));
});
