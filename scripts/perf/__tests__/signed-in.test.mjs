// EZD-1998 (AC-EZD-1998-1): the perf check measures signed-in pages of a seeded project. A page that needs a
// session opens with --storage-state; `{project}` in a config URL is filled from --project; a page that sends the
// browser elsewhere (a signed-out field page goes to /sign-in) is an error, never the other page's size; a row that
// needs a project and was given none is an error, never skipped. Expected sizes are C(x) from Node's zlib.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { C, htmlPage, padJs, readLatest, rowOf, runCli, tmpDir, writeConfig } from './helpers.mjs';

const PROJECT = '11111111-2222-4333-8444-555555555555';
const PAGE_JS = padJs(12000);
const SIGN_IN_JS = padJs(3000);

let server;
let baseUrl;

// A small server: /projects/<PROJECT>/field.html answers only with the cookie ezd=1, else 307 to /sign-in.html.
before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    const signedIn = (req.headers.cookie ?? '').split(/;\s*/).includes('ezd=1');
    const send = (type, body) => {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    };
    if (u.pathname === `/projects/${PROJECT}/field.html`) {
      if (!signedIn) {
        res.writeHead(307, { Location: '/sign-in.html' });
        res.end();
        return;
      }
      send('text/html', htmlPage(['/page.js']));
    } else if (u.pathname === '/sign-in.html') {
      // As the app: a signed-in visit to sign-in goes to the start page.
      if (signedIn) {
        res.writeHead(307, { Location: '/' });
        res.end();
        return;
      }
      send('text/html', htmlPage(['/sign-in.js']));
    }
    else if (u.pathname === '/page.js') send('text/javascript', PAGE_JS);
    else if (u.pathname === '/sign-in.js') send('text/javascript', SIGN_IN_JS);
    else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

function signedInState(dir) {
  const file = path.join(dir, 'state.json');
  const cookie = { name: 'ezd', value: '1', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true };
  writeFileSync(file, JSON.stringify({ cookies: [{ ...cookie, secure: false, sameSite: 'Lax' }], origins: [] }));
  return file;
}

async function run(extra) {
  const dir = tmpDir();
  const out = path.join(dir, 'out');
  const cfg = writeConfig(dir, [
    { id: 'js-size:fixture-field', budget: 'download.field-pack', url: '/projects/{project}/field.html' },
    { id: 'entry-contents:fixture-field', budget: 'contents.field-pack', url: '/projects/{project}/field.html' },
    { id: 'js-size:fixture-sign-in', budget: 'download.sign-in', url: '/sign-in.html' },
  ]);
  const only = extra.only ?? 'js-size:fixture-field';
  const args = ['--config', cfg, '--base-url', baseUrl, '--out', out, '--only', only];
  const r = await runCli([...args, ...extra.args(dir)]);
  return { r, out };
}

describe('EZD-1998 signed-in pages of a seeded project', () => {
  test('AC-EZD-1998-1 a signed-in page of the given project is measured', { timeout: 120000 }, async () => {
    const { r, out } = await run({ args: (dir) => ['--project', PROJECT, '--storage-state', signedInState(dir)] });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const row = rowOf(readLatest(out), 'js-size:fixture-field');
    assert.equal(row.status, 'pass');
    assert.equal(row.details.url, `/projects/${PROJECT}/field.html`);
    assert.equal(row.value, C(PAGE_JS));
    assert.deepEqual(
      row.details.files.map((f) => f.url),
      ['/page.js'],
    );
  });

  test('AC-EZD-1998-1 pages that do not name the project are measured signed out', { timeout: 120000 }, async () => {
    const { r, out } = await run({
      only: 'js-size:fixture-field,js-size:fixture-sign-in',
      args: (dir) => ['--project', PROJECT, '--storage-state', signedInState(dir)],
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(rowOf(readLatest(out), 'js-size:fixture-field').value, C(PAGE_JS));
    const signIn = rowOf(readLatest(out), 'js-size:fixture-sign-in');
    assert.equal(signIn.status, 'pass');
    assert.equal(signIn.value, C(SIGN_IN_JS));
  });

  test('AC-EZD-1998-1 a page that sends the browser to sign-in is an error, not the sign-in size', { timeout: 120000 }, async () => {
    const { r, out } = await run({
      only: 'js-size:fixture-field,entry-contents:fixture-field',
      args: () => ['--project', PROJECT],
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const id of ['js-size:fixture-field', 'entry-contents:fixture-field']) {
      const row = rowOf(readLatest(out), id);
      assert.equal(row.status, 'error', id);
      assert.equal(row.error, 'redirected', id);
      assert.equal(row.details.landedUrl, '/sign-in.html', id);
    }
  });

  test('AC-EZD-1998-1 a row that needs a project fails when the run names none', { timeout: 120000 }, async () => {
    const { r, out } = await run({ args: (dir) => ['--storage-state', signedInState(dir)] });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /PERF FAIL: js-size:fixture-field/);
    const row = rowOf(readLatest(out), 'js-size:fixture-field');
    assert.equal(row.status, 'error');
    assert.equal(row.error, 'no_project');
  });

  test('AC-EZD-1998-1 a bad project id or a missing session file is a usage error', { timeout: 60000 }, async () => {
    const bad = await run({ args: () => ['--project', 'not-a-project'] });
    assert.equal(bad.r.status, 2, bad.r.stdout + bad.r.stderr);
    const missing = await run({ args: (dir) => ['--project', PROJECT, '--storage-state', path.join(dir, 'nope.json')] });
    assert.equal(missing.r.status, 2, missing.r.stdout + missing.r.stderr);
  });

  test('AC-EZD-1998-1 the default config measures the real field pages, not /dev/entry/field', async () => {
    const { default: cfg } = await import('../perf.config.mjs');
    const { MEASUREMENTS } = await import('../registry.mjs');
    const urls = Object.fromEntries(cfg.measurements.map((m) => [m.id, m.url]));
    assert.equal(urls['js-size:field-pack'], '/projects/{project}/field');
    assert.equal(urls['entry-contents:field-pack'], '/projects/{project}/field');
    assert.equal(urls['js-size:field-measure'], '/projects/{project}/field-measure');
    assert.equal(urls['entry-contents:field-measure'], '/projects/{project}/field-measure');
    assert.ok(!Object.values(urls).includes('/dev/entry/field'));
    const byId = Object.fromEntries(MEASUREMENTS.map((m) => [m.id, m]));
    // 11 Budgets Download size: the field pack budget (200 KB) holds field measure too.
    assert.equal(byId['js-size:field-measure'].budget, 'download.field-pack');
    assert.equal(byId['js-size:field-measure'].status, 'active');
    assert.equal(byId['entry-contents:field-measure'].budget, 'contents.field-pack');
    const { BUDGETS } = await import('../budgets.mjs');
    assert.equal(BUDGETS['download.field-pack'].value, 200000);
    assert.equal(BUDGETS['download.field-pack'].kind, 'gate');
  });
});
