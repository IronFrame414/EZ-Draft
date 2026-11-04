// EZD-171 T14 (vault/plans/EZD-171.md section 4): runbook and architecture text.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');

describe('EZD-171 cloud checks docs', () => {
  test('EZD-171 T14 runbook section and architecture names', () => {
    const runbook = read('docs', 'runbook.md');
    const i = runbook.indexOf('## Cloud checks (EZD-171)');
    assert.ok(i >= 0, 'runbook section missing');
    const rest = runbook.slice(i + 5);
    const j = rest.search(/^## /m);
    const section = j < 0 ? runbook.slice(i) : runbook.slice(i, i + 5 + j);
    for (const s of [
      'J1',
      'J2',
      'J3',
      'J4',
      'supabase/checks/cloud-settings.sql',
      '/dev/cloud-check',
      '203.0.113.9',
      'api64.ipify.org',
      '300',
      "PGOPTIONS='-c lock_timeout=5s -c statement_timeout=300s'",
      'psql -W',
      'lock_timeout 5000',
      'statement_timeout 300000',
      'phase 1 pull request',
      'first fix ticket of phase 2',
      'tell the orchestrator',
    ]) {
      assert.ok(section.includes(s), `runbook section lacks: ${s}`);
    }
    const arch = read('docs', 'architecture.md');
    for (const s of [
      'icons:verify',
      '/dev/cloud-check',
      'R-027',
      'Q-0306',
      'app/src/server/db/cloud-settings.test.ts',
    ]) {
      assert.ok(arch.includes(s), `architecture lacks: ${s}`);
    }
  });
});
