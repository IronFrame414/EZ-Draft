// EZD-2012 (AC-EZD-2012-1, AC-EZD-2012-2; flaky-test audit 2026-11-27 row 5): the collector reads a page's scripts
// only when every script the document names has finished loading, so a verdict never depends on how fast the
// server answered. The racing condition is reproduced with a fixed delay: the page adds a script element after
// `load`, and the fixture server answers that script later than the collector's quiet second (1,000 ms,
// scripts/perf/js-size.mjs IDLE_MS). Run through the CLI against the fixture server with Chromium.
// Fixture maps as in js-contents.test.mjs: each source is a 10-character run of x, so every source is 10 bytes.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startFixtureServer } from './fixture-server.mjs';
import { C, PAN_HTML, checkRow, htmlPage, padJs, readLatest, rowOf, runCli, tmpDir, writeConfig } from './helpers.mjs';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlq(n) {
  let v = n < 0 ? (-n << 1) | 1 : n << 1;
  let s = '';
  do {
    let d = v & 31;
    v >>>= 5;
    if (v > 0) d |= 32;
    s += B64[d];
  } while (v > 0);
  return s;
}

const APP_T = './src/lib/messages/t.ts';
const REACT_DOM = '../node_modules/.pnpm/react-dom@19.0.0/node_modules/react-dom/cjs/x.js';
const THREE = '../node_modules/.pnpm/three@0.170.0/node_modules/three/build/three.module.js';

/** One JS file with an external map comment, and its map. */
function mapped(name, sources) {
  let mappings = '';
  sources.forEach((_, i) => {
    mappings += (i === 0 ? '' : ',') + vlq(i === 0 ? 0 : 10) + vlq(i === 0 ? 0 : 1) + vlq(0) + vlq(0);
  });
  return {
    [`/${name}.js`]: { body: 'x'.repeat(10 * sources.length) + `\n//# sourceMappingURL=/${name}.js.map\n` },
    [`/${name}.js.map`]: {
      body: JSON.stringify({ version: 3, sources, names: [], mappings }),
      type: 'application/json',
    },
  };
}

/** An inline script that names `src` in the document once the page has loaded. */
const addAfterLoad = (src) =>
  '<script>window.addEventListener("load", () => setTimeout(() => {' +
  'const s = document.createElement("script"); s.src = "' +
  src +
  '"; document.head.appendChild(s); }, 0));</script>';

// Later than the quiet second, well inside the collector's 15,000 ms limit.
const LATE_MS = 2500;
// Never answered within the collector's 15,000 ms limit.
const NEVER_MS = 120000;

const SIZE_A = padJs(10000);
const SIZE_LATE = padJs(5000);

let server;
before(async () => {
  const files = {
    '/pan.html': { body: PAN_HTML },
    // contents: a clean script in the document, and three in a script that arrives late.
    '/late.html': { body: htmlPage(['/first.js'], addAfterLoad('/late.js')) },
    ...mapped('first', [APP_T, REACT_DOM]),
    ...mapped('late', [THREE]),
    // size: the same shape with plain files.
    '/size-late.html': { body: htmlPage(['/size-a.js'], addAfterLoad('/size-late.js')) },
    '/size-a.js': { body: SIZE_A },
    '/size-late.js': { body: SIZE_LATE },
    // a named script that never finishes loading.
    '/stuck.html': { body: htmlPage(['/first.js'], addAfterLoad('/stuck.js')) },
    ...mapped('stuck', [THREE]),
  };
  files['/late.js'].delayMs = LATE_MS;
  files['/size-late.js'].delayMs = LATE_MS;
  files['/stuck.js'].delayMs = NEVER_MS;
  server = await startFixtureServer(files);
});
after(async () => {
  await server?.close();
});

async function run(measurements) {
  const dir = tmpDir();
  const out = path.join(dir, 'out');
  const cfg = writeConfig(dir, measurements);
  const r = await runCli([
    '--config',
    cfg,
    '--base-url',
    server.baseUrl,
    '--out',
    out,
    '--only',
    measurements.map((m) => m.id).join(','),
  ]);
  return { r, res: readLatest(out) };
}

describe('EZD-2012 scripts that load late', () => {
  test('EZD-2012 L1 a script the document names is read even when it arrives after the quiet second', { timeout: 200000 }, async () => {
    const { r, res } = await run([
      { id: 'entry-contents:fixture-late', budget: 'contents.field-pack', url: '/late.html' },
      { id: 'js-size:fixture-late', budget: 'download.client-link', url: '/size-late.html' },
    ]);

    // three is forbidden in the field pack (EZD-020 C4): missing the late script would be a silent pass.
    checkRow(
      rowOf(res, 'entry-contents:fixture-late'),
      (row) => {
        assert.equal(row.status, 'fail');
        assert.equal(row.value, 1);
        assert.deepEqual(
          row.details.forbidden.map((f) => ({ category: f.category, key: f.key })),
          [{ category: 'three', key: 'pkg:three' }],
        );
        assert.deepEqual(row.details.modules, {
          'app:lib/messages/t.ts': 10,
          'pkg:react-dom': 10,
          'pkg:three': 10,
        });
        assert.deepEqual(row.details.files.map((f) => f.url).sort(), ['/first.js', '/late.js']);
        assert.equal(row.details.pendingScripts, undefined);
      },
      r.stderr,
    );

    // The page's size counts both files (EZD-017 T5: each file's body compressed by the check).
    checkRow(
      rowOf(res, 'js-size:fixture-late'),
      (row) => {
        assert.equal(row.status, 'pass');
        assert.equal(row.value, C(SIZE_A) + C(SIZE_LATE));
        assert.deepEqual(row.details.files.map((f) => f.url).sort(), ['/size-a.js', '/size-late.js']);
      },
      r.stderr,
    );
    assert.equal(r.status, 1, r.stdout + r.stderr);
  });

  test('EZD-2012 L2 a named script that never finishes loading is an error naming it, never a pass', { timeout: 200000 }, async () => {
    const { r, res } = await run([
      { id: 'entry-contents:fixture-stuck', budget: 'contents.field-pack', url: '/stuck.html' },
    ]);
    checkRow(
      rowOf(res, 'entry-contents:fixture-stuck'),
      (row) => {
        assert.equal(row.status, 'error');
        assert.equal(row.error, 'scripts_not_loaded');
        assert.deepEqual(row.details.pendingScripts, ['/stuck.js']);
      },
      r.stderr,
    );
    assert.equal(r.status, 1, r.stdout + r.stderr);
  });

  test('EZD-2012 L3 a failed row assertion prints the row details', () => {
    const row = {
      id: 'entry-contents:fixture-x',
      status: 'error',
      error: 'missing_source_map',
      value: null,
      details: { url: '/x.html', files: [{ url: '/x.js', rawBytes: 21 }], missingMaps: ['/x.js'] },
    };
    let thrown;
    try {
      checkRow(row, (x) => assert.equal(x.status, 'fail'), 'Error: boom\n    at collect');
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown, 'the failed assertion is thrown again');
    assert.ok(thrown.cause instanceof assert.AssertionError, 'the first failure is kept as the cause');
    for (const part of [
      'row entry-contents:fixture-x',
      '"status": "error"',
      '"error": "missing_source_map"',
      '"missingMaps"',
      '"/x.js"',
      '"rawBytes": 21',
      'CLI stderr:',
      'Error: boom',
    ]) {
      assert.ok(thrown.message.includes(part), `the message has ${part}`);
    }

    // A row that is not in the results is named as missing.
    assert.throws(
      () => checkRow(undefined, (x) => assert.equal(x.status, 'fail')),
      /no such row in the results/,
    );
    // Passing assertions throw nothing.
    checkRow(row, (x) => assert.equal(x.status, 'error'));
  });
});
