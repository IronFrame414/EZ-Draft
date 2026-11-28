// EZD-2000 · C12 and C13 (AC-EZD-2000-1 (1), (2), (5); Q-0814). C12: a page route without a download row and a
// first-load contents row measured at its own page fails, so a new route fails the gate until it has them. C13: a
// font that is not woff2, or a raster image over the cap, fails. Each case is a temporary folder; other checks may
// complain about the bare folder, so only the [C12] or [C13] lines are read. The last tests run the check on the
// repository itself (AC-EZD-2000-2 "existing code passes every rule").
import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const checkScript = path.join(root, 'scripts', 'conventions', 'check.mjs');

const tmpRoots = [];
after(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

function lines(dir, tag) {
  const r = spawnSync(process.execPath, [checkScript, dir], { encoding: 'utf8' });
  return `${r.stdout || ''}${r.stderr || ''}`.split('\n').filter((l) => l.startsWith(`[${tag}]`));
}

function repo(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd2000-perf-rules-'));
  tmpRoots.push(dir);
  for (const [file, body] of Object.entries(files)) {
    const full = path.join(dir, ...file.split('/'));
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

const PAGE = 'export default function Page() { return null; }\n';
const BUDGETS = `export const BUDGETS = {
  'download.office': { id: 'download.office', kind: 'gate', unit: 'bytes', value: 300000 },
  'download.trend': { id: 'download.trend', kind: 'trend', unit: 'bytes', value: 1 },
  'contents.office': { id: 'contents.office', kind: 'gate', unit: 'count', value: 0 },
};
`;
const REGISTRY = `export const MEASUREMENTS = [
  { id: 'js-size:home', budget: 'download.office' },
  { id: 'entry-contents:home', budget: 'contents.office' },
];
`;

/** A perf config with these measurements and unmeasured routes. */
const config = (measurements, unmeasuredRoutes = []) =>
  `export default ${JSON.stringify({ profile: 'desktop', measurements, unmeasuredRoutes })};\n`;

const both = (name, url) => [
  { id: `js-size:${name}`, url, budget: 'download.office' },
  { id: `entry-contents:${name}`, url, budget: 'contents.office' },
];

/** A repo with the home page measured through the registry, plus `extra` files. */
function c12Repo(measurements, extra = {}, unmeasured = []) {
  return repo({
    'app/src/app/(office)/page.tsx': PAGE,
    'scripts/perf/budgets.mjs': BUDGETS,
    'scripts/perf/registry.mjs': REGISTRY,
    'scripts/perf/perf.config.mjs': config(
      [{ id: 'js-size:home', url: '/' }, { id: 'entry-contents:home', url: '/' }, ...measurements],
      unmeasured,
    ),
    ...extra,
  });
}

describe('EZD-2000 C12 every route is budgeted and measured at its real page', () => {
  test('EZD-2000 C12 passes when every route has both rows at its own page', () => {
    const dir = c12Repo(both('field', '/projects/{project}/field'), {
      'app/src/app/(field)/projects/[id]/field/page.tsx': PAGE,
    });
    assert.deepEqual(lines(dir, 'C12'), []);
  });

  test('EZD-2000 C12 fails a new route with no rows, naming the route', () => {
    const dir = c12Repo([], { 'app/src/app/(office)/reports/page.tsx': PAGE });
    const out = lines(dir, 'C12');
    assert.equal(out.length, 2, out.join('\n'));
    assert.ok(out.every((l) => l.includes('route /reports ')), out.join('\n'));
    assert.ok(out.some((l) => l.includes('js-size:')));
    assert.ok(out.some((l) => l.includes('entry-contents:')));
  });

  test('EZD-2000 C12 fails a route measured only at a placeholder page', () => {
    const dir = c12Repo(both('reports', '/dev/entry/office'), { 'app/src/app/(office)/reports/page.tsx': PAGE });
    assert.equal(lines(dir, 'C12').length, 2);
  });

  test('EZD-2000 C12 fails a row whose budget is missing, not a gate, or of the wrong kind', () => {
    const dir = c12Repo(
      [
        { id: 'js-size:a', url: '/a', budget: 'download.nope' },
        { id: 'entry-contents:a', url: '/a', budget: 'contents.office' },
        { id: 'js-size:b', url: '/b', budget: 'download.trend' },
        { id: 'entry-contents:b', url: '/b', budget: 'download.office' },
      ],
      { 'app/src/app/a/page.tsx': PAGE, 'app/src/app/b/page.tsx': PAGE },
    );
    const out = lines(dir, 'C12');
    assert.equal(out.length, 3, out.join('\n'));
    assert.ok(out.some((l) => l.includes('js-size:a') && l.includes('download.nope')));
    assert.ok(out.some((l) => l.includes('js-size:b') && l.includes('download.trend')));
    assert.ok(out.some((l) => l.includes('entry-contents:b')));
  });

  test('EZD-2000 C12 leaves out /dev routes (404 in production) and drops route groups', () => {
    const dir = c12Repo([], {
      'app/src/app/dev/probe/page.tsx': PAGE,
      'app/src/app/(office)/dev/entry/office/page.tsx': PAGE,
    });
    assert.deepEqual(lines(dir, 'C12'), []);
  });

  test('EZD-2000 C12 matches a dynamic segment by any one value, never a different depth', () => {
    const ok = c12Repo(both('invite', '/invite/not-a-token'), { 'app/src/app/invite/[token]/page.tsx': PAGE });
    assert.deepEqual(lines(ok, 'C12'), []);
    const deep = c12Repo(both('invite', '/invite/a/b'), { 'app/src/app/invite/[token]/page.tsx': PAGE });
    assert.equal(lines(deep, 'C12').length, 2);
  });

  test('EZD-2000 C12 an unmeasured route needs a written reason and a page that exists', () => {
    const files = { 'app/src/app/(office)/settings/[section]/page.tsx': PAGE };
    const good = c12Repo([], files, [{ route: '/settings/[section]', reason: 'every section has its own page' }]);
    assert.deepEqual(lines(good, 'C12'), []);
    const noReason = c12Repo([], files, [{ route: '/settings/[section]', reason: ' ' }]);
    const out = lines(noReason, 'C12');
    assert.ok(out.some((l) => l.includes('reason')), out.join('\n'));
    assert.ok(out.some((l) => l.includes('route /settings/[section] has no js-size:')), out.join('\n'));
    const stale = c12Repo([], {}, [{ route: '/gone', reason: 'was here' }]);
    assert.ok(lines(stale, 'C12').some((l) => l.includes('/gone') && l.includes('no such page route')));
  });

  test('EZD-2000 C12 passes on the repository itself (AC-EZD-2000-2)', () => {
    assert.deepEqual(lines(root, 'C12'), []);
  });
});

describe('EZD-2000 C13 fonts are woff2 and raster images are small', () => {
  const CAP = 50 * 1000;

  for (const font of ['app/src/styles/fonts/a.ttf', 'app/src/styles/fonts/a.otf', 'app/public/a.woff', 'app/src/a.eot']) {
    test(`EZD-2000 C13 fails the font ${font}`, () => {
      const out = lines(repo({ [font]: 'x' }), 'C13');
      assert.equal(out.length, 1, out.join('\n'));
      assert.ok(out[0].startsWith(`[C13] ${font}: `), out[0]);
    });
  }

  test('EZD-2000 C13 passes a woff2 font', () => {
    assert.deepEqual(lines(repo({ 'app/src/styles/fonts/a.woff2': 'x' }), 'C13'), []);
  });

  test('EZD-2000 C13 fails a raster image over the cap and passes one at the cap', () => {
    const over = lines(repo({ 'app/public/big.png': Buffer.alloc(CAP + 1) }), 'C13');
    assert.equal(over.length, 1, over.join('\n'));
    assert.ok(over[0].startsWith('[C13] app/public/big.png: '), over[0]);
    assert.ok(over[0].includes(String(CAP + 1)));
    for (const ext of ['jpg', 'jpeg', 'gif', 'webp', 'avif']) {
      assert.equal(lines(repo({ [`app/src/x.${ext}`]: Buffer.alloc(CAP + 1) }), 'C13').length, 1, ext);
    }
    assert.deepEqual(lines(repo({ 'app/public/ok.png': Buffer.alloc(CAP) }), 'C13'), []);
  });

  test('EZD-2000 C13 leaves out test screenshots and fixtures', () => {
    const dir = repo({
      'app/src/__fixtures__/big.png': Buffer.alloc(CAP + 1),
      'app/src/fixtures/big.jpg': Buffer.alloc(CAP + 1),
    });
    assert.deepEqual(lines(dir, 'C13'), []);
  });

  test('EZD-2000 C13 passes on the repository itself (AC-EZD-2000-2)', () => {
    assert.deepEqual(lines(root, 'C13'), []);
  });
});
