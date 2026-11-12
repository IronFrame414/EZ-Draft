// EZD-017 T12 (vault/plans/EZD-017.md section 4; W1, W2, D1; EZD-000 T5; C1). Reads repo files; runs the
// conventions check; reads scripts/gate.mjs without changing it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
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

// EZD-374 S1-S3 (vault/plans/EZD-374.md sections 3 and 4; AC-EZD-374-1).
const PASS1_GLOB = '"scripts/**/!(pan).test.mjs"';
const SERIAL_PASS =
  'node --import ./app/test-harness/net-guard/preload.mjs --test --test-concurrency=1 --test-reporter=tap --test-reporter-destination=stdout --test-reporter=./scripts/test-harness/hook-fail-reporter.mjs --test-reporter-destination=stderr "scripts/perf/__tests__/pan.test.mjs"; serial=$?;';
const PAN_TEST = 'scripts/perf/__tests__/pan.test.mjs';

describe('EZD-374 root test script and the pan fixture test', () => {
  test('EZD-374 S1 only the perf pan fixture test is named pan.test.mjs', () => {
    assert.deepEqual(globSync('scripts/**/pan.test.mjs', { cwd: REPO_ROOT }), [PAN_TEST]);
  });

  test('EZD-374 S2 the first pass matches every repo test file except the pan fixture test', () => {
    const all = globSync('scripts/**/*.test.mjs', { cwd: REPO_ROOT }).sort();
    const pass1 = globSync('scripts/**/!(pan).test.mjs', { cwd: REPO_ROOT }).sort();
    assert.ok(all.includes(PAN_TEST));
    assert.deepEqual(
      pass1,
      all.filter((f) => f !== PAN_TEST),
    );
  });

  test('EZD-374 S3 the root test script runs the pan fixture test alone after the other repo tests', () => {
    const s = JSON.parse(read('package.json')).scripts.test;
    assert.equal(s.split(PASS1_GLOB + '; root=$?;').length, 2, 'pass 1 glob and exit code');
    assert.equal(s.split(SERIAL_PASS).length, 2, 'serial pass');
    assert.ok(s.indexOf('root=$?;') < s.indexOf(SERIAL_PASS), 'serial after pass 1');
    assert.ok(s.indexOf(SERIAL_PASS) < s.indexOf('pnpm -r --no-bail'), 'serial before packages');
    assert.ok(s.endsWith('[ $root -eq 0 ] && [ $serial -eq 0 ] && [ $pkgs -eq 0 ]; }'), 'exit codes joined');
    assert.equal(s.includes('"scripts/**/*.test.mjs"'), false, 'old glob gone');
  });
});
