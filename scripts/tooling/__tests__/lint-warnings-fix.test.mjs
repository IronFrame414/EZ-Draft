// EZD-184 T1, T2 (vault/plans/EZD-184.md Tests; Step 2): the two ESLint warnings from our code on develop
// (Q-0320) are gone. T1 lints the two real files with the repo's own flat config (plan D6). T2 checks the
// text of the two files: the unused constant is deleted, and the one remaining lint disable in the realtime
// hub carries a reason and sits directly above the redirect it covers (plan D2, D4, D5).
// Pattern: scripts/tooling/__tests__/no-polling-lint.test.mjs (EZD-018 T18).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');

const HUB = 'app/src/lib/realtime/index.ts';
const PERMISSIONS = 'app/src/server/db/permissions.test.ts';
const RULE = '@next/next/no-location-assign-relative-destination';
const DISABLE_RE = new RegExp(`^// eslint-disable-next-line ${RULE.replace(/[/]/g, '\\/')} -- \\S`);

function importFromRoot(name) {
  const req = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(req.resolve(name)).href).then((mod) => mod.default ?? mod);
}

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('EZD-184 lint warnings from our code', () => {
  test('EZD-184 T1 both files lint clean (no warnings, no errors)', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    const results = await eslint.lintFiles([HUB, PERMISSIONS]);
    assert.equal(results.length, 2);
    for (const r of results) {
      assert.equal(r.errorCount, 0, r.filePath);
      assert.equal(r.warningCount, 0, r.filePath);
      assert.equal(r.fatalErrorCount, 0, r.filePath);
      assert.deepEqual(r.messages, [], r.filePath);
    }
  });

  test('EZD-184 T2 causes removed, the disable carries a reason and sits above the redirect', () => {
    // permissions.test.ts: the unused PRESET_NAMES constant is deleted and no disable is added.
    const perm = read(PERMISSIONS);
    assert.equal(perm.includes('PRESET_NAMES'), false, 'PRESET_NAMES still in permissions.test.ts');
    assert.equal(perm.includes('eslint-disable'), false, 'eslint-disable added to permissions.test.ts');

    // index.ts: exactly one lint disable, for the one rule, with a reason, directly above the assign call.
    const hub = read(HUB);
    const lines = hub.split('\n');
    assert.equal(hub.split('eslint-disable').length - 1, 1, 'expected exactly one eslint-disable');
    const idx = lines.findIndex((l) => l.includes('eslint-disable'));
    assert.ok(idx >= 0, 'no eslint-disable line');
    assert.match(lines[idx].trim(), DISABLE_RE, 'disable line must name the rule and give a reason');
    assert.ok(
      lines[idx + 1].includes("window.location.assign('/sign-in')"),
      'the line after the disable must be the window.location.assign("/sign-in") call',
    );
  });
});
