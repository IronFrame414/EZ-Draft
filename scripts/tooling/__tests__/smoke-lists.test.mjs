// EZD-350 · list-pinning tests run in every scoped gate (vault/plans/EZD-350.md sections 3-4; Q-0006; debt D-016).
// Run by the root `node --test "scripts/**/*.test.mjs"`. Spawns one app Vitest run in which no test body runs.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inScope, childEnv } from '../../backup/__tests__/local-fixture.mjs';
import { holdRootDbShared } from '../../test-harness/db-lock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Phase-shaped scope grep for a phase whose only ticket is EZD-350 (docs/architecture.md Test scope (Q-0006)).
const FIXTURE_GREP = '(?:EZD-(?:350)(?![0-9a-z]))|@smoke';
// A pattern that matches no test name: every test in the child run is reported as skipped.
const NEVER_GREP = '(?!)';

// Full names that must carry the @smoke tag (plan section 3).
const TAGGED = [
  'EZD-006 RLS audit T18 exemption and grant lists match the catalog @smoke',
  'EZD-009 job handlers EZD-009 T19 every registered handler has a run-twice test @smoke',
];
// Full names of untagged tests in the same two files that must stay outside the grep (plan section 3).
const CONTROLS = [
  'EZD-006 RLS audit T16 the audit catches each problem',
  'EZD-009 job handlers EZD-009 T14 the test handler is safe to run twice',
];

const fullNames = (report) => report.testResults.flatMap((f) => f.assertionResults).map((a) => a.fullName);

describe('EZD-350 list-pinning tests are in every scoped gate', { skip: !inScope('EZD-350') }, () => {
  let tmp;
  let releaseRootDb;

  before(async () => {
    releaseRootDb = await holdRootDbShared();
  });

  after(async () => {
    try {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    } finally {
      if (releaseRootDb) await releaseRootDb();
    }
  });

  test('EZD-350 done when: T18 and T19 run in a phase-scoped gate of any phase', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd350-'));
    const out = path.join(tmp, 'report.json');
    const env = childEnv();
    env.EZD_TEST_GREP = NEVER_GREP;
    env.NO_COLOR = '1';
    const r = spawnSync(
      'pnpm',
      [
        '--filter',
        '@ezdraft/app',
        'exec',
        'vitest',
        'run',
        '--reporter=json',
        `--outputFile=${out}`,
        'src/server/db/rls.audit.test.ts',
        'src/server/jobs/handlers.test.ts',
      ],
      { cwd: root, env, encoding: 'utf8', timeout: 300_000 },
    );
    const tail = `${String(r.stdout ?? '')}${String(r.stderr ?? '')}`.slice(-2000);

    // (a) the child run exits 0 and writes its JSON report, with no failed test.
    assert.equal(r.status, 0, `S1 (a) child exit status 0 (got ${r.status}): ${tail}`);
    assert.ok(existsSync(out), `S1 (a) child wrote the JSON report: ${tail}`);
    const report = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(report.numFailedTests, 0, 'S1 (a) no failed test in the child run');

    const names = fullNames(report);
    const phaseGrep = new RegExp(FIXTURE_GREP);

    // (b) each list-pinning test is reported under its tagged full name.
    for (const name of TAGGED) {
      assert.ok(names.includes(name), `S1 (b) tagged: ${name}`);
    }

    // (c) the phase-shaped grep selects each tagged full name.
    for (const name of TAGGED) {
      assert.ok(phaseGrep.test(name), `S1 (c) matched by the phase grep: ${name}`);
    }

    // (d) the untagged controls are reported and the phase-shaped grep does not select them.
    for (const name of CONTROLS) {
      assert.ok(names.includes(name), `S1 (d) control reported: ${name}`);
      assert.equal(phaseGrep.test(name), false, `S1 (d) control not selected by the phase grep: ${name}`);
    }
  });
});
