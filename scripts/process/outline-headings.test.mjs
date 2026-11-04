// EZD-244 O1-O4 (vault/plans/EZD-244.md section 4): `node vault/tools/outline.mjs <file> --section '<heading>'` prints
// the own body of each named heading, `--headings` lists every heading with the length of its own body.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(root, 'vault/tools/outline.mjs');
const run = (...a) => spawnSync(process.execPath, [TOOL, ...a], { encoding: 'utf8' });

const FIXTURE = '# T\n\n## Alpha\na1\n### Beta\nb1\n```\n## not a heading\n```\nb2\n## Gamma\ng1\n### Beta2\n';
const dir = mkdtempSync(path.join(tmpdir(), 'ezd244-outline-'));
const fixture = path.join(dir, 'doc.md');
writeFileSync(fixture, FIXTURE);
const twice = path.join(dir, 'twice.md');
writeFileSync(twice, FIXTURE + '### Beta\nb3\n');

test('EZD-244 O1: --section prints the own bodies in request order, fences respected', () => {
  const r = run(fixture, '--section', 'Beta', '--section', 'Alpha');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '### Beta\nb1\n```\n## not a heading\n```\nb2\n## Alpha\na1\n');
});

test('EZD-244 O2: unknown heading, repeated heading and a mixed request fail without printing the file', () => {
  const a = run(fixture, '--section', 'Delta');
  assert.equal(a.status, 1);
  assert.equal(a.stdout, '');
  assert.ok(a.stderr.includes('no heading "Delta" in'), a.stderr);
  const b = run(twice, '--section', 'Beta');
  assert.equal(b.status, 1);
  assert.equal(b.stdout, '');
  assert.ok(b.stderr.includes('heading "Beta" appears 2 times in'), b.stderr);
  const c = run(fixture, '--section', '1', '--section', 'Alpha');
  assert.equal(c.status, 2);
  assert.ok(c.stderr.startsWith('usage: --section takes plan section numbers or headings'), c.stderr);
});

test('EZD-244 O3: --headings lists every heading with line number and own-body length', () => {
  const r = run(fixture, '--headings');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    '3: ## Alpha (12 chars)\n5: ### Beta (40 chars)\n11: ## Gamma (12 chars)\n13: ### Beta2 (10 chars)\n',
  );
});

test('EZD-244 O4: the live docs/architecture.md prints one section by heading, without its children', () => {
  const r = run(path.join(root, 'docs/architecture.md'), '--section', 'Folder layout');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.startsWith('## Folder layout\n'));
  assert.ok(!r.stdout.includes('### Root config files'));
  assert.ok(r.stdout.length < 20000, `length ${r.stdout.length}`);
  assert.ok(readFileSync(path.join(root, 'docs/architecture.md'), 'utf8').includes(r.stdout));
});

after(() => rmSync(dir, { recursive: true, force: true }));
