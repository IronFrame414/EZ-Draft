// EZD-164 S1-S7 (vault/plans/EZD-164.md section 4): summarize and redact.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, redact } from '../src/summarize.mjs';

const IDS = [
  'registered',
  'controlled',
  'cached',
  'offline_flag',
  'offline_reload',
  'same_render',
  'controlled_offline',
  'hydrated_offline',
  'uncached_fails',
];
const PROJECTS = ['desktop', 'ipad-landscape', 'phone'];
const VARIANTS = ['V1', 'V2'];

function result(project, variant, over = {}) {
  const checks = Object.fromEntries(IDS.map((id) => [id, true]));
  const r = {
    project,
    variant,
    browser: project === 'desktop' ? 'chromium' : 'webkit',
    version: '0.0',
    checks,
    ...over.top,
  };
  Object.assign(r.checks, over.checks);
  for (const k of over.drop ?? []) delete r.checks[k];
  return r;
}
const line = (r) => `  EZD-164 RESULT ${JSON.stringify(r)}`;

function log({ skip, extra = [], tweak = {} } = {}) {
  const lines = ['Running 6 tests using 1 worker', '  [phone] › offline-sw.spec.ts:1:1 › noise'];
  for (const p of PROJECTS)
    for (const v of VARIANTS) {
      if (skip === `${p}/${v}`) continue;
      lines.push(line(result(p, v, tweak[`${p}/${v}`])));
    }
  return [...lines, ...extra, '  6 passed'].join('\n');
}

describe('EZD-164 summarize', () => {
  it('EZD-164 S1 all pass', () => {
    const s = summarize(log());
    assert.equal(s.verdict, 'yes');
    assert.equal(s.chromiumControl, 'pass');
    assert.deepEqual(s.failedWebkitChecks, []);
    assert.equal(s.results.length, 6);
    assert.equal(s.results[0].project, 'desktop');
    assert.equal(s.results[0].variant, 'V1');
    assert.equal(s.results[5].project, 'phone');
    assert.equal(s.results[5].variant, 'V2');
  });

  it('EZD-164 S2 one WebKit check false', () => {
    const s = summarize(
      log({
        tweak: {
          'phone/V1': { checks: { hydrated_offline: false } },
          'ipad-landscape/V2': { checks: { same_render: false } },
        },
      }),
    );
    assert.equal(s.verdict, 'no');
    assert.deepEqual(s.failedWebkitChecks, [
      'ipad-landscape/V2/same_render',
      'phone/V1/hydrated_offline',
    ]);
  });

  it('EZD-164 S3 Chromium only false', () => {
    const s = summarize(log({ tweak: { 'desktop/V2': { checks: { uncached_fails: false } } } }));
    assert.equal(s.verdict, 'yes');
    assert.equal(s.chromiumControl, 'fail');
    assert.deepEqual(s.failedWebkitChecks, []);
  });

  it('EZD-164 S4 missing pair', () => {
    assert.throws(() => summarize(log({ skip: 'ipad-landscape/V2' })), {
      message: 'missing_result: ipad-landscape/V2',
    });
  });

  it('EZD-164 S5 duplicate pair', () => {
    const extra = [line(result('phone', 'V1'))];
    assert.throws(() => summarize(log({ extra })), { message: 'duplicate_result: phone/V1' });
  });

  it('EZD-164 S6 bad checks', () => {
    for (const tweak of [
      { drop: ['cached'] },
      { checks: { cached: 'yes' } },
      { top: { version: '' } },
    ]) {
      assert.throws(() => summarize(log({ tweak: { 'phone/V1': tweak } })), {
        message: 'bad_result: phone/V1',
      });
    }
  });

  it('EZD-164 S7 redact', () => {
    assert.equal(
      redact('a SECRET1 b SECRET2 SECRET1', ['SECRET1', '', 'SECRET2']),
      'a <redacted> b <redacted> <redacted>',
    );
  });
});
