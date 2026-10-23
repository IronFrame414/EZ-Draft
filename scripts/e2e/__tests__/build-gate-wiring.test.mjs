// EZD-032 W1, W2 (vault/plans/EZD-032.md Tests table). Node built-ins only. W1 lists the real Playwright
// run (list mode starts no web server); the child sets or deletes EZD_TEST_GREP itself (Q-0006).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FILE = 'build-gate-phase-00.spec.ts';

function childEnv(grep) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  if (grep === undefined) delete env.EZD_TEST_GREP;
  else env.EZD_TEST_GREP = grep;
  return env;
}

function collect(suite, titles, out) {
  for (const spec of suite.specs ?? []) out.push({ titles: [...titles, spec.title], spec });
  for (const child of suite.suites ?? []) collect(child, [...titles, child.title], out);
}

function listTests(grep) {
  const r = spawnSync(
    'pnpm',
    ['--filter', '@ezdraft/app', 'exec', 'playwright', 'test', '--list', '--reporter=json'],
    { cwd: repo, env: childEnv(grep), encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(r.status, 0, `playwright --list failed:\n${r.stdout}\n${r.stderr}`);
  const report = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  const out = [];
  for (const s of report.suites ?? []) collect(s, [], out);
  return out;
}

function h3Text(text, name) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `### ${name}`);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function h2Text(text, name) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

const SCOPES = [
  ['unset', undefined],
  ['phase 0', '(?:EZD-0\\d{2}[a-z]?(?![0-9]))|@smoke'],
  ['phase 1', '(?:EZD-1\\d{2}[a-z]?(?![0-9]))|@smoke'],
  ['phase 9', '(?:EZD-9\\d{2}[a-z]?(?![0-9]))|@smoke'],
];

describe('EZD-032 build gate wiring', () => {
  test('EZD-032 W1 routing and smoke membership of the build-gate spec', { timeout: 800000 }, () => {
    for (const [label, grep] of SCOPES) {
      const mine = listTests(grep).filter((s) => s.spec.file.endsWith(FILE));
      const rows = mine.flatMap((s) => s.spec.tests.map((t) => `${s.spec.title}|${t.projectName}`));
      assert.equal(rows.length, 9, `${label}: 9 listings from ${FILE}`);
      assert.equal(new Set(rows).size, 9, `${label}: each listed once`);
      for (const title of new Set(mine.map((s) => s.spec.title))) {
        const projects = rows.filter((r) => r.startsWith(`${title}|`)).map((r) => r.split('|')[1]).sort();
        assert.deepEqual(projects, ['desktop', 'ipad-landscape', 'surface'], `${label}: ${title}`);
      }
      assert.equal(new Set(mine.map((s) => s.spec.title)).size, 3, `${label}: 3 tests`);
    }
  });

  test('EZD-032 W2 docs subsection and conventions check', () => {
    const arch = readFileSync(path.join(repo, 'docs', 'architecture.md'), 'utf8');
    assert.equal(arch.split(/\r?\n/).filter((l) => /^## /.test(l)).length, 13, '13 ## headings');
    assert.ok(h2Text(arch, 'Tests') !== null, 'arch has ## Tests');
    const sub = h3Text(arch, 'Build-gate tests (EZD-032)');
    assert.ok(sub !== null, 'arch has ### Build-gate tests (EZD-032)');
    const tests = h2Text(arch, 'Tests');
    assert.ok(tests.includes('### Build-gate tests (EZD-032)'), 'subsection is under ## Tests');
    for (const word of ['build-gate-phase-00.spec.ts', '@smoke', '@surface', 'SHELL_PATH', '/dev/shell']) {
      assert.ok(sub.includes(word), `subsection names ${word}`);
    }
    const r = spawnSync('node', ['scripts/conventions/check.mjs', '.'], {
      cwd: repo,
      env: childEnv(undefined),
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, `conventions check:\n${r.stdout}\n${r.stderr}`);
  });
});
