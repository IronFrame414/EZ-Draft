// EZD-015c D1 (a)-(e) (vault/plans/EZD-015c.md section 4): docs/architecture.md State components subsection.
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
const HEADING = '### State components (EZD-015)';

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

test('EZD-015c D1 (a): the ## headings are exactly the 13 required, in order', () => {
  assert.deepEqual(
    lines().filter((l) => /^## /.test(l)),
    REQUIRED_HEADINGS,
  );
});

test('EZD-015c D1 (b): the State components subsection sits after Device layouts and before Server-only', () => {
  const l = lines();
  const at = l.indexOf(HEADING);
  assert.ok(at >= 0, `missing line ${HEADING}`);
  assert.ok(l.indexOf('### Device layouts (EZD-014)') >= 0);
  assert.ok(at > l.indexOf('### Device layouts (EZD-014)'), 'must come after Device layouts');
  assert.ok(at < l.indexOf('## Server-only data access and can()'), 'must come before Server-only');
});

test('EZD-015c done when: the docs describe the state components.', () => {
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
    'AsyncView',
    'SkeletonGroup',
    'InlineError',
    'OfflineBanner',
    'useOnline',
    'useToast',
    'useConfirm',
    'StateHost',
    'TOAST_DEFAULT_MS',
    'common.retry',
    'radix-ui',
    '/dev/states',
  ]) {
    assert.ok(body.includes(s), `subsection must name ${s}`);
  }
});

test('EZD-015c D1 (d): Machine checks rows and the Lint bullet', () => {
  const rows = machineChecksRows();
  const has = (file, id) =>
    rows.some((r) => r.length >= 4 && r[2].includes(file) && strip(r[3]) === id);
  assert.ok(has('states-imports.test.ts', 'EZD-015a'), 'row for states-imports.test.ts / EZD-015a');
  assert.ok(has('messages-lint.test.mjs', 'EZD-015a'), 'row for messages-lint.test.mjs / EZD-015a');
  assert.ok(has('states.spec.ts', 'EZD-015c'), 'row for states.spec.ts / EZD-015c');
  const lint = lines().find((l) => l.startsWith('- **Lint.**'));
  assert.ok(lint, 'Lint bullet missing');
  assert.ok(lint.includes('app/src/components/states/'), 'Lint bullet must name app/src/components/states/');
});

test('EZD-015c D1 (e): the conventions check exits 0 on the repository root', () => {
  const r = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'conventions', 'check.mjs'), root],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, `${r.stdout || ''}${r.stderr || ''}`);
});
