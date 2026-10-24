// EZD-020 C4, C5 (vault/plans/EZD-020.md section 4; Steps 5-6): entry-contents collector and bundle report, run
// through the CLI against EZD-017's fixture server with Chromium. Fixture maps are built here with this file's own
// VLQ encoder, never the module under test: each source is a 10-character run of x on one line (segments at
// columns 0, 10, 20, ...), so every source is worth 10 bytes.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { startFixtureServer } from './fixture-server.mjs';
import { PAN_HTML, htmlPage, readLatest, rowOf, runCli, tmpDir, writeConfig } from './helpers.mjs';

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
const SHELL_A = './src/components/shell/EditorFrame.tsx';
const SHELL_B = './src/components/shell/ToolRail.tsx';
const LAZY = './src/lazy/dev-sample/index.ts';
const APP_X = './src/lib/x.ts';
const EXPORTER =
  '../node_modules/.pnpm/three@0.170.0/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
const PDF = '../node_modules/.pnpm/pdfjs-dist@5.0.0/node_modules/pdfjs-dist/build/pdf.mjs';

/** One JS file plus its map: returns { js (without comment), map (object) }. */
function make(sources) {
  let mappings = '';
  sources.forEach((_, i) => {
    mappings += (i === 0 ? '' : ',') + vlq(i === 0 ? 0 : 10) + vlq(i === 0 ? 0 : 1) + vlq(0) + vlq(0);
  });
  return {
    js: 'x'.repeat(10 * sources.length) + '\n',
    map: { version: 3, sources, names: [], mappings },
  };
}

const files = {};
const pages = {};
function addEntry(name, sources, { comment = 'external' } = {}) {
  const m = make(sources);
  let js = m.js;
  if (comment === 'external') {
    js += `//# sourceMappingURL=/${name}.js.map\n`;
    files[`/${name}.js.map`] = { body: JSON.stringify(m.map), type: 'application/json' };
  } else if (comment === 'inline') {
    js +=
      '//# sourceMappingURL=data:application/json;base64,' +
      Buffer.from(JSON.stringify(m.map)).toString('base64') +
      '\n';
  }
  files[`/${name}.js`] = { body: js };
  files[`/${name}.html`] = { body: htmlPage([`/${name}.js`]) };
  pages[name] = `/${name}.html`;
}

addEntry('clean', [APP_T, REACT_DOM]);
addEntry('three', [APP_T, REACT_DOM, THREE]);
addEntry('shell', [SHELL_A, SHELL_B, APP_T]);
addEntry('lazy', [LAZY, APP_X]);
addEntry('exporter', [EXPORTER, APP_X]);
addEntry('pdf', [PDF, APP_X]);
addEntry('nomap', [APP_T, REACT_DOM], { comment: 'none' });
addEntry('noapp', [REACT_DOM]);
addEntry('inline', [APP_T, REACT_DOM], { comment: 'inline' });
// two-files: one clean file and one with three.
{
  addEntry('twoa', [APP_T, REACT_DOM]);
  addEntry('twob', [THREE]);
  files['/two.html'] = { body: htmlPage(['/twoa.js', '/twob.js']) };
  pages.two = '/two.html';
}

const row = (suffix, budget, page) => ({
  id: `entry-contents:fixture-${suffix}`,
  budget,
  url: pages[page],
});
const MEASUREMENTS = [
  row('clean', 'contents.field-pack', 'clean'),
  row('three-field', 'contents.field-pack', 'three'),
  row('three-editor', 'contents.editor', 'three'),
  row('shell', 'contents.client-link', 'shell'),
  row('lazy-office', 'contents.office', 'lazy'),
  row('lazy-editor', 'contents.editor', 'lazy'),
  row('exporter', 'contents.editor', 'exporter'),
  row('pdf', 'contents.editor', 'pdf'),
  row('nomap', 'contents.field-pack', 'nomap'),
  row('noapp', 'contents.field-pack', 'noapp'),
  row('inline', 'contents.field-pack', 'inline'),
];

let server;
before(async () => {
  server = await startFixtureServer({ '/pan.html': { body: PAN_HTML }, ...files });
});
after(async () => {
  await server?.close();
});

const strip = (list) => list.map((f) => ({ category: f.category, key: f.key }));

async function run(measurements, extra = []) {
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
    ...extra,
  ]);
  return { r, out, res: readLatest(out) };
}

describe('EZD-020 entry contents', () => {
  test('EZD-020 C4 contents verdicts', { timeout: 300000 }, async () => {
    const { res } = await run(MEASUREMENTS);
    const get = (s) => rowOf(res, `entry-contents:fixture-${s}`);

    const a = get('clean');
    assert.equal(a.status, 'pass');
    assert.equal(a.value, 0);
    assert.deepEqual(a.details.forbidden, []);
    assert.deepEqual(a.details.modules, { 'app:lib/messages/t.ts': 10, 'pkg:react-dom': 10 });

    const bf = get('three-field');
    assert.equal(bf.status, 'fail');
    assert.equal(bf.value, 1);
    assert.deepEqual(strip(bf.details.forbidden), [{ category: 'three', key: 'pkg:three' }]);
    const be = get('three-editor');
    assert.equal(be.status, 'pass');
    assert.equal(be.value, 0);

    const c = get('shell');
    assert.equal(c.status, 'fail');
    assert.equal(c.value, 1);
    assert.deepEqual(strip(c.details.forbidden), [
      { category: 'editor', key: 'app:components/shell/' },
    ]);

    for (const s of ['lazy-office', 'lazy-editor']) {
      const d = get(s);
      assert.equal(d.status, 'fail', s);
      assert.equal(d.value, 1, s);
      assert.deepEqual(strip(d.details.forbidden), [
        { category: 'lazy', key: 'app:lazy/dev-sample/' },
      ]);
    }

    const e = get('exporter');
    assert.equal(e.status, 'fail');
    assert.equal(e.value, 1);
    assert.deepEqual(strip(e.details.forbidden), [
      { category: 'heavy', key: 'pkg:three/examples/jsm/exporters/' },
    ]);

    const f = get('pdf');
    assert.equal(f.status, 'fail');
    assert.equal(f.value, 1);
    assert.deepEqual(strip(f.details.forbidden), [{ category: 'heavy', key: 'pkg:pdfjs-dist' }]);

    const g = get('nomap');
    assert.equal(g.status, 'error');
    assert.deepEqual(g.details.missingMaps, ['/nomap.js']);

    const h = get('noapp');
    assert.equal(h.status, 'error');
    assert.equal(h.details.reason, 'no app sources');

    const i = get('inline');
    assert.equal(i.status, 'pass');
    assert.ok('app:lib/messages/t.ts' in i.details.modules);

    const j = await run([row('two', 'contents.field-pack', 'two')]);
    const jr = rowOf(j.res, 'entry-contents:fixture-two');
    assert.equal(jr.status, 'fail');
    assert.equal(jr.value, 1);
    assert.deepEqual(Object.keys(jr.details.modules).sort(), [
      'app:lib/messages/t.ts',
      'pkg:react-dom',
      'pkg:three',
    ]);
    assert.equal(j.r.status, 1);
  });

  test('EZD-020 C5 report file and stdout', { timeout: 200000 }, async () => {
    const { r, out, res } = await run([row('clean', 'contents.field-pack', 'clean')]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const iReport = r.stdout.indexOf('BUNDLE REPORT');
    const iPass = r.stdout.indexOf('PERF PASS');
    assert.ok(iReport >= 0, 'stdout has BUNDLE REPORT');
    assert.ok(iPass > iReport, 'BUNDLE REPORT comes before PERF PASS');

    const md = readFileSync(path.join(out, 'bundle-report.md'), 'utf8');
    assert.ok(md.includes('## entry-contents:fixture-clean'));
    const lines = md.split('\n');
    assert.ok(lines.some((l) => l.includes('pkg:react-dom') && l.includes('10')));
    const WATCH = ['@sentry/', '@supabase/realtime-js', '@radix-ui/', 'radix-ui'];
    for (const w of WATCH) {
      assert.ok(
        lines.some((l) => l.includes(w) && l.includes('absent')),
        `report line for ${w} says absent`,
      );
    }
    const watch = rowOf(res, 'entry-contents:fixture-clean').details.watch;
    assert.deepEqual(Object.keys(watch).sort(), [...WATCH].sort());
    for (const w of WATCH) assert.equal(watch[w], null, w);
  });
});
