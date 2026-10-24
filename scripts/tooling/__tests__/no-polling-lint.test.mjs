// EZD-018 T18 (vault/plans/EZD-018.md Tests; Step 7): "no polling loops anywhere in the app" on the real
// flat config. setInterval is refused in app/src as a global (no-restricted-globals) and as a property of
// window, globalThis and self (no-restricted-properties), severity error; test files, setTimeout and a
// disabled line with a reason are not reported; the whole repo lints clean. Message wording is never
// compared. Pattern: scripts/tooling/__tests__/messages-lint.test.mjs (EZD-026a).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const RULES = new Set(['no-restricted-globals', 'no-restricted-properties']);

function importFromRoot(name) {
  const req = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(req.resolve(name)).href).then((mod) => mod.default ?? mod);
}

async function lint(code, filePath) {
  const { ESLint } = await importFromRoot('eslint');
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => RULES.has(m.ruleId));
}

function childEnv() {
  const env = { ...process.env };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

const A = "setInterval(() => fetch('/x'), 1000);\n";
const LIB = 'app/src/lib/a.ts';
const shape = (msgs) => msgs.map((m) => ({ ruleId: m.ruleId, severity: m.severity }));

describe('EZD-018 no-polling lint', () => {
  test('EZD-018 T18 (a) a bare setInterval in app/src is an error', async () => {
    assert.deepEqual(shape(await lint(A, LIB)), [{ ruleId: 'no-restricted-globals', severity: 2 }]);
  });

  test('EZD-018 T18 (b), (c) window.setInterval and globalThis.setInterval are errors', async () => {
    for (const code of ['window.setInterval(f, 1000);\n', 'globalThis.setInterval(f, 1000);\n']) {
      assert.deepEqual(
        shape(await lint(code, LIB)),
        [{ ruleId: 'no-restricted-properties', severity: 2 }],
        code,
      );
    }
  });

  test('EZD-018 T18 (d), (e), (f) test files, setTimeout and a disabled line with a reason pass', async () => {
    assert.deepEqual(shape(await lint(A, 'app/src/lib/a.test.ts')), [], '(d)');
    assert.deepEqual(
      shape(await lint('setTimeout(f, 2000);\n', LIB)),
      [],
      '(e)',
    );
    assert.deepEqual(
      shape(
        await lint(
          `// eslint-disable-next-line no-restricted-globals -- display only, no network\n${A}`,
          LIB,
        ),
      ),
      [],
      '(f)',
    );
  });

  test('EZD-018 T18 (g) the whole repo lints clean', () => {
    const r = spawnSync('pnpm', ['run', 'lint'], {
      cwd: root,
      encoding: 'utf8',
      env: childEnv(),
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`.slice(-4000));
  });
});
