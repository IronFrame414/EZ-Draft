// EZD-1996 (AC-EZD-1996-3): a page's download size counts its CSS, and a css-size row counts the CSS alone.
// node:test; runs the CLI against the in-memory fixture server with Chromium. Expected sizes are C(x) from Node's
// zlib in helpers.mjs (gzip level 6, Q-0071 (a)), never from the module under test.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startFixtureServer } from './fixture-server.mjs';
import { C, padJs, readLatest, rowOf, runCli, seeded, tmpDir, writeConfig } from './helpers.mjs';

const CSS = 'text/css; charset=utf-8';
const padCss = (n) => '.pad::after { content: "' + seeded(n) + '"; }\n';

const PAGE_JS = padJs(6000);
const ONE = padCss(4000);
const TWO = padCss(2500);
const LATER = padCss(9000);
// The page links two stylesheets; a click would add a third, which never counts (no user action).
const PAGE =
  '<!doctype html><html><head>' +
  '<link rel="stylesheet" href="/one.css"><link rel="stylesheet" href="/two.css">' +
  '<script src="/page.js"></script>' +
  "<script>document.addEventListener('click', () => { const l = document.createElement('link');" +
  " l.rel = 'stylesheet'; l.href = '/later.css'; document.head.append(l); });</script>" +
  '</head><body></body></html>';

let server;

before(async () => {
  server = await startFixtureServer({
    '/styled.html': { body: PAGE },
    '/page.js': { body: PAGE_JS },
    '/one.css': { body: ONE, type: CSS },
    '/two.css': { body: TWO, type: CSS, gzip: true },
    '/later.css': { body: LATER, type: CSS },
  });
});

after(async () => {
  await server?.close();
});

async function run(measurements, only) {
  const dir = tmpDir();
  const out = path.join(dir, 'out');
  const cfg = writeConfig(dir, measurements);
  const r = await runCli(['--config', cfg, '--base-url', server.baseUrl, '--out', out, '--only', only]);
  return { r, latest: readLatest(out) };
}

describe('EZD-1996 CSS in download sizes', () => {
  test('AC-EZD-1996-3 a download size row counts the page CSS with its JavaScript', { timeout: 200000 }, async () => {
    const { r, latest } = await run(
      [{ id: 'js-size:fixture-styled', budget: 'download.client-link', url: '/styled.html' }],
      'js-size:fixture-styled',
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const row = rowOf(latest, 'js-size:fixture-styled');
    assert.equal(row.status, 'pass');
    assert.equal(row.value, C(PAGE_JS) + C(ONE) + C(TWO));
    assert.equal(row.details.jsBytes, C(PAGE_JS));
    assert.equal(row.details.cssBytes, C(ONE) + C(TWO));
    assert.deepEqual(
      row.details.files.map((f) => [f.url, f.kind]).sort(),
      [
        ['/one.css', 'css'],
        ['/page.js', 'js'],
        ['/two.css', 'css'],
      ],
    );
    assert.equal(server.requests.filter((p) => p === '/later.css').length, 0, '/later.css never requested');
  });

  test('AC-EZD-1996-3 a css-size row counts the page CSS alone', { timeout: 200000 }, async () => {
    const { r, latest } = await run(
      [{ id: 'css-size:fixture-styled', budget: 'download.client-link', url: '/styled.html' }],
      'css-size:fixture-styled',
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const row = rowOf(latest, 'css-size:fixture-styled');
    assert.equal(row.status, 'pass');
    assert.equal(row.value, C(ONE) + C(TWO));
    assert.equal(row.details.cssBytes, C(ONE) + C(TWO));
    assert.deepEqual(row.details.files.map((f) => f.url).sort(), ['/one.css', '/two.css']);
  });

  test('AC-EZD-1996-3 the sign-in CSS has its own gate row measured at /sign-in', async () => {
    const { MEASUREMENTS } = await import('../registry.mjs');
    const { BUDGETS } = await import('../budgets.mjs');
    const { default: cfg } = await import('../perf.config.mjs');
    const m = MEASUREMENTS.find((x) => x.id === 'css-size:sign-in');
    assert.ok(m, 'registry row');
    assert.equal(m.status, 'active');
    assert.equal(m.collector, 'css-size');
    assert.equal(m.budget, 'download.sign-in-css');
    const b = BUDGETS['download.sign-in-css'];
    assert.equal(b.kind, 'gate');
    assert.equal(b.unit, 'bytes');
    assert.equal(b.value, 4580); // measured 4,163 + 10% = 4,579.3, rounded up
    assert.equal(cfg.measurements.find((x) => x.id === 'css-size:sign-in')?.url, '/sign-in');
  });
});
