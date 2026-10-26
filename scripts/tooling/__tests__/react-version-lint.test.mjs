// EZD-186 (vault/plans/EZD-186.md Tests; Q-0324): a root lint prints no "React version was set to detect"
// warning, and the React version the root config gives app/** files is the pinned react version from
// docs/architecture.md (equal to app/package.json dependencies.react). Each lint runs in its own child
// process because eslint-plugin-react caches its warned flag per process (plan D8). Pattern:
// scripts/tooling/__tests__/no-polling-lint.test.mjs (EZD-018).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const APP_DIR = path.join(root, 'app');
const PROBE = 'app/src/ezd186-probe.tsx';
const REACT_ROW = /^\|\s*`react`\s*\|\s*`([^`]+)`\s*\|/m;

// Plan D8: the child lints one file that is not on disk and prints only the error counts as JSON.
// String.raw keeps the \n of the lintText argument as backslash and n in the child's source.
const CHILD = String.raw`import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const mode = process.argv[1];
const req = createRequire(path.join(root, 'package.json'));
const { ESLint } = await import(pathToFileURL(req.resolve('eslint')).href);
const options = { cwd: root };
if (mode === 'detect') options.overrideConfig = [{ files: ['app/**/*.tsx'], settings: { react: { version: 'detect' } } }];
const [r] = await new ESLint(options).lintText('export const A = () => <div />;\n', { filePath: 'app/src/ezd186-probe.tsx' });
process.stdout.write(JSON.stringify({ errorCount: r.errorCount, fatalErrorCount: r.fatalErrorCount }));
`;

function importFromRoot(name) {
  const req = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(req.resolve(name)).href).then((mod) => mod.default ?? mod);
}

// The pin in docs/architecture.md, the Dependencies table row for react (plan D10).
function docsReactVersion() {
  const md = readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
  const matches = [...md.matchAll(new RegExp(REACT_ROW.source, 'gm'))];
  assert.equal(matches.length, 1, 'docs/architecture.md must have exactly one react row');
  return matches[0][1];
}

function pkgReactVersion() {
  const pkg = JSON.parse(readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
  return pkg.dependencies.react;
}

function runChild(mode) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  return spawnSync(process.execPath, ['--input-type=module', '-e', CHILD, mode], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
}

describe('EZD-186 React version for root lint', () => {
  const dirs = [];

  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  test('EZD-186 T1 no React version warning from a root lint', () => {
    const child = runChild('plain');
    assert.equal(child.status, 0, child.stderr);
    assert.doesNotMatch(child.stderr, /React version/);
    assert.equal(JSON.parse(child.stdout).fatalErrorCount, 0);
  });

  test('EZD-186 T2 control: detect from the root still warns', () => {
    const child = runChild('detect');
    assert.equal(child.status, 0, child.stderr);
    assert.ok(
      child.stderr.includes('React version was set to "detect"'),
      `expected the detect warning on stderr, got: ${child.stderr}`,
    );
  });

  test('EZD-186 T3 root config pins the React version', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    const pinned = docsReactVersion();
    assert.equal(pinned, pkgReactVersion(), 'docs/architecture.md and app/package.json differ');
    for (const file of [PROBE, 'app/src/app/layout.tsx']) {
      const cfg = await eslint.calculateConfigForFile(file);
      assert.equal(cfg.settings.react.version, pinned, `${file} react.version`);
      assert.notEqual(cfg.settings.react.version, 'detect', `${file} react.version`);
      assert.equal(cfg.settings.next.rootDir, APP_DIR, `${file} next.rootDir`);
      assert.equal(typeof cfg.settings['import/resolver'], 'object', `${file} import/resolver`);
      assert.notEqual(cfg.settings['import/resolver'], null, `${file} import/resolver`);
    }
  });

  test('EZD-186 T4 pinnedReactVersion', async () => {
    const { pinnedReactVersion } = await import(
      pathToFileURL(path.join(root, 'eslint-rules', 'react-version.mjs')).href
    );
    const pkgDir = (text) => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd186-'));
      dirs.push(dir);
      writeFileSync(path.join(dir, 'package.json'), text);
      return dir;
    };
    assert.equal(pinnedReactVersion(pkgDir('{"dependencies":{"react":"19.3.1"}}')), '19.3.1', '(a)');
    const refused = /^Error: react_version_not_pinned:/;
    assert.throws(
      () => pinnedReactVersion(pkgDir('{"dependencies":{"react":"^19.0.0"}}')),
      refused,
      '(b)',
    );
    assert.throws(() => pinnedReactVersion(pkgDir('{"dependencies":{}}')), refused, '(c)');
    assert.throws(() => pinnedReactVersion(pkgDir('{}')), refused, '(e)');
    assert.equal(pinnedReactVersion(APP_DIR), docsReactVersion(), '(d)');
  });
});
