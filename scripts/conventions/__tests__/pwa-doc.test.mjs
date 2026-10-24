// EZD-013 D1 (vault/plans/EZD-013.md section 4): docs/architecture.md PWA subsection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const lines = () =>
  readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trimEnd());
const strip = (s) => s.replace(/`/g, '').trim();

const REQUIRED_HEADINGS = [
  '## Runtime',
  '## Named tools',
  '## Stack',
  '## Dependencies',
  '## Adding a dependency',
  '## Folder layout',
  '## Server-only data access and can()',
  '## Migrations',
  '## Errors and logging',
  '## Storage buckets and paths',
  '## Tests',
  '## Handoff',
  '## Machine checks',
];
const HEADING = '### PWA (EZD-013)';

function machineChecksRows() {
  const rows = [];
  let inTable = false;
  let sawHeader = false;
  for (const line of lines()) {
    if (/^\s*\|/.test(line)) {
      const cells = line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
      if (!inTable) {
        inTable = true;
        sawHeader = strip(cells.join(' | ')) === 'ID | Rule | Check | Built by';
        continue;
      }
      if (sawHeader && !cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells);
    } else {
      inTable = false;
      sawHeader = false;
    }
  }
  return rows;
}

test('EZD-013 D1 (a): the ## headings are exactly the 13 required, in order', () => {
  assert.deepEqual(
    lines().filter((l) => /^## /.test(l)),
    REQUIRED_HEADINGS,
  );
});

test('EZD-013 D1 (b): the PWA subsection names its contracts', () => {
  const l = lines();
  const at = l.indexOf(HEADING);
  assert.ok(at >= 0, `missing line ${HEADING}`);
  let end = l.length;
  for (let i = at + 1; i < l.length; i++) {
    if (/^###? /.test(l[i])) {
      end = i;
      break;
    }
  }
  const body = l.slice(at, end).join('\n');
  for (const s of ['/sw.js', 'EZD-134', 'app-icons:render', 'manifest.webmanifest', 'pwa.register']) {
    assert.ok(body.includes(s), `subsection must name ${s}`);
  }
});

test('EZD-013 D1 (c): Machine checks rows name the three test files', () => {
  const rows = machineChecksRows();
  for (const file of [
    'app/src/pwa/app-icons.test.ts',
    'app/src/lib/pwa/sw-file.test.ts',
    'app/e2e/pwa.spec.ts',
  ]) {
    assert.ok(
      rows.some((r) => r.length >= 4 && r[2].includes(file)),
      `Machine checks row for ${file}`,
    );
  }
});

test('EZD-013 D1 (d): the conventions check exits 0 on the repository root', () => {
  const r = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'conventions', 'check.mjs'), root],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, `${r.stdout || ''}${r.stderr || ''}`);
});
