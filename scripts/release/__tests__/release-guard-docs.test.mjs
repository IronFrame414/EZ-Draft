// EZD-241 D1 (vault/plans/EZD-241.md sections 3, 4 and 6): runbook and architecture text. node:test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');

/** The text from `heading` (a `## ` line) to the next `## ` heading or the end. */
function section(text, heading) {
  const i = text.indexOf(`\n${heading}\n`);
  assert.ok(i >= 0, `missing section: ${heading}`);
  const rest = text.slice(i + 1 + heading.length);
  const j = rest.search(/\n## /);
  return j < 0 ? text.slice(i) : text.slice(i, i + 1 + heading.length + j);
}
/** The text from `heading` (a `### ` line) to the next `### ` or `## ` heading or the end. */
function subsection(text, heading) {
  const i = text.indexOf(`\n${heading}\n`);
  assert.ok(i >= 0, `missing subsection: ${heading}`);
  const rest = text.slice(i + 1 + heading.length);
  const j = rest.search(/\n##+ /);
  return j < 0 ? text.slice(i) : text.slice(i, i + 1 + heading.length + j);
}
const count = (text, needle) => text.split(needle).length - 1;

const G12_ROW =
  '| — | The release guard stops a migration that drops or renames a base object in the release session and is removed after every run | scripts/release/__tests__/release-guard.test.mjs, scripts/release/__tests__/release-guard-local.test.mjs, scripts/release/__tests__/release.test.mjs (EZD-241) | EZD-241 |';

describe('EZD-241 release guard docs', () => {
  test('EZD-241 D1 EZD-241 done when: the runbook names the ezdraft-dev probe and its expected answer', () => {
    const runbook = read('docs', 'runbook.md');
    const cloud = section(runbook, '## Cloud checks (EZD-171)');
    for (const s of [
      'J5',
      '5. **J5, release guard (EZD-241).**',
      'supabase/checks/release-guard-probe.sql',
      'ezdraft-dev',
      'SQL Editor',
      'ezd_release_guard_probe user=postgres super=false fired=on',
      'tell the orchestrator',
    ]) {
      assert.ok(cloud.includes(s), `Cloud checks section lacks: ${s}`);
    }
    const releases = section(runbook, '## Environments and releases (EZD-023)');
    assert.equal(count(releases, '### Release guard (EZD-241)'), 1, 'one Release guard subsection');
    for (const s of [
      'release_guard_failed',
      'release_guard_remove_failed',
      'release_guard_lost',
      'Do not press Re-run jobs',
      'next run removes them first',
      'migrate_failed',
      'ezd_release_guard:',
      'J5',
    ]) {
      assert.ok(releases.includes(s), `Environments and releases section lacks: ${s}`);
    }
    const eachRelease = subsection(releases, '### Each release (after launch)');
    assert.ok(eachRelease.includes('release_guard_lost'), 'Each release (after launch) lacks: release_guard_lost');
    const arch = read('docs', 'architecture.md');
    for (const s of [
      'release_guard_failed',
      'release_guard_remove_failed',
      'release_guard_lost',
      'ezd_release_guard_migration_row',
      'Q-0358',
      'release-guard-probe.sql',
    ]) {
      assert.ok(arch.includes(s), `architecture lacks: ${s}`);
    }
    const checks = section(arch, '## Machine checks');
    assert.equal(count(checks, G12_ROW), 1, 'the G12 row appears once under Machine checks');
    const lines = checks.split('\n');
    const prev = lines.findIndex((l) => l.endsWith('| EZD-153 |'));
    assert.ok(prev >= 0, 'the EZD-153 row exists');
    assert.equal(lines[prev + 1], G12_ROW, 'the G12 row directly follows the EZD-153 row');
  });
});
