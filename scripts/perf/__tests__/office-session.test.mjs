// EZD-2000 (AC-EZD-2000-1 (1); Q-0814 "every route has a download budget measured at its real page"): a config row
// with `session: 'office'` opens its page with the office session (--office-storage-state), so Projects, Settings and
// the editor are measured signed in as an office user; a row that needs it and was given none is an error, never
// a signed-out size. The default config measures every real page. Expected sizes are C(x) from Node's zlib.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { C, htmlPage, padJs, readLatest, rowOf, runCli, tmpDir, writeConfig } from './helpers.mjs';

const PAGE_JS = padJs(9000);
let server;
let baseUrl;

// /office.html answers only with the cookie office=1, else 307 to /sign-in.html.
before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    const signedIn = (req.headers.cookie ?? '').split(/;\s*/).includes('office=1');
    const send = (type, body) => {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    };
    if (u.pathname === '/office.html') {
      if (!signedIn) {
        res.writeHead(307, { Location: '/sign-in.html' });
        res.end();
        return;
      }
      send('text/html', htmlPage(['/page.js']));
    } else if (u.pathname === '/sign-in.html') send('text/html', htmlPage([]));
    else if (u.pathname === '/page.js') send('text/javascript', PAGE_JS);
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

function officeState(dir) {
  const file = path.join(dir, 'office.json');
  const cookie = { name: 'office', value: '1', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true };
  writeFileSync(file, JSON.stringify({ cookies: [{ ...cookie, secure: false, sameSite: 'Lax' }], origins: [] }));
  return file;
}

async function run(args, session = 'office', extra = [], only = 'js-size:fixture-office') {
  const dir = tmpDir();
  const out = path.join(dir, 'out');
  const cfg = writeConfig(dir, [
    { id: 'js-size:fixture-office', budget: 'download.projects-settings', url: '/office.html', session },
    ...extra,
  ]);
  const r = await runCli(['--config', cfg, '--base-url', baseUrl, '--out', out, '--only', only, ...args(dir)]);
  return { r, out };
}

describe('EZD-2000 office session rows', () => {
  test('EZD-2000 an office row opens with the office session', { timeout: 120000 }, async () => {
    const { r, out } = await run((dir) => ['--office-storage-state', officeState(dir)]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const row = rowOf(readLatest(out), 'js-size:fixture-office');
    assert.equal(row.status, 'pass');
    assert.equal(row.details.url, '/office.html');
    assert.equal(row.value, C(PAGE_JS));
  });

  test('EZD-2000 an office row with no office session is an error', { timeout: 120000 }, async () => {
    const { r, out } = await run(() => []);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const row = rowOf(readLatest(out), 'js-size:fixture-office');
    assert.equal(row.status, 'error');
    assert.equal(row.error, 'no_office_session');
  });

  test('EZD-2000 an unknown session or a missing session file is a usage error', { timeout: 60000 }, async () => {
    const bad = await run(() => [], 'crew');
    assert.equal(bad.r.status, 2, bad.r.stdout + bad.r.stderr);
    const missing = await run((dir) => ['--office-storage-state', path.join(dir, 'nope.json')]);
    assert.equal(missing.r.status, 2, missing.r.stdout + missing.r.stderr);
  });

  test('EZD-2000 a document-size row is the page HTML alone', { timeout: 120000 }, async () => {
    const doc = { id: 'document-size:fixture-office', budget: 'download.editor-document', url: '/office.html', session: 'office' };
    const { r, out } = await run((dir) => ['--office-storage-state', officeState(dir)], 'office', [doc], doc.id);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const row = rowOf(readLatest(out), doc.id);
    assert.equal(row.status, 'pass');
    assert.equal(row.value, C(htmlPage(['/page.js'])));
    assert.equal(row.details.jsBytes, 0);
  });

  test('EZD-2000 an allowance without its reason, or off a contents row, is a usage error', { timeout: 60000 }, async () => {
    const noReason = {
      id: 'entry-contents:fixture-office',
      budget: 'contents.office',
      url: '/office.html',
      allow: [{ key: 'pkg:@supabase/realtime-js', reason: '' }],
    };
    assert.equal((await run(() => [], 'office', [noReason])).r.status, 2);
    const offRow = [{ key: 'pkg:x', reason: 'a reason' }];
    const sizeRow = { id: 'js-size:fixture-other', budget: 'download.sign-in', url: '/office.html', allow: offRow };
    assert.equal((await run(() => [], 'office', [sizeRow])).r.status, 2);
  });

  test('EZD-2000 the default config measures Projects, Settings and the editor at their real pages', async () => {
    const { default: cfg } = await import('../perf.config.mjs');
    const byId = Object.fromEntries(cfg.measurements.map((m) => [m.id, m]));
    const office = [
      ['js-size:projects', '/', 'download.projects-settings'],
      ['js-size:settings-company', '/settings/company', 'download.projects-settings'],
      ['js-size:settings-users', '/settings/users', 'download.projects-settings'],
      ['js-size:editor-project', '/projects/{project}', 'download.editor'],
    ];
    for (const [id, url, budget] of office) {
      assert.equal(byId[id]?.url, url, id);
      assert.equal(byId[id]?.budget, budget, id);
      assert.equal(byId[id]?.session, 'office', id);
    }
    for (const m of cfg.measurements) {
      if (m.session === 'office') assert.ok(!m.url.startsWith('/dev/'), m.id);
    }
  });
});
