// EZD-014c D1 (a)-(e) (vault/plans/EZD-014c.md section 4): docs/architecture.md Device layouts subsection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const arch = () => readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
const lines = () =>
  arch()
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
const HEADING = '### Device layouts (EZD-014)';

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

test('EZD-014c D1 (a): the ## headings are exactly the 13 required, in order', () => {
  assert.deepEqual(
    lines().filter((l) => /^## /.test(l)),
    REQUIRED_HEADINGS,
  );
});

test('EZD-014c D1 (b): the Device layouts subsection sits after Editor shell and before Server-only', () => {
  const l = lines();
  const at = l.indexOf(HEADING);
  assert.ok(at >= 0, `missing line ${HEADING}`);
  assert.ok(
    at > l.indexOf('### Editor shell (EZD-012)'),
    'must come after ### Editor shell (EZD-012)',
  );
  assert.ok(l.indexOf('### Editor shell (EZD-012)') >= 0);
  assert.ok(
    at < l.indexOf('## Server-only data access and can()'),
    'must come before ## Server-only data access and can()',
  );
});

test('EZD-014c D1 (c): the subsection names the device-layout terms', () => {
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
  for (const s of [
    'FULL_SHELL_MIN_WIDTH',
    'COMPACT_HEADER_QUERY',
    'any-pointer: coarse',
    '--ez-touch-target',
    'components/phone',
    'DeviceLayout',
    'expectTouchTargets',
    '@surface',
    '/dev/device',
  ]) {
    assert.ok(body.includes(s), `subsection must name ${s}`);
  }
});

test('EZD-014c D1 (d): Machine checks rows for the device-layout tests', () => {
  const rows = machineChecksRows();
  const has = (file, id) =>
    rows.some((r) => r.length >= 4 && r[2].includes(file) && strip(r[3]) === id);
  assert.ok(has('device-layouts.spec.ts', 'EZD-014c'), 'row for device-layouts.spec.ts / EZD-014c');
  assert.ok(has('phone-imports.test.ts', 'EZD-014a'), 'row for phone-imports.test.ts / EZD-014a');
  assert.ok(has('touch-css.test.ts', 'EZD-014b'), 'row for touch-css.test.ts / EZD-014b');
});

test('EZD-014c D1 (e): the conventions check exits 0 on the repository root', () => {
  const r = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'conventions', 'check.mjs'), root],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(r.status, 0, `${r.stdout || ''}${r.stderr || ''}`);
});
