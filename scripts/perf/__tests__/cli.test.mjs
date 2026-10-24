// EZD-017 T10, T11 (vault/plans/EZD-017.md section 4; K1, K3, K4; configs T-d). node:test; runs the CLI
// against the in-memory fixture server. Matches exit codes, ids, statuses and numbers, never wording.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startFixtureServer } from './fixture-server.mjs';
import {
  PAN_HTML,
  hasLatest,
  htmlPage,
  padJs,
  readHistory,
  readLatest,
  runCli,
  tmpDir,
  writeConfig,
} from './helpers.mjs';

const MEASUREMENTS = [
  { id: 'js-size:fixture-big', budget: 'download.client-link', url: '/big.html' },
  { id: 'js-size:fixture-small', budget: 'download.client-link', url: '/small.html' },
];

let server;

before(async () => {
  server = await startFixtureServer({
    '/pan.html': { body: PAN_HTML },
    '/big.html': { body: htmlPage(['/big.js']) },
    '/big.js': { body: padJs(400000) },
    '/small.html': { body: htmlPage(['/small.js']) },
    '/small.js': { body: padJs(10000) },
  });
});

after(async () => {
  await server?.close();
});

describe('EZD-017 perf CLI', () => {
  test('EZD-017 T10 Results on every run', { timeout: 300000 }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'out');
    const cfg = writeConfig(dir, MEASUREMENTS);
    const base = ['--config', cfg, '--out', out];

    const r1 = await runCli([...base, '--base-url', server.baseUrl, '--only', 'js-size:fixture-small']);
    assert.equal(r1.status, 0, r1.stdout + r1.stderr);
    const r2 = await runCli([...base, '--base-url', server.baseUrl, '--only', 'js-size:fixture-big']);
    assert.equal(r2.status, 1, r2.stdout + r2.stderr);
    const r3 = await runCli([...base, '--base-url', 'http://127.0.0.1:1']);
    assert.equal(r3.status, 1, r3.stdout + r3.stderr);

    const history = readHistory(out);
    assert.equal(history.length, 3);
    assert.deepEqual(
      history.map((h) => h.pass),
      [true, false, false],
    );
    for (const h of history) {
      assert.equal(h.schema, 1);
      assert.equal(typeof h.runAt, 'string');
      assert.ok(!Number.isNaN(Date.parse(h.runAt)), 'runAt is ISO');
      assert.equal(typeof h.machine, 'object');
      assert.notEqual(h.machine, null);
    }

    const latest = readLatest(out);
    assert.deepEqual(latest, history[2]);
    assert.equal(latest.error, 'base_url_unreachable');
    assert.equal(latest.browser, null);
  });

  test('EZD-017 T11 CLI usage', { timeout: 120000 }, async () => {
    const dir = tmpDir();
    const cfg = writeConfig(dir, MEASUREMENTS);
    const badDir = tmpDir();
    const badCfg = writeConfig(badDir, [
      { id: 'js-size:fixture-nope', budget: 'download.nope', url: '/small.html' },
    ]);

    const cases = [
      ['--only nope', cfg, ['--only', 'nope']],
      ['--bogus', cfg, ['--bogus']],
      ['budget download.nope', badCfg, []],
    ];
    for (const [name, config, extra] of cases) {
      const out = path.join(tmpDir(), 'out');
      const r = await runCli(['--config', config, '--base-url', server.baseUrl, '--out', out, ...extra]);
      assert.equal(r.status, 2, `${name}: exit ${r.status} ${r.stderr}`);
      assert.equal(hasLatest(out), false, `${name}: no latest.json`);
    }
  });
});
