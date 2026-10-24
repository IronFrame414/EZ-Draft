// EZD-017 T3, T4, T6 (vault/plans/EZD-017.md section 4; fixtures T-b, T-c; configs T-d). node:test; runs the
// CLI against the in-memory fixture server with Chromium (root @playwright/test). Expected sizes are C(x) from
// Node's zlib in helpers.mjs, never from the module under test. Table B client link 200,000 bytes (Q-0071 (a)).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startFixtureServer } from './fixture-server.mjs';
import {
  C,
  PAN_HTML,
  htmlPage,
  mainJs,
  padJs,
  readLatest,
  rowOf,
  runCli,
  seeded,
  tmpDir,
  writeConfig,
} from './helpers.mjs';

const BIG = padJs(400000);
const SMALL = padJs(10000);
const MAIN = mainJs();
const ON_CLICK = padJs(50000);
const AT_START = padJs(20000);
const WORKER = padJs(8000);
const SW = padJs(30000);
const A = padJs(10000);
const B = padJs(5000);
// T-c: lazy.html puts <script>const inline = "<seeded(40000)>";</script> before main.js.
const LAZY_INLINE = '<script>const inline = "' + seeded(40000) + '";</script>';

let server;

before(async () => {
  server = await startFixtureServer({
    '/pan.html': { body: PAN_HTML },
    '/big.html': { body: htmlPage(['/big.js']) },
    '/big.js': { body: BIG },
    '/small.html': { body: htmlPage(['/small.js']) },
    '/small.js': { body: SMALL },
    '/lazy.html': { body: htmlPage(['/main.js'], LAZY_INLINE) },
    '/main.js': { body: MAIN },
    '/on-click.js': { body: ON_CLICK },
    '/at-start.js': { body: AT_START },
    '/worker.js': { body: WORKER },
    '/sw.js': { body: SW },
    '/dup.html': { body: htmlPage(['/a.js', '/a.js', '/b.js']) },
    '/a.js': { body: A },
    '/b.js': { body: B, gzip: true },
  });
});

after(async () => {
  await server?.close();
});

describe('EZD-017 JavaScript size', () => {
  test(
    'EZD-017 done when: an oversize bundle fails the check (T3)',
    { timeout: 200000 },
    async () => {
      assert.ok(C(BIG) > 200000, 'C(big.js) is over the 200,000-byte client-link budget');

      const dir = tmpDir();
      const out = path.join(dir, 'out');
      const cfg = writeConfig(dir, [
        { id: 'js-size:fixture-big', budget: 'download.client-link', url: '/big.html' },
        { id: 'js-size:fixture-small', budget: 'download.client-link', url: '/small.html' },
      ]);
      const r = await runCli([
        '--config',
        cfg,
        '--base-url',
        server.baseUrl,
        '--out',
        out,
        '--only',
        'js-size:fixture-big,js-size:fixture-small',
      ]);
      // (a)
      assert.equal(r.status, 1, r.stdout + r.stderr);
      const latest = readLatest(out);
      const big = rowOf(latest, 'js-size:fixture-big');
      assert.equal(big.status, 'fail');
      assert.equal(big.value, C(BIG));
      // (b)
      const small = rowOf(latest, 'js-size:fixture-small');
      assert.equal(small.status, 'pass');
      assert.equal(small.value, C(SMALL));

      // (c) a pan page with no React: the commit row is an error, never 0 (H1).
      const out2 = path.join(dir, 'out-pan');
      const r2 = await runCli([
        '--config',
        cfg,
        '--base-url',
        server.baseUrl,
        '--out',
        out2,
        '--only',
        'react-commits-during-pan',
      ]);
      assert.equal(r2.status, 1, r2.stdout + r2.stderr);
      const pan = rowOf(readLatest(out2), 'react-commits-during-pan');
      assert.equal(pan.status, 'error');
      assert.equal(pan.details.reactDetected, false);
    },
  );

  test('EZD-017 T4 Only no-action JavaScript counts', { timeout: 200000 }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'out');
    const cfg = writeConfig(dir, [
      { id: 'js-size:fixture-lazy', budget: 'download.client-link', url: '/lazy.html' },
    ]);
    const r = await runCli([
      '--config',
      cfg,
      '--base-url',
      server.baseUrl,
      '--out',
      out,
      '--only',
      'js-size:fixture-lazy',
    ]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const row = rowOf(readLatest(out), 'js-size:fixture-lazy');
    assert.ok(row, 'row present');
    assert.equal(row.value, C(MAIN) + C(AT_START) + C(WORKER));
    assert.deepEqual(
      row.details.files.map((f) => f.url).sort(),
      ['/at-start.js', '/main.js', '/worker.js'],
    );
    const excluded = row.details.excludedServiceWorkerBytes;
    assert.ok(excluded === 0 || excluded === C(SW), `excludedServiceWorkerBytes ${excluded}`);
    // The request log was read (L-019): the files loaded without a user action are in it.
    assert.ok(server.requests.includes('/main.js'), '/main.js requested');
    assert.ok(server.requests.includes('/at-start.js'), '/at-start.js requested');
    assert.equal(
      server.requests.filter((p) => p === '/on-click.js').length,
      0,
      '/on-click.js never requested',
    );
  });

  test('EZD-017 T5 Each file once, body compressed by the check', { timeout: 200000 }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'out');
    const cfg = writeConfig(dir, [
      { id: 'js-size:fixture-dup', budget: 'download.client-link', url: '/dup.html' },
    ]);
    const r = await runCli([
      '--config',
      cfg,
      '--base-url',
      server.baseUrl,
      '--out',
      out,
      '--only',
      'js-size:fixture-dup',
    ]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const row = rowOf(readLatest(out), 'js-size:fixture-dup');
    assert.equal(row.status, 'pass');
    // C on the plain bodies, never the gzip-encoded wire bytes (S3).
    assert.equal(row.value, C(A) + C(B));
    assert.equal(row.details.files.length, 2);
    assert.deepEqual(
      row.details.files.map((f) => f.url).sort(),
      ['/a.js', '/b.js'],
    );
  });

  test('EZD-017 T6 A broken route is an error', { timeout: 200000 }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'out');
    const cfg = writeConfig(dir, [
      { id: 'js-size:fixture-missing', budget: 'download.client-link', url: '/missing.html' },
    ]);
    const r = await runCli([
      '--config',
      cfg,
      '--base-url',
      server.baseUrl,
      '--out',
      out,
      '--only',
      'js-size:fixture-missing',
    ]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const latest = readLatest(out);
    assert.equal(latest.pass, false);
    const row = rowOf(latest, 'js-size:fixture-missing');
    assert.equal(row.status, 'error');
    assert.equal(row.details.status, 404);
  });
});
