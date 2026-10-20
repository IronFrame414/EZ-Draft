// Optimize plan C3 (vault/cost/optimize-plan-2026-10-20.md): outline.mjs prints only the plan sections a role needs,
// and the character size of each section. The default outline output is unchanged (EZD-000c tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tool = path.join(root, 'vault/tools/outline.mjs');
const { sections, sectionSizes } = await import(pathToFileURL(tool).href);

const plan = [
  '# EZD-9 · Sample', '', '**Complexity:** low', '',
  '## 1. What to build', 'build it', '',
  '## 2. Sources', 'src', '',
  '## 3. Interface contract', 'contract', '```', '## 4. not a heading', '```', '',
  '## 4. Tests', '| T1 | x |', '',
  '## 10. Open questions', 'none', '',
].join('\n');
const run = (...a) => spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' });
const tmpFile = (text) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'opt-c3-')), 'EZD-9.md');
  fs.writeFileSync(p, text);
  return p;
};

test('OPT-C3 T1: sections() returns the header and the named numbered sections in file order, fences respected', () => {
  const header = '# EZD-9 · Sample\n\n**Complexity:** low\n\n';
  const s3 = '## 3. Interface contract\ncontract\n```\n## 4. not a heading\n```\n\n';
  const s4 = '## 4. Tests\n| T1 | x |\n\n';
  assert.equal(sections(plan, ['header', '4', '3']), header + s3 + s4);
  assert.equal(sections(plan, ['1']), '## 1. What to build\nbuild it\n\n');
  assert.equal(sections(plan, ['10']), '## 10. Open questions\nnone\n');
});

test('OPT-C3 T2: a plan without numbered sections, or a missing section, falls back to the whole file with a note', () => {
  const old = '# EZD-6\n\n## Approach\ntext\n## Tests\nrows\n';
  assert.equal(sections(old, ['3', '4']), 'NOTE: no numbered sections (3, 4) in this plan; whole plan follows.\n' + old);
  assert.equal(sections(plan, ['3', '7']), 'NOTE: section 7 not in this plan; whole plan follows.\n' + plan);
});

test('OPT-C3 T3: sectionSizes() gives characters per section, header first', () => {
  assert.deepEqual(sectionSizes(plan), [
    { section: 'header', heading: '# EZD-9 · Sample', chars: 39 },
    { section: '1', heading: '## 1. What to build', chars: 30 },
    { section: '2', heading: '## 2. Sources', chars: 19 },
    { section: '3', heading: '## 3. Interface contract', chars: 63 },
    { section: '4', heading: '## 4. Tests', chars: 24 },
    { section: '10', heading: '## 10. Open questions', chars: 27 },
  ]);
  assert.equal(sectionSizes(plan).reduce((s, x) => s + x.chars, 0), plan.length);
});

test('OPT-C3 T4: CLI --section (repeatable) prints sections; --sizes prints one line per section; default unchanged', () => {
  const p = tmpFile(plan);
  const a = run(p, '--section', '3', '--section', 'header');
  assert.equal(a.status, 0);
  assert.equal(a.stdout, sections(plan, ['3', 'header']));
  const s = run(p, '--sizes');
  assert.equal(s.status, 0);
  assert.deepEqual(s.stdout.trim().split('\n'), [
    'header 39 # EZD-9 · Sample', '1 30 ## 1. What to build', '2 19 ## 2. Sources', '3 63 ## 3. Interface contract',
    '4 24 ## 4. Tests', '10 27 ## 10. Open questions', 'total 202',
  ]);
  const d = run(p);
  assert.equal(d.stdout, '1: # EZD-9 · Sample\n5: ## 1. What to build\n8: ## 2. Sources\n11: ## 3. Interface contract\n17: ## 4. Tests\n20: ## 10. Open questions\n');
});
