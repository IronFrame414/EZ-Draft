// EZD-1995 (AC-EZD-1995-3): a download row whose config entry sets `document: true` also counts the page's HTML,
// where its screen messages travel; other rows still count JavaScript and CSS only. node:test; runs the CLI against
// the in-memory fixture server with Chromium. Expected sizes are C(x) from Node's zlib in helpers.mjs (gzip level 6,
// Q-0071 (a)), never from the module under test.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startFixtureServer } from './fixture-server.mjs';
import { C, padJs, readLatest, rowOf, runCli, seeded, tmpDir, writeConfig } from './helpers.mjs';

const CSS = 'text/css; charset=utf-8';
const PAGE_JS = padJs(5000);
const STYLE = '.pad::after { content: "' + seeded(3000) + '"; }\n';
const PAGE =
  '<!doctype html><html><head><link rel="stylesheet" href="/s.css"><script src="/p.js"></script></head><body>' +
  `<script>self.__next_f = self.__next_f || []; self.__next_f.push([1, ${JSON.stringify(seeded(4000))}])</script>` +
  '</body></html>';

let server;

before(async () => {
  server = await startFixtureServer({
    '/doc.html': { body: PAGE },
    '/p.js': { body: PAGE_JS },
    '/s.css': { body: STYLE, type: CSS },
  });
});

after(async () => {
  await server?.close();
});

async function run(entry) {
  const dir = tmpDir();
  const out = path.join(dir, 'out');
  const cfg = writeConfig(dir, [entry]);
  const r = await runCli(['--config', cfg, '--base-url', server.baseUrl, '--out', out, '--only', entry.id]);
  return { r, row: rowOf(readLatest(out), entry.id) };
}

describe('EZD-1995 the page document in a download size', () => {
  test('a row with document: true counts the HTML with the JavaScript and CSS', { timeout: 200000 }, async () => {
    const { r, row } = await run({
      id: 'js-size:fixture-doc',
      budget: 'download.client-link',
      url: '/doc.html',
      document: true,
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(row.value, C(PAGE) + C(PAGE_JS) + C(STYLE));
    assert.equal(row.details.documentBytes, C(PAGE));
    assert.equal(row.details.jsBytes, C(PAGE_JS));
    assert.equal(row.details.cssBytes, C(STYLE));
    assert.deepEqual(
      row.details.files.map((f) => [f.url, f.kind]).sort(),
      [
        ['/p.js', 'js'],
        ['/s.css', 'css'],
      ],
    );
    assert.deepEqual(
      row.details.documents.map((f) => [f.url, f.kind, f.compressedBytes]),
      [['/doc.html', 'html', C(PAGE)]],
    );
  });

  test('a row without it counts JavaScript and CSS only, as before', { timeout: 200000 }, async () => {
    const { r, row } = await run({ id: 'js-size:fixture-doc', budget: 'download.client-link', url: '/doc.html' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(row.value, C(PAGE_JS) + C(STYLE));
    assert.equal(row.details.documentBytes, undefined);
    assert.equal(row.details.documents, undefined);
  });

  test('the projects-settings and editor download rows count the document', async () => {
    const { default: cfg } = await import('../perf.config.mjs');
    const byId = Object.fromEntries(cfg.measurements.map((m) => [m.id, m]));
    assert.equal(byId['js-size:projects-settings'].document, true);
    assert.equal(byId['js-size:editor'].document, true);
    for (const id of ['js-size:sign-in', 'js-size:auth-confirm', 'js-size:field-pack', 'js-size:client-link']) {
      assert.equal(byId[id].document, undefined, id);
    }
  });
});
