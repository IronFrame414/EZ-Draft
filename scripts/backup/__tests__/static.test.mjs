// EZD-025 T11 and T16 (vault/plans/EZD-025.md Tests; Steps 3, 4, 5, 7): the two workflow files are safe on a
// public repo, and the package scripts, .env.example, scratch config, migrations, docs and the CLI's
// not-configured answers are as the plan says. node:test, Node 22 built-ins only, no YAML package.
// The workflow checker is run on in-memory samples first (a valid one and one-change variants, lesson L-006),
// so a checker that accepts everything fails its own test; then on the two real files.
// Expected values: plan Step 3 (lists, cron, timeouts, steps), T11, T16; Q-0106; Q-0112; Q-0158 (a).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, childEnv } from './local-fixture.mjs';

const read = (...p) => readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
const SHA_CHECKOUT = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const SHA_NODE = '949feb2413d6458794dcd2491c4babbbce0c15c1';

const FILES_SECRETS = [
  'BACKUP_SOURCE_DB_URL',
  'BACKUP_SOURCE_SUPABASE_URL',
  'BACKUP_SOURCE_SECRET_KEY',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
];
const DB_SECRETS = [
  'BACKUP_SOURCE_DB_URL',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
];
const SPECS = {
  'backup-files.yml': { cron: '0 7 * * *', timeout: '120', script: 'pnpm backup:files', secrets: FILES_SECRETS },
  'backup-db.yml': { cron: '0 8 * * 0', timeout: '60', script: 'pnpm backup:db', secrets: DB_SECRETS },
};

// ---- line parser (blank and comment lines dropped, trailing ` # comment` stripped) --------------------------
function parseLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    out.push({ indent: raw.length - raw.trimStart().length, text: raw.replace(/\s+#.*$/, '').trim() });
  }
  return out;
}
function kidsOf(ls, i) {
  const kids = [];
  for (let j = i + 1; j < ls.length && ls[j].indent > ls[i].indent; j += 1) kids.push(ls[j]);
  return kids;
}
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** Steps as arrays of lines (each step = the lines from its `- ` line to the next one at the same indent). */
function stepsOf(ls) {
  const at = ls.findIndex((l) => l.text === 'steps:');
  if (at < 0) return [];
  const kids = kidsOf(ls, at);
  if (kids.length === 0) return [];
  const itemIndent = Math.min(...kids.map((l) => l.indent));
  const steps = [];
  for (const l of kids) {
    if (l.indent === itemIndent && l.text.startsWith('- ')) steps.push([l]);
    else steps.at(-1)?.push(l);
  }
  return steps;
}

/** Problems found in one backup workflow text (empty = accepted). */
export function checkBackupWorkflow(text, spec) {
  const problems = [];
  const bad = (m) => problems.push(m);
  const ls = parseLines(text);

  const onAt = ls.findIndex((l) => l.indent === 0 && l.text === 'on:');
  if (onAt < 0) bad('no on:');
  else {
    const kids = kidsOf(ls, onAt);
    const keyIndent = Math.min(...kids.map((l) => l.indent));
    const keys = kids.filter((l) => l.indent === keyIndent).map((l) => l.text);
    if (!sameSet(keys, ['schedule:', 'workflow_dispatch:'])) bad(`triggers: ${JSON.stringify(keys)}`);
    const crons = kids.filter((l) => /^-?\s*cron:/.test(l.text) || l.text.startsWith('- cron:'));
    const cronValues = crons.map((l) => l.text.replace(/^-\s*/, '').replace(/^cron:\s*/, '').replace(/^['"]|['"]$/g, ''));
    if (JSON.stringify(cronValues) !== JSON.stringify([spec.cron])) bad(`cron: ${JSON.stringify(cronValues)}`);
  }
  if (ls.some((l) => /^(push|pull_request|pull_request_target|workflow_run)\s*:/.test(l.text.replace(/^-\s*/, '')))) {
    bad('forbidden trigger');
  }

  const envAt = ls.findIndex((l) => l.text.startsWith('environment:'));
  if (envAt < 0) bad('no environment');
  else {
    let name = ls[envAt].text.slice('environment:'.length).trim();
    if (name === '') name = (kidsOf(ls, envAt).find((l) => l.text.startsWith('name:'))?.text ?? '').slice(5).trim();
    name = name.replace(/^['"]|['"]$/g, '');
    if (name.toLowerCase() !== 'release') bad(`environment ${name}`);
  }
  if (!ls.some((l) => l.text.startsWith('if:') && l.text.includes('refs/heads/main'))) bad('no main-only if');

  const permAt = ls.findIndex((l) => l.indent > 0 && l.text === 'permissions:');
  if (permAt < 0) bad('no job permissions');
  else if (!sameSet(kidsOf(ls, permAt).map((l) => l.text), ['contents: read', 'actions: read'])) {
    bad('permissions are not exactly contents: read and actions: read');
  }
  if (!/cancel-in-progress:\s*false/.test(text)) bad('cancel-in-progress is not false');
  if (!ls.some((l) => l.text === `timeout-minutes: ${spec.timeout}`)) bad(`timeout-minutes is not ${spec.timeout}`);

  const steps = stepsOf(ls);
  const runStep = steps.find((s) => s.some((l) => l.text === `run: ${spec.script}`));
  if (!runStep) bad(`no step runs ${spec.script}`);
  const withSecrets = steps.filter((s) => s.some((l) => l.text.includes('secrets.')));
  if (withSecrets.length !== 1 || withSecrets[0] !== runStep) bad('secrets. appears outside the script step');
  if (runStep) {
    const names = runStep
      .map((l) => /\bsecrets\.([A-Z0-9_]+)/.exec(l.text)?.[1])
      .filter(Boolean);
    if (!sameSet(names, spec.secrets)) bad(`secret names: ${JSON.stringify(names)}`);
    const envAtStep = runStep.findIndex((l) => l.text === 'env:');
    if (envAtStep < 0) bad('script step has no env:');
    if (!runStep.some((l) => /^GITHUB_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}$/.test(l.text))) {
      bad('GITHUB_TOKEN is not github.token');
    }
  }
  for (const l of ls) {
    const m = /\buses:\s*(\S+)/.exec(l.text);
    if (m && !/@[0-9a-f]{40}$/.test(m[1])) bad(`uses not pinned: ${m[1]}`);
    if (/^run:/.test(l.text) && l.text.includes('${{ secrets.')) bad('secret in a run line');
  }
  const checkout = steps.find((s) => s[0].text.includes('actions/checkout@'));
  if (!checkout?.some((l) => l.text === 'persist-credentials: false')) bad('checkout persist-credentials');
  const setupNode = steps.find((s) => s[0].text.includes('actions/setup-node@'));
  if (!setupNode) bad('no setup-node');
  else if (setupNode.some((l) => l.text.startsWith('cache:'))) bad('setup-node cache');
  const installs = steps.filter((s) => s.some((l) => l.text.startsWith('run: pnpm install')));
  if (installs.length !== 1 || !installs[0].some((l) => l.text === 'run: pnpm install --frozen-lockfile')) {
    bad('install step is not exactly pnpm install --frozen-lockfile');
  }
  if (/pnpm rebuild|--ignore-scripts|upload-artifact|actions\/cache|set -x/.test(text)) bad('forbidden text');
  return problems;
}

function sampleWorkflow(spec, name) {
  const secretLines = spec.secrets.map((n) => `          ${n}: $` + `{{ secrets.${n} }}`).join('\n');
  return `name: Off-site backup ${name}
on:
  schedule:
    - cron: '${spec.cron}'
  workflow_dispatch:
concurrency:
  group: ${name}
  cancel-in-progress: false
jobs:
  backup:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: ${spec.timeout}
    environment: release
    permissions:
      contents: read
      actions: read
    steps:
      - uses: actions/checkout@${SHA_CHECKOUT} # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@${SHA_NODE} # v7.1.0
        with:
          node-version: 22
          package-manager-cache: false
      - name: Install pnpm
        run: npm install -g pnpm@12.14.0
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run
        env:
          GITHUB_TOKEN: $` + `{{ github.token }}
${secretLines}
        run: ${spec.script}
`;
}

describe('EZD-025 T11 the backup workflows are safe', () => {
  const spec = SPECS['backup-files.yml'];
  const sample = sampleWorkflow(spec, 'files');
  const mutate = (from, to) => {
    assert.ok(sample.includes(from), `sample holds ${from}`);
    return sample.replace(from, to);
  };

  test('EZD-025 T11 the checker accepts a valid sample and rejects one-change variants', () => {
    assert.deepEqual(checkBackupWorkflow(sample, spec), [], 'valid sample');
    const variants = {
      push: mutate('  workflow_dispatch:', '  workflow_dispatch:\n  push:\n    branches: [main]'),
      environment: mutate('environment: release', 'environment: production'),
      noMainIf: mutate("if: github.ref == 'refs/heads/main'", "if: github.event_name == 'schedule'"),
      permissions: mutate('      actions: read', '      actions: read\n      id-token: write'),
      cancel: mutate('cancel-in-progress: false', 'cancel-in-progress: true'),
      timeout: mutate('timeout-minutes: 120', 'timeout-minutes: 360'),
      unpinned: mutate(`actions/checkout@${SHA_CHECKOUT}`, 'actions/checkout@v4'),
      cache: mutate('          node-version: 22', '          node-version: 22\n          cache: pnpm'),
      install: mutate('run: pnpm install --frozen-lockfile', 'run: pnpm install --frozen-lockfile --ignore-scripts'),
      extraSecret: mutate('          GITHUB_TOKEN:', '          VERCEL_TOKEN: $' + '{{ secrets.VERCEL_TOKEN }}\n          GITHUB_TOKEN:'),
      secretInRun: mutate('        run: npm install -g pnpm@12.14.0', '        run: echo $' + '{{ secrets.BACKUP_S3_BUCKET }}'),
      artifact: `${sample}      - uses: actions/upload-artifact@${SHA_NODE}\n`,
      persist: mutate('persist-credentials: false', 'persist-credentials: true'),
    };
    for (const [id, text] of Object.entries(variants)) {
      assert.ok(checkBackupWorkflow(text, spec).length > 0, `variant ${id} is rejected`);
    }
  });

  for (const [file, fileSpec] of Object.entries(SPECS)) {
    test(`EZD-025 T11 ${file} passes the checker`, () => {
      const p = path.join('.github', 'workflows', file);
      assert.ok(existsSync(path.join(REPO_ROOT, p)), `${p} exists`);
      assert.deepEqual(checkBackupWorkflow(read(p), fileSpec), []);
    });
  }
});

// ---- T16 -------------------------------------------------------------------------------------------------------
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ');
/** The text of a markdown section: from its heading line to the next heading of the same or higher level. */
function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return null;
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = /^(#+)\s/.exec(lines[i]);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}
function tomlValue(text, table, key) {
  let current = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    const t = /^\[([^\]]+)\]$/.exec(line);
    if (t) current = t[1];
    else if (current === table) {
      const kv = new RegExp(`^${key}\\s*=\\s*(.+)$`).exec(line);
      if (kv) return kv[1].trim();
    }
  }
  return undefined;
}

describe('EZD-025 T16 static checks and docs', () => {
  test('EZD-025 T16 package scripts', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.scripts['backup:files'], 'node scripts/backup/files.mjs');
    assert.equal(pkg.scripts['backup:db'], 'node scripts/backup/db.mjs');
    assert.equal(pkg.scripts['backup:restore'], 'node scripts/backup/restore.mjs');
    for (const name of ['typecheck', 'lint', 'test', 'build']) {
      assert.ok(!String(pkg.scripts[name]).includes('backup:'), `${name} does not run backup:*`);
    }
  });

  test('EZD-025 T16 .env.example holds no BACKUP names and the 13 baseline names', () => {
    const text = read('.env.example');
    const lines = text.split(/\r?\n/);
    // Plan gap 2026-10-23: none of the 8 names anywhere in the text, comment lines included.
    for (const name of FILES_SECRETS) assert.ok(!text.includes(name), `${name} is not in .env.example`);
    // Baseline (plan Interface contract): the 13 names of EZD-004b T7 (EZD-034 edit, vault/plans/EZD-034.md section 4, T11/T12 edit), scripts/db/__tests__/env.test.mjs:11-28.
    const BASELINE = [
      'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY',
      'SUPABASE_API_GATE_SECRET', 'TURNSTILE_SITE_KEY', 'EMAIL_TRANSPORT', 'EMAIL_FROM', 'RESEND_API_KEY', 'CRON_SECRET',
      'SENTRY_TRANSPORT', 'SENTRY_DSN', 'ALERT_EMAIL_TO', 'AI_MODE',
    ].map((n) => `${n}=`);
    assert.deepEqual(
      lines.map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#')),
      BASELINE,
      'non-comment lines are the 13 baseline names',
    );
  });

  test('EZD-025 T16 scratch config.toml', () => {
    const p = 'scripts/backup/scratch/supabase/config.toml';
    assert.ok(existsSync(path.join(REPO_ROOT, p)), `${p} exists`);
    const toml = read(p);
    assert.match(toml, /^\s*project_id\s*=\s*"ezdraft-restore"\s*$/m);
    assert.equal(tomlValue(toml, 'api', 'port'), '55321');
    assert.equal(tomlValue(toml, 'db', 'port'), '55322');
    assert.equal(tomlValue(toml, 'db.seed', 'enabled'), 'false');
  });

  test('EZD-025 T16 migrations', () => {
    const dir = path.join(REPO_ROOT, 'supabase', 'migrations');
    const find = (part) => readdirSync(dir).filter((f) => f.endsWith(`_${part}.sql`));
    const create = find('create_backup_run');
    const soft = find('sent_files_soft_delete');
    assert.equal(create.length, 1, 'one create_backup_run migration');
    assert.equal(soft.length, 1, 'one sent_files_soft_delete migration');
    const a = norm(readFileSync(path.join(dir, create[0]), 'utf8'));
    for (const s of [
      'enable row level security',
      'using (false)',
      'revoke all on public.backup_run from authenticated',
      'grant select, insert, update, delete on public.backup_run to service_role'.toLowerCase(),
    ]) {
      assert.ok(a.includes(s), `create_backup_run holds: ${s}`);
    }
    const b = norm(readFileSync(path.join(dir, soft[0]), 'utf8'));
    for (const s of ['before delete or update on storage.objects', "set search_path = ''"]) {
      assert.ok(b.includes(s), `sent_files_soft_delete holds: ${s}`);
    }
  });

  test('EZD-025 T16 docs/architecture.md', () => {
    const arch = read('docs', 'architecture.md');
    const runtime = section(arch, '## Runtime');
    const sub = section(runtime ?? '', '### Off-site backups and restore (EZD-025)');
    assert.ok(sub, '### Off-site backups and restore (EZD-025) is under ## Runtime');
    for (const w of ['backup_run', 'files/', 'db/', 'manifest.json', 'versioning', '55321', 'sent/']) {
      assert.ok(sub.includes(w), `section names ${w}`);
    }
    const row = arch.split(/\r?\n/).find((l) => l.startsWith('| `@aws-sdk/client-s3` |'));
    assert.ok(row, 'Dependencies row exists');
    const cells = row.split('|').map((c) => c.trim());
    const version = JSON.parse(read('package.json')).devDependencies['@aws-sdk/client-s3'];
    assert.equal(cells[2], `\`${version}\``, 'row version equals the root devDependency');
    assert.equal(cells.at(-2), 'EZD-023d', 'Added by EZD-023d');
    for (const h of ['### Tenancy tables (EZD-005)', '### Row-level security (EZD-006)']) {
      assert.ok(section(arch, h)?.includes('backup_run'), `${h} lists backup_run`);
    }
  });

  test('EZD-025 T16 docs/runbook.md', () => {
    const rb = read('docs', 'runbook.md');
    const sec = section(rb, '## Off-site backups and restore drill (EZD-025)');
    assert.ok(sec, 'runbook section exists');
    for (const w of [
      'versioning', '--env-file', '--record', 'Docker', '--from-dir', 'Backblaze B2', '90 days',
      '13 weeks', 'deleteFiles', 'release', 'releases/', 'Object Lock', 'Governance', '91 days',
      'bypassGovernance', 'SSE-B2', 'Private', 'ezdraft-secrets', 'Read(', 'Before launch',
    ]) {
      assert.ok(sec.includes(w), `runbook names ${w}`);
    }
    assert.ok(!sec.includes('.env.release.local'), 'no .env.release.local');
    assert.ok(!sec.includes('.env.restore.local'), 'no .env.restore.local');
  });

  test('EZD-025 T16 the conventions check and the generated types are clean', () => {
    const c = spawnSync('node', ['scripts/conventions/check.mjs', '.'], { cwd: REPO_ROOT, encoding: 'utf8', env: childEnv() });
    assert.equal(c.status, 0, `conventions check: ${c.stdout}${c.stderr}`);
    const g = spawnSync('node', ['scripts/db/gen-types.mjs', '--check'], { cwd: REPO_ROOT, encoding: 'utf8', env: childEnv() });
    assert.equal(g.status, 0, `gen-types --check: ${g.stdout}${g.stderr}`);
  });

  test('EZD-025 T16 files.mjs with no BACKUP_* is not_configured, with one name it is env_missing', () => {
    const base = childEnv();
    for (const k of Object.keys(base)) if (k.startsWith('BACKUP_')) delete base[k];
    delete base.GITHUB_ACTIONS;
    const none = spawnSync('node', ['scripts/backup/files.mjs'], { cwd: REPO_ROOT, encoding: 'utf8', env: base });
    assert.equal(none.status, 0, `no env exit code: ${none.stderr}`);
    assert.ok(`${none.stdout}${none.stderr}`.includes('not_configured'), 'code not_configured');
    const some = spawnSync('node', ['scripts/backup/files.mjs'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...base, BACKUP_S3_BUCKET: 'ezd025-partial' },
    });
    assert.equal(some.status, 1, `partial env exit code: ${some.stderr}`);
    assert.ok(`${some.stdout}${some.stderr}`.includes('env_missing'), 'code env_missing');
  });
});
