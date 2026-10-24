// EZD-016b T7 (vault/plans/EZD-016b.md, Tests; Step 6): fixtures/manifest.json, fixtures/README.md
// and the files under fixtures/ agree. The 14 ids of Step 6 must be present with their origin, kind
// and status; later tickets add entries (EZD-302, EZD-901a, EZD-915, EZD-916, EZD-1702), so no total
// is asserted (phase 0 plan review, finding 32). Every other check applies to every entry.
// The walk lists tracked and untracked, non-ignored files with git, so an ignored .DS_Store does not
// count; a failed git call fails the test (L-019), it never yields an empty list.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const FIXTURES = path.join(repo, 'fixtures');

const PENDING_CITATION = 'decisions.md · Build answers (Josh)';

/** Step 6 table: id, origin, kind, status. */
const STEP6 = [
  ['synthetic-room-dxf', 'generated', 'polycam_dxf', 'present'],
  ['synthetic-room-vector-pdf', 'generated', 'pdf', 'present'],
  ['synthetic-room-glb', 'generated', 'polycam_glb', 'present'],
  ['synthetic-room-scanned-pdf', 'generated', 'pdf', 'present'],
  ['polycam-dxf', 'real', 'polycam_dxf', 'not yet supplied'],
  ['polycam-glb', 'real', 'polycam_glb', 'not yet supplied'],
  ['vector-pdf', 'real', 'pdf', 'not yet supplied'],
  ['scanned-pdf', 'real', 'pdf', 'not yet supplied'],
  ['supplier-pdf', 'real', 'supplier_pdf', 'not yet supplied'],
  ['architect-dxf', 'real', 'dxf', 'not yet supplied'],
  ['architect-dxf-revised', 'real', 'dxf', 'not yet supplied'],
  ['supplier-2020-dxf', 'real', 'dxf', 'not yet supplied'],
  ['order-report', 'real', 'order_report', 'not yet supplied'],
  ['photos', 'real', 'photo', 'not yet supplied'],
];
const STILL_PENDING = ['architect-dxf', 'architect-dxf-revised', 'supplier-2020-dxf', 'order-report'];
const ORIGINS = ['generated', 'real'];
const STATUSES = ['present', 'not yet supplied'];

/** @param {string[]} args @returns {string[]} repo-relative paths, '/' separated */
function git(args) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.split('\0').filter((s) => s.length > 0);
}

const readManifest = () => JSON.parse(readFileSync(path.join(FIXTURES, 'manifest.json'), 'utf8'));

/** Rows of the README's fixtures table (header row starts `| id | origin |`). */
function readmeRows() {
  const lines = readFileSync(path.join(FIXTURES, 'README.md'), 'utf8').split('\n');
  const start = lines.findIndex((l) => /^\|\s*id\s*\|\s*origin\s*\|/.test(l));
  assert.ok(start >= 0, 'README has a table whose header starts | id | origin |');
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i]
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    rows.push({ line: lines[i], id: cells[0].replace(/`/g, ''), origin: cells[1], status: cells[3] });
  }
  return rows;
}

describe('EZD-016b fixtures manifest', () => {
  it('T7 manifest, README and files agree', () => {
    const manifest = readManifest();
    assert.ok(Array.isArray(manifest), 'manifest.json is an array');

    // Ids unique; the 14 Step 6 ids present with their origin, kind and status.
    const ids = manifest.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'manifest ids are unique');
    for (const [id, origin, kind, status] of STEP6) {
      const e = manifest.find((x) => x.id === id);
      assert.ok(e, `manifest has ${id}`);
      assert.equal(e.origin, origin, `${id} origin`);
      assert.equal(e.kind, kind, `${id} kind`);
      assert.equal(e.status, status, `${id} status`);
    }

    // Every entry, whatever ticket added it.
    for (const e of manifest) {
      assert.ok(ORIGINS.includes(e.origin), `${e.id}: origin ${e.origin}`);
      assert.ok(STATUSES.includes(e.status), `${e.id}: status ${e.status}`);
      assert.equal(typeof e.path, 'string', `${e.id}: path`);
      if (e.origin === 'real') {
        assert.equal(e.path, `fixtures/real/${e.id}/`, `${e.id}: real path is fixtures/real/<id>/`);
      }
      if (e.status === 'present') {
        assert.ok(existsSync(path.join(repo, e.path)), `${e.id}: ${e.path} exists`);
        if (e.origin === 'generated') {
          assert.equal(typeof e.expected, 'string', `${e.id}: expected`);
          assert.ok(existsSync(path.join(repo, e.expected)), `${e.id}: ${e.expected} exists`);
          assert.ok(statSync(path.join(repo, e.path)).isFile(), `${e.id}: generated path is a file`);
        }
      }
      if (e.origin === 'real' && e.status === 'not yet supplied') {
        const tracked = git(['ls-files', '--cached', '-z', '--', e.path]);
        assert.deepEqual(tracked, [], `${e.id}: not yet supplied, but ${e.path} holds tracked files`);
      }
    }

    // Every walked file is README.md, manifest.json, an *.expected.json, or a manifest path.
    const walked = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'fixtures']);
    for (const e of manifest.filter((x) => x.status === 'present')) {
      if (statSync(path.join(repo, e.path)).isFile()) {
        assert.ok(walked.includes(e.path), `walk found ${e.path}`);
      }
    }
    const stray = walked.filter(
      (f) =>
        f !== 'fixtures/README.md' &&
        f !== 'fixtures/manifest.json' &&
        !f.endsWith('.expected.json') &&
        !manifest.some((e) => f === e.path || (e.path.endsWith('/') && f.startsWith(e.path))),
    );
    assert.deepEqual(stray, [], 'files under fixtures/ that no manifest entry names');

    // README: exactly one table row per manifest id, same origin and status; no other row.
    const rows = readmeRows();
    for (const r of rows) assert.ok(ids.includes(r.id), `README row ${r.id} has no manifest entry`);
    for (const e of manifest) {
      const mine = rows.filter((r) => r.id === e.id);
      assert.equal(mine.length, 1, `README rows for ${e.id}`);
      assert.equal(mine[0].origin, e.origin, `README origin of ${e.id}`);
      assert.ok(mine[0].status.startsWith(e.status), `README status of ${e.id}: ${mine[0].status}`);
      if (e.status === 'present') {
        assert.ok(!mine[0].status.startsWith('not yet supplied'), `README status of ${e.id}`);
      }
    }
    for (const id of STILL_PENDING) {
      const row = rows.find((r) => r.id === id);
      assert.ok(/still pending/i.test(row.status), `README row ${id}: status says still pending`);
      assert.ok(row.line.includes(PENDING_CITATION), `README row ${id} cites ${PENDING_CITATION}`);
    }

    // The real-file rule of Step 6 item 5 (Q-0065 (b): "the README says so").
    const readme = readFileSync(path.join(FIXTURES, 'README.md'), 'utf8');
    for (const words of ['names', 'addresses', 'photo location data', 'Q-0065']) {
      assert.ok(readme.includes(words), `README states the real-file rule: ${words}`);
    }
  });
});
