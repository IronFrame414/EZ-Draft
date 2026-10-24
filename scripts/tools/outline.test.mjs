// EZD-000c T1-T4: vault/tools/outline.mjs (plan vault/plans/EZD-000c.md sections 3 and 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tool = path.join(root, 'vault/tools/outline.mjs');
const { outline } = await import(pathToFileURL(tool).href);

const sampleMd = ['# Title', 'intro', '## First', '### Deep', 'text', '```js', '## not a heading', '```', '## Second', '#NoSpace', ''].join('\n');
const sampleMjs = [
  '#!/usr/bin/env node', '// Sample tool: does a thing.', '// Second comment line.', "import fs from 'node:fs';", '',
  'export function alpha(a, b) {', '  return a + b;', '}', 'function hidden() {}', 'export const LIMIT = 60;',
  'export class Beta {}', 'export default async function main() {}', 'const notExported = 1;', 'export { hidden };', '',
].join('\n');

test('EZD-000c T1 outline of markdown: headings to depth 2 with line numbers, fences and depth 3 excluded', () => {
  assert.deepEqual(outline(sampleMd, 'sample.md'), ['1: # Title', '3: ## First', '9: ## Second']);
});

test('EZD-000c T2 outline of code: top comment block then each exported function, class or constant', () => {
  assert.deepEqual(outline(sampleMjs, 'sample.mjs'), [
    '// Sample tool: does a thing.', '// Second comment line.', '6: export function alpha(a, b) {',
    '10: export const LIMIT = 60;', '11: export class Beta {}', '12: export default async function main() {}',
  ]);
});

test('EZD-000c T3 outline cap of 60 lines, other kinds, 120-character cut', () => {
  const big = Array.from({ length: 100 }, (_, i) => `## H${i + 1}`).join('\n') + '\n';
  const a = outline(big, 'big.md');
  assert.equal(a.length, 60);
  assert.equal(a[0], '1: ## H1');
  assert.equal(a[58], '59: ## H59');
  assert.equal(a[59], '… 41 more not shown');
  assert.deepEqual(outline('{\n "a": 1\n}\n', 'x.json'), ['3 lines; nothing to outline.']);
  const c = outline('## ' + 'y'.repeat(200) + '\n', 'long.md');
  assert.equal(c.length, 1);
  assert.equal(c[0].length, 120);
  assert.ok(c[0].endsWith('…'));
});

test('EZD-000c T4 outline CLI prints the outline, and usage with exit 2 for no argument', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd-outline-'));
  const f = path.join(dir, 'sample.md');
  fs.writeFileSync(f, sampleMd);
  const r = spawnSync('node', [tool, f], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '1: # Title\n3: ## First\n9: ## Second\n');
  const u = spawnSync('node', [tool], { encoding: 'utf8' });
  assert.equal(u.status, 2);
  assert.ok(u.stderr.startsWith('usage:'));
});
