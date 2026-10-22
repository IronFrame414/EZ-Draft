// EZD-017 T12 (vault/plans/EZD-017.md section 4; W1, W2, D1; EZD-000 T5; C1). Reads repo files; runs the
// conventions check; reads scripts/gate.mjs without changing it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { REPO_ROOT } from './helpers.mjs';

const read = (...p) => readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

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

const KEPT_SCRIPTS = [
  'typecheck',
  'lint',
  'test',
  'build',
  'test:e2e',
  'db:up',
  'db:env',
  'db:reset',
  'db:stop',
  'db:types',
  'fixtures:generate',
  'format',
  'format:check',
];

function subsection(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trimEnd() === heading);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{2,3} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

describe('EZD-017 wiring', () => {
  test('EZD-017 T12 Wiring', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.scripts.perf, 'node scripts/perf/run.mjs');
    for (const s of KEPT_SCRIPTS) assert.equal(typeof pkg.scripts[s], 'string', `script ${s} kept`);

    const gitignore = read('.gitignore')
      .split(/\r?\n/)
      .map((l) => l.trim());
    assert.ok(gitignore.includes('perf-results/'), '.gitignore has perf-results/');

    const arch = read('docs', 'architecture.md');
    const h2 = arch
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => /^## /.test(l));
    for (const h of REQUIRED_HEADINGS) assert.ok(h2.includes(h), `heading ${h}`);

    const perf = subsection(arch, '### Performance check (EZD-017)');
    assert.ok(perf, '### Performance check (EZD-017) present');
    for (const s of ['scripts/perf/run.mjs', 'perf-results/latest.json', 'registry.mjs', 'EZD-236'])
      assert.ok(perf.includes(s), `subsection names ${s}`);

    // No Dependencies row added by EZD-017 (W2).
    const deps = subsection(arch, '## Dependencies');
    assert.ok(deps, 'Dependencies section');
    let rows = 0;
    for (const line of deps.split('\n')) {
      if (!/^\s*\|\s*`/.test(line)) continue;
      rows++;
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      assert.notEqual(cells[cells.length - 1], 'EZD-017', `row added by EZD-017: ${cells[0]}`);
    }
    assert.ok(rows > 0, 'Dependencies rows were read');

    const c = spawnSync(process.execPath, ['scripts/conventions/check.mjs', '.'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.equal(c.status, 0, c.stdout + c.stderr);

    const gate = read('scripts', 'gate.mjs');
    const m = gate.match(/const checks = \[([^\]]*)\]/);
    assert.ok(m, 'gate.mjs checks list found');
    const checks = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    assert.ok(checks.includes('perf'), 'gate checks contain perf');
  });
});
