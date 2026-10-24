// EZD-029 T10 Done when, second half (vault/plans/EZD-029.md Tests table; Approach Step 8).
// Sources: ticket Done when; 02 DXF in/out ("recorded in the conventions file"); R26 R11; EZD-000 T1,
// T4, T5 (the 13 required ## headings, scripts/conventions/__tests__/architecture-doc.test.mjs) and C1.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot, spikeDir, runNode } from './helpers/common.mjs';

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

function section(lines, heading) {
  const start = lines.findIndex((l) => l.trimEnd() === heading);
  assert.ok(start >= 0, `heading ${heading}`);
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end);
}

function cells(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function backticked(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

describe('EZD-029 conventions file', () => {
  test('EZD-029 done when: the conventions file names the parser and the writer', async () => {
    const md = await readFile(path.join(repoRoot, 'docs', 'architecture.md'), 'utf8');
    const lines = md.split(/\r?\n/);
    const pkg = JSON.parse(await readFile(path.join(spikeDir, 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies ?? {}).sort();

    // Named tools DXF row.
    const named = section(lines, '## Named tools').find((l) => cells(l)[0] === 'DXF');
    assert.ok(named, 'Named tools DXF row');
    const [, choice, packages] = cells(named);
    const names = backticked(packages);
    assert.equal(names.length, 2, `Packages cell: ${packages}`);
    assert.deepEqual([...names].sort(), deps, 'Packages cell equals the spike dependencies');
    assert.ok(choice.includes('EZD-029'), `Choice cell: ${choice}`);
    assert.equal(/provisional/i.test(choice), false, `Choice cell still provisional: ${choice}`);

    // Stack DXF in/out row.
    const stackLines = section(lines, '## Stack');
    const stack = stackLines.find((l) => cells(l)[0] === 'DXF in/out');
    assert.ok(stack, 'Stack DXF in/out row');
    assert.deepEqual(backticked(cells(stack)[2]).sort(), [...names].sort());

    // Dependencies rows.
    const depRows = new Map();
    for (const l of section(lines, '## Dependencies')) {
      const c = cells(l);
      const m = /^`([^`]+)`$/.exec(c[0] ?? '');
      if (m && c.length >= 5) {
        depRows.set(m[1], { version: c[1].replace(/`/g, ''), usedIn: c[2].split(',').map((s) => s.trim()) });
      }
    }
    for (const name of names) {
      const row = depRows.get(name);
      assert.ok(row, `Dependencies row ${name}`);
      assert.ok(row.usedIn.includes('spikes'), `${name} Used in: ${row.usedIn}`);
      assert.equal(pkg.dependencies[name], row.version, `${name} version`);
    }

    // ### DXF (EZD-029) under ## Stack.
    const sub = stackLines.findIndex((l) => l.trimEnd() === '### DXF (EZD-029)');
    assert.ok(sub >= 0, '### DXF (EZD-029) under ## Stack');
    let subEnd = stackLines.findIndex((l, i) => i > sub && /^###? /.test(l));
    if (subEnd < 0) subEnd = stackLines.length;
    const subText = stackLines.slice(sub + 1, subEnd).join('\n');
    for (const name of names) assert.ok(subText.includes(name), `subsection names ${name}`);
    assert.ok(subText.includes('out/results.json'), 'subsection names out/results.json');

    // Checks still pass; EZD-000's 13 ## headings still present.
    const check = await runNode([path.join(repoRoot, 'scripts', 'conventions', 'check.mjs'), repoRoot]);
    assert.equal(check.code, 0, check.stdout + check.stderr);
    const headings = lines.map((l) => l.trimEnd()).filter((l) => /^## /.test(l));
    for (const h of REQUIRED_HEADINGS) assert.ok(headings.includes(h), `missing heading ${h}`);
  });
});
