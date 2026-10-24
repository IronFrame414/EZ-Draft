// EZD-023e T18 (vault/plans/EZD-023e.md section 4): docs/architecture.md, docs/runbook.md and .env.example.
// node:test, Node 22 built-ins only. Expected strings come from the plan's section 3 ("all codes", headings),
// Step 4 (architecture), Step 5 and section 6 (runbook text) and the ticket's Done when (AC-EZD-023e-4).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './git-fixture.mjs';

const read = (...p) => readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
const loadContext = () => import('../context.mjs');

// Section 3 "all codes (for the docs)".
const CODES = [
  'not_configured',
  'agent_refused',
  'not_in_actions',
  'wrong_event',
  'not_main',
  'env_missing',
  'not_latest',
  'no_merged_pr',
  'environment_unprotected',
  'not_newer',
  'no_release_name',
  'migration_check_failed',
  'vercel_auto_assign_on',
  'deployment_protection_off',
  'vercel_api_failed',
  'build_failed',
  'no_build',
  'env_mismatch',
  'pending_check_failed',
  'tenant_check_failed',
  'migrate_timeouts_not_applied',
  'owner_email_missing',
  'bootstrap_file_invalid',
  'dump_failed',
  'dump_upload_failed',
  'migrate_failed',
  'bootstrap_failed',
  'tag_failed',
  'promote_failed',
  'verify_failed',
  'released',
  'internal_error',
];
const NOTICES = [
  'vercel_token_expiring',
  'vercel_token_no_expiry',
  'vercel_token_expiry_unknown',
  'owner_email_secret_unused',
  'previous_deployment_unknown',
];
const ARCH_WORDS = [
  'ezdraft-dev',
  'ezdraft-prod',
  'Preview',
  'Production',
  'ezdraft.ezcontractorbinder.com',
  '.github/workflows/release.yml',
  '`release`',
  'not_configured',
  'releases/',
  'Instant Rollback',
  'TENANT1_OWNER_EMAIL',
  'Auto-assign',
  ...CODES,
  ...NOTICES,
];
const RUNBOOK_WORDS = [
  'Auto-assign Custom Production Domains',
  'New environment',
  'Selected branches',
  'main',
  'administrators',
  'repository secret',
  'Re-run jobs',
  'Instant Rollback',
  'Session pooler',
  'percent-encoded',
  'BACKUP_SOURCE_DB_URL',
  'VERCEL_TOKEN',
  'VERCEL_TEAM_ID',
  '90 days',
  'Sensitive',
  'Vercel Authentication',
  'Standard Protection',
  'Git Fork Protection',
  'RELEASE_S3_ACCESS_KEY_ID',
  'TENANT1_OWNER_EMAIL',
  'owner_email_secret_unused',
  'vercel_token_expiring',
  'previous_deployment_unknown',
  'releases/',
  'EMAIL_TRANSPORT',
  'EMAIL_FROM',
  'SUPABASE_API_GATE_SECRET',
  'ezdraft-preview',
  'listAllBucketNames',
  'check-live.mjs',
  '.github/workflows/release.yml',
  'Before launch',
  'production not configured',
  'Write',
  'phase-*',
];
const MACHINE_ROWS = [
  '| — | Release refuses anything but the newest merged PR on main | scripts/release/__tests__/release.test.mjs | EZD-023b |',
  '| — | Release workflow is main-only, pinned and secret-safe | scripts/release/__tests__/workflow.test.mjs | EZD-023e |',
];

const linesOf = (text) => text.split(/\r?\n/);
const indexesOf = (ls, exact) => ls.map((l, i) => (l.trimEnd() === exact ? i : -1)).filter((i) => i >= 0);
/** Lines from `ls[start]` (the heading) up to the next line that starts with one of `stops`, or the end. */
function sectionFrom(ls, start, stops) {
  let end = ls.length;
  for (let i = start + 1; i < ls.length; i += 1) {
    if (stops.some((s) => ls[i].startsWith(s))) {
      end = i;
      break;
    }
  }
  return ls.slice(start, end);
}
const numbersIn = (sectionLines) =>
  sectionLines.map((l) => /^(\d+)\. /.exec(l)).filter(Boolean).map((m) => Number(m[1]));
const seq = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('EZD-023e release documents', () => {
  test('EZD-023e done when: the runbook holds Josh\'s settings and the Before-launch checklist', async () => {
    const { RELEASE_SECRET_NAMES } = await loadContext();
    const names = [...RELEASE_SECRET_NAMES];
    assert.equal(names.length, 10, '10 release secret names');

    // ---- docs/architecture.md ----
    const arch = linesOf(read('docs', 'architecture.md'));
    const runtimeAt = indexesOf(arch, '## Runtime');
    assert.equal(runtimeAt.length, 1, '## Runtime appears once');
    const nextH2 = arch.findIndex((l, i) => i > runtimeAt[0] && l.startsWith('## '));
    const headingAt = indexesOf(arch, '### Environments and releases (EZD-023b)');
    assert.equal(headingAt.length, 1, 'the releases heading appears once');
    assert.ok(headingAt[0] > runtimeAt[0] && headingAt[0] < nextH2, 'the heading sits under ## Runtime');
    const releases = sectionFrom(arch, headingAt[0], ['### ', '## ']).join('\n');
    const archMissing = ARCH_WORDS.filter((w) => !releases.includes(w));
    assert.deepEqual(archMissing, [], 'the architecture section holds every required word and code');

    const envAt = indexesOf(arch, '### Environment variables');
    assert.equal(envAt.length, 1, '### Environment variables appears once');
    const envLines = sectionFrom(arch, envAt[0], ['### ', '## ']);
    for (const name of names) {
      const rows = envLines.filter((l) => l.startsWith(`| \`${name}\` |`));
      assert.equal(rows.length, 1, `one environment row for ${name}`);
      assert.ok(rows[0].includes('GitHub environment `release` only'), `${name} row says GitHub environment release only`);
    }
    const depRow = arch.filter((l) => l.startsWith('| `@aws-sdk/client-s3` |'));
    assert.equal(depRow.length, 1, 'one Dependencies row for @aws-sdk/client-s3');
    assert.ok(depRow[0].trimEnd().endsWith('| EZD-023d |'), 'that row ends in EZD-023d');
    const machineAt = indexesOf(arch, '## Machine checks');
    assert.equal(machineAt.length, 1, '## Machine checks appears once');
    for (const row of MACHINE_ROWS) {
      const at = indexesOf(arch, row);
      assert.equal(at.length, 1, `Machine checks row present once: ${row.slice(0, 40)}`);
      assert.ok(at[0] > machineAt[0], 'the row sits under ## Machine checks');
    }
    const conv = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'conventions', 'check.mjs'), REPO_ROOT], {
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(conv.status, 0, `the conventions check exits 0\n${conv.stdout}${conv.stderr}`);

    // ---- docs/runbook.md ----
    const run = linesOf(read('docs', 'runbook.md'));
    const emailAt = indexesOf(run, '## Email (EZD-008)');
    assert.equal(emailAt.length, 1, '## Email (EZD-008) appears once');
    const relAt = indexesOf(run, '## Environments and releases (EZD-023)');
    assert.equal(relAt.length, 1, 'the releases section appears exactly once');
    assert.ok(relAt[0] > emailAt[0], 'it comes after ## Email (EZD-008)');
    const section = sectionFrom(run, relAt[0], ['## ']);
    const sectionText = section.join('\n');
    const runMissing = RUNBOOK_WORDS.filter((w) => !sectionText.includes(w));
    assert.deepEqual(runMissing, [], 'the runbook section holds every required word');

    const sub = (heading) => {
      const at = indexesOf(section, heading);
      assert.equal(at.length, 1, `${heading} appears once in the section`);
      return sectionFrom(section, at[0], ['### ', '## ']);
    };
    assert.deepEqual(numbersIn(sub("### Josh's GitHub and account settings")), seq(11), 'settings items 1 to 11');
    assert.deepEqual(numbersIn(sub('### Before launch checklist')), seq(12), 'checklist items 1 to 12');
    assert.deepEqual(numbersIn(sub('### Rollback')), seq(6), 'rollback steps 1 to 6');

    assert.ok(!sectionText.includes('postgresql://'), 'no connection string in the section');
    assert.ok(!/\b(re_[A-Za-z0-9]{8,}|ghp_|ghs_)/.test(sectionText), 'no key-shaped text in the section');

    // ---- .env.example ----
    const envExample = read('.env.example');
    const present = names.filter((n) => envExample.includes(n));
    assert.deepEqual(present, [], '.env.example holds none of the release secret names');
  });
});
