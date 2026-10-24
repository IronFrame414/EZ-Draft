// EZD-016a T8, T9b (vault/plans/EZD-016a.md section 4). Node built-ins only. T8 lists the real Playwright
// run (list mode starts no web server and no global setup, plan section 2); the child drops
// NODE_TEST_CONTEXT and sets or deletes EZD_TEST_GREP itself (EZD-002 child env; Q-0006).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const ALL = ['desktop', 'ipad-landscape', 'surface', 'phone'];
const T1 = 'EZD-016a done when: a sample browser test signs in as the seeded owner @smoke';
const T2 = 'EZD-016a T2 two signed-in sessions at once, each at the project size';
const T3 = 'EZD-016a T3 network off and on';
const T12 = 'EZD-016a T12 the gate secret stays out of the browser';
const T13 = 'EZD-016a T13 an unknown email is refused before the browser';
const F1 = 'EZD-007f done when: link from the mail catcher signs in and the user signs out';
const F2 = 'EZD-007f done when: typing the 6-digit code signs in without opening the link';

function childEnv(grep) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  if (grep === undefined) delete env.EZD_TEST_GREP;
  else env.EZD_TEST_GREP = grep;
  return env;
}

// Every spec of the JSON report with its describe title path (file suite excluded).
function specsOf(report) {
  const out = [];
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) out.push({ titles: [...titles, spec.title], spec });
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
  };
  for (const fileSuite of report.suites ?? []) {
    for (const spec of fileSuite.specs ?? []) out.push({ titles: [spec.title], spec });
    for (const child of fileSuite.suites ?? []) walk(child, [child.title]);
  }
  return out;
}

function listTests(grep) {
  const r = spawnSync(
    'pnpm',
    ['--filter', '@ezdraft/app', 'exec', 'playwright', 'test', '--list', '--reporter=json'],
    { cwd: repo, env: childEnv(grep), encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(r.status, 0, `playwright --list failed:\n${r.stdout}\n${r.stderr}`);
  return specsOf(JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))));
}

// Projects a test (by its own title) is listed under; [] when it is not listed.
function projectsFor(specs, title) {
  const hits = specs.filter((s) => s.spec.title === title);
  return hits.flatMap((s) => s.spec.tests.map((t) => t.projectName)).sort();
}

// Lines of `### <name>` up to the next heading of any level.
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

// Lines of `## <name>` up to the next `## ` heading.
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

describe('EZD-016a routing and docs', () => {
  // T8 (AC-EZD-016a-1): EZD-016d routing; Q-0006; sign-in.spec.ts lines 76-78, 110; EZD-002 child env.
  test('EZD-016a T8 real routing of the harness specs, with and without the gate scope', { timeout: 400000 }, () => {
    // (a) no scope
    const a = listTests(undefined);
    assert.deepEqual(projectsFor(a, T1), [...ALL].sort(), 'T1 under all 4 projects');
    assert.deepEqual(projectsFor(a, T2), ['desktop', 'ipad-landscape', 'surface'], 'T2 projects');
    assert.deepEqual(projectsFor(a, T3), ['desktop', 'phone'], 'T3 projects');
    assert.deepEqual(projectsFor(a, T12), ['desktop'], 'T12 desktop only');
    assert.deepEqual(projectsFor(a, T13), ['desktop'], 'T13 desktop only');
    const f = a.filter((s) => s.titles[0].startsWith('EZD-007f'));
    assert.ok(f.length > 0, 'EZD-007f tests are listed');
    for (const s of f) {
      const projects = s.spec.tests.map((t) => t.projectName);
      assert.deepEqual(projects, ['desktop'], `${s.titles.join(' > ')} desktop only`);
    }

    // (b) a phase scope that excludes EZD-016a and EZD-007f, plus @smoke
    const b = listTests('(?:EZD-1\\d{2}[a-z]?(?![0-9]))|@smoke');
    assert.deepEqual(projectsFor(b, T1), [...ALL].sort(), 'T1 (@smoke) under all 4 projects');
    for (const [name, title] of [['T2', T2], ['T3', T3], ['T12', T12], ['T13', T13]]) {
      assert.deepEqual(projectsFor(b, title), [], `${name} not listed`);
    }
    assert.deepEqual(projectsFor(b, F1), ['desktop'], 'EZD-007f @smoke tag test desktop only');
    assert.deepEqual(projectsFor(b, F2), [], 'EZD-007f code test not listed');
  });

  // T9b (AC-EZD-016a-1): Step 7.
  test('EZD-016a T9b docs name the helpers and the machine check row', () => {
    const arch = readFileSync(path.join(repo, 'docs', 'architecture.md'), 'utf8');
    const browser = h3Text(arch, 'Browser tests (EZD-016a)');
    assert.ok(browser !== null, 'arch has ### Browser tests (EZD-016a)');
    for (const word of ['signInAs', 'sessions', 'network', 'serverDb', 'browserDb']) {
      assert.ok(browser.includes(word), `Browser tests subsection names ${word}`);
    }
    const checks = h2Text(arch, 'Machine checks');
    assert.ok(checks !== null, 'arch has ## Machine checks');
    const row = checks
      .split(/\r?\n/)
      .find((l) => l.startsWith('|') && l.includes('app/e2e/harness.spec.ts'));
    assert.ok(row, 'Machine checks has a row naming app/e2e/harness.spec.ts');
    assert.ok(!arch.includes('once EZD-016a'), 'no "once EZD-016a" left');
    assert.ok(!arch.includes("EZD-016a's `playwright.config.ts`"), "no \"EZD-016a's `playwright.config.ts`\" left");
  });
});
