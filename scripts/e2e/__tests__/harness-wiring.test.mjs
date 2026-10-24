// EZD-016d T9, T15 (vault/plans/EZD-016d.md section 4). Node built-ins only. Spawned children drop
// NODE_TEST_CONTEXT and get 180 s each (EZD-002 deviations (1), (2)).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(path.join(repo, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

// Lines of `## <name>` up to the next `## ` heading.
function h2Section(text, name) {
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
  return lines.slice(start + 1, end);
}

// Lines of `### <name>` up to the next `##` or `###` heading.
function h3Within(lines, name) {
  const start = lines.findIndex((l) => l.trim() === `### ${name}`);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{2,3} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

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
  const json = r.stdout.slice(r.stdout.indexOf('{'));
  return specsOf(JSON.parse(json));
}

const projectsOf = (entry) => entry.spec.tests.map((t) => t.projectName).sort();

describe('EZD-016d harness wiring', () => {
  // T9 (AC-EZD-016d-1): Steps 2.7, 5; ci.yml; check C1; 7f scripts.
  test('EZD-016d T9 root config, dependency, scripts, ignore line, docs and conventions check', { timeout: 180000 }, () => {
    // root config
    const rootConfig = path.join(repo, 'playwright.config.ts');
    assert.ok(existsSync(rootConfig), 'root playwright.config.ts exists');
    assert.ok(readFileSync(rootConfig, 'utf8').includes('./app/playwright.config'));

    // dependency
    const rootPkg = readJson('package.json');
    const appPkg = readJson('app/package.json');
    const rootVersion = rootPkg.devDependencies?.['@playwright/test'];
    assert.equal(typeof rootVersion, 'string', 'root devDependencies has @playwright/test');
    assert.equal(rootVersion, appPkg.devDependencies['@playwright/test']);
    const arch = read('docs/architecture.md');
    const row = arch
      .split(/\r?\n/)
      .find((l) => l.startsWith('| `@playwright/test` |'));
    assert.ok(row, 'arch Dependencies row for @playwright/test');
    const cells = row.split('|').map((c) => c.trim());
    assert.equal(cells[2].replace(/`/g, ''), rootVersion);
    const usedIn = cells[3].split(',').map((s) => s.trim());
    assert.ok(usedIn.includes('root'), `Used in has root: ${cells[3]}`);
    assert.ok(usedIn.includes('app'), `Used in has app: ${cells[3]}`);

    // scripts
    const rootE2e = rootPkg.scripts['test:e2e'];
    assert.ok(rootE2e.startsWith('pnpm run db:up'), rootE2e);
    assert.ok(rootE2e.includes('pnpm -r --if-present --filter "!./spikes/**" run test:e2e'), rootE2e);
    assert.equal(appPkg.scripts['test:e2e'], 'playwright test');

    // ignore and docs
    const gitignore = read('.gitignore').split(/\r?\n/).map((l) => l.trim());
    assert.ok(gitignore.includes('app/.e2e/'), '.gitignore has app/.e2e/');
    const tests = h2Section(arch, 'Tests');
    assert.ok(tests, 'arch has ## Tests');
    const browser = h3Within(tests, 'Browser tests (EZD-016a)');
    assert.ok(browser !== null, 'arch ## Tests has ### Browser tests (EZD-016a)');
    for (const word of ['desktop', 'ipad-landscape', 'surface', 'phone', '@ipad', '@surface', '@phone']) {
      assert.ok(browser.includes(word), `Browser tests subsection names ${word}`);
    }

    // conventions check
    const check = spawnSync(process.execPath, [path.join(repo, 'scripts', 'conventions', 'check.mjs'), '.'], {
      cwd: repo,
      env: childEnv(process.env.EZD_TEST_GREP),
      encoding: 'utf8',
      timeout: 180000,
    });
    assert.equal(check.status, 0, `conventions check failed:\n${check.stdout}\n${check.stderr}`);
  });

  // T15 (AC-EZD-016d-1, added L-012): Step 1; Q-0006; app/e2e/sign-in.spec.ts lines 76-78, 110.
  test('EZD-016d T15 project grep routes 7f specs to desktop and keeps the gate scope', { timeout: 360000 }, () => {
    // (a) no scope: every EZD-007f test in desktop only, at least one
    const all = listTests(undefined).filter((e) => e.titles[0].startsWith('EZD-007f'));
    assert.ok(all.length >= 1, 'at least one EZD-007f test is listed');
    for (const e of all) assert.deepEqual(projectsOf(e), ['desktop'], e.titles.join(' > '));

    // (b) the T6 (c) scope: only @smoke 7f tests remain
    const scoped = listTests('(?:EZD-1\\d{2}[a-z]?(?![0-9]))|@smoke');
    const smoke = scoped.find(
      (e) => e.spec.title === 'EZD-007f done when: link from the mail catcher signs in and the user signs out',
    );
    assert.ok(smoke, 'the @smoke done-when test is listed');
    assert.deepEqual(projectsOf(smoke), ['desktop']);
    const code = scoped.find(
      (e) => e.spec.title === 'EZD-007f done when: typing the 6-digit code signs in without opening the link',
    );
    assert.ok(!code || code.spec.tests.length === 0, 'the code test is not listed');
  });
});
