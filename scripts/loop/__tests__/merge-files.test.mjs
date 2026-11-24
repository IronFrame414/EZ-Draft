// EZD-1941 (audit 2026-11-23 W2): architecture.md and database.types.ts are merge-at-end shared files, a ticket claims
// the single migration file it adds, and the loop orders migration timestamps and regenerates the types at the merge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { claimFiles, drift, schedule, sharedSet, withClaims } from '../lanes.mjs';
import { TYPES_FILE, addSeconds, migrationRenames, orderMigrations, regenerateTypes, settleGeneratedConflicts, touchesSchema } from '../merge-files.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARCH = 'docs/architecture.md';
const T = (id) => ({ id });

const git = (args, cwd) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};
const write = (root, f, text) => { mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); writeFileSync(path.join(root, f), text); };

// A repo on develop with one migration and a types file; returns its path.
function tempRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'merge-files-'));
  git(['init', '-q', '-b', 'develop'], root);
  write(root, 'supabase/migrations/20261124100000_base.sql', 'create table base ();\n');
  write(root, TYPES_FILE, 'base\n');
  git(['add', '-A'], root); git(['commit', '-q', '-m', 'base'], root);
  return root;
}

test('the shipped rules share architecture.md and database.types.ts with the message catalogs', () => {
  const shared = sharedSet(repo);
  for (const f of [ARCH, TYPES_FILE, 'app/src/server/messages/catalogs/en.ts', 'app/src/server/messages/catalogs/es.ts']) assert.ok(shared.has(f), f);
});

test('a ticket needing architecture.md, the types and a new migration starts while another holds all three', () => {
  const shared = sharedSet(repo);
  const footprints = {
    A: { files: [ARCH, TYPES_FILE, 'supabase/migrations/<new>.sql', 'app/a.ts'] },
    B: { files: [ARCH, TYPES_FILE, 'supabase/migrations/<new>.sql', 'app/b.ts'] },
  };
  const running = { R: { files: ['supabase/migrations/20261124100000_r.sql'] } };
  const r = schedule({ candidates: [T('A'), T('B')], footprints, claims: running, free: 2, shared });
  assert.deepEqual(r.start.map((t) => t.id), ['A', 'B']);
  assert.deepEqual(r.waiting, []);
});

test('claim.mjs rules: two tickets both claim architecture.md and the types; a named migration is per file', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'merge-files-'));
  mkdirSync(path.join(root, 'vault/build'), { recursive: true });
  writeFileSync(path.join(root, 'vault/build/config.json'), JSON.stringify({ shared_files: [ARCH, TYPES_FILE] }));
  try {
    withClaims(root, (c) => { c.A = { lane: 1, files: [] }; c.B = { lane: 2, files: [] }; });
    assert.equal(claimFiles(root, 'A', [ARCH, TYPES_FILE, 'supabase/migrations/20261124120000_a.sql']).ok, true);
    assert.equal(claimFiles(root, 'B', [ARCH, TYPES_FILE, 'supabase/migrations/20261124120100_b.sql']).ok, true);
    const same = claimFiles(root, 'B', ['supabase/migrations/20261124120000_a.sql']);
    assert.deepEqual(same.clashes, [{ file: 'supabase/migrations/20261124120000_a.sql', holder: 'A' }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a new migration under the claimed migrations placeholder is placed, not drift', () => {
  const claims = { A: { files: ['supabase/migrations/<new>.sql'] }, B: { files: ['supabase/migrations/<new>.sql'] } };
  const f = 'supabase/migrations/20261124120000_a.sql';
  const d = drift([f], claims, 'A', new Set(), [f]);
  assert.deepEqual(d.unclaimed, []);
  assert.deepEqual(d.placed, [f]);
  assert.deepEqual(d.clashes, []);
});

test('addSeconds is calendar arithmetic in UTC', () => {
  assert.equal(addSeconds('20261124120059', 1), '20261124120100');
  assert.equal(addSeconds('20261124235959', 1), '20261125000000');
  assert.equal(addSeconds('20261231235959', 1), '20270101000000');
  assert.equal(addSeconds('20261130235959', 2), '20261201000001');
});

test('migrationRenames moves only the branch migrations at or before develop\'s newest, keeping their order', () => {
  const dev = ['supabase/migrations/20261124100000_base.sql', 'supabase/migrations/20261124150000_other_lane.sql'];
  assert.deepEqual(migrationRenames(dev, ['supabase/migrations/20261124120000_mine.sql']),
    [{ from: 'supabase/migrations/20261124120000_mine.sql', to: 'supabase/migrations/20261124150001_mine.sql' }]);
  // Same second as develop's newest: renamed too.
  assert.deepEqual(migrationRenames(dev, ['supabase/migrations/20261124150000_mine.sql']),
    [{ from: 'supabase/migrations/20261124150000_mine.sql', to: 'supabase/migrations/20261124150001_mine.sql' }]);
  // Two branch migrations, the first before develop's newest and the second after: only the first moves.
  assert.deepEqual(migrationRenames(dev, ['supabase/migrations/20261124200000_b.sql', 'supabase/migrations/20261124110000_a.sql']),
    [{ from: 'supabase/migrations/20261124110000_a.sql', to: 'supabase/migrations/20261124150001_a.sql' }]);
  // Both before: they follow develop's newest one second apart.
  assert.deepEqual(migrationRenames(dev, ['supabase/migrations/20261124110000_a.sql', 'supabase/migrations/20261124110500_b.sql']).map((r) => r.to),
    ['supabase/migrations/20261124150001_a.sql', 'supabase/migrations/20261124150002_b.sql']);
  // Already after develop's newest, or not a migration: nothing to do.
  assert.deepEqual(migrationRenames(dev, ['supabase/migrations/20261124160000_late.sql', 'supabase/migrations/README.md']), []);
});

test('two lanes add migrations; the later-merging branch is renamed after the first so both apply in merge order', () => {
  const root = tempRepo();
  try {
    // Lane B starts first and writes an earlier timestamp; lane A writes a later one and merges first.
    git(['checkout', '-q', '-b', 't/B'], root);
    write(root, 'supabase/migrations/20261124120000_b_table.sql', 'create table b ();\n');
    git(['add', '-A'], root); git(['commit', '-q', '-m', 'B'], root);
    git(['checkout', '-q', 'develop'], root);
    write(root, 'supabase/migrations/20261124130000_a_table.sql', 'create table a ();\n');
    git(['add', '-A'], root); git(['commit', '-q', '-m', 'A merged'], root);

    git(['checkout', '-q', 't/B'], root);
    assert.equal(git(['merge', '-q', '--no-edit', 'develop'], root).ok, true);
    const r = orderMigrations(git, root, 'B');
    assert.equal(r.ok, true);
    assert.deepEqual(r.renames, [{ from: 'supabase/migrations/20261124120000_b_table.sql', to: 'supabase/migrations/20261124130001_b_table.sql' }]);
    assert.equal(git(['status', '--porcelain'], root).out, '');
    const applied = readdirSync(path.join(root, 'supabase/migrations')).sort();
    assert.deepEqual(applied, ['20261124100000_base.sql', '20261124130000_a_table.sql', '20261124130001_b_table.sql']);
    assert.equal(readFileSync(path.join(root, 'supabase/migrations/20261124130001_b_table.sql'), 'utf8'), 'create table b ();\n');
    // A second pass finds nothing left to move.
    assert.deepEqual(orderMigrations(git, root, 'B').renames, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a conflict in database.types.ts is taken from develop for regeneration; other conflicts go to the builder', () => {
  const root = tempRepo();
  try {
    git(['checkout', '-q', '-b', 't/B'], root);
    write(root, TYPES_FILE, 'base\nb\n'); write(root, 'app/x.ts', 'b\n');
    git(['add', '-A'], root); git(['commit', '-q', '-m', 'B'], root);
    git(['checkout', '-q', 'develop'], root);
    write(root, TYPES_FILE, 'base\na\n'); write(root, 'app/x.ts', 'a\n');
    git(['add', '-A'], root); git(['commit', '-q', '-m', 'A'], root);
    git(['checkout', '-q', 't/B'], root);
    assert.equal(git(['merge', '-q', '--no-edit', 'develop'], root).ok, false);
    const conflicted = git(['diff', '--name-only', '--diff-filter=U'], root).out.split('\n');
    assert.deepEqual(conflicted.sort(), ['app/x.ts', TYPES_FILE].sort());
    assert.deepEqual(settleGeneratedConflicts(conflicted, git, root), ['app/x.ts']);
    assert.equal(git(['diff', '--name-only', '--diff-filter=U'], root).out, 'app/x.ts');
    assert.equal(readFileSync(path.join(root, TYPES_FILE), 'utf8'), 'base\na\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('touchesSchema: a migration or the types file', () => {
  assert.equal(touchesSchema(['app/a.ts', 'supabase/migrations/20261124120000_a.sql']), true);
  assert.equal(touchesSchema([TYPES_FILE]), true);
  assert.equal(touchesSchema(['app/a.ts', ARCH]), false);
});

test('regenerateTypes resets the lane database, then runs the worktree\'s own gen-types (write, or --check)', async () => {
  const calls = [];
  const ok = async (cmd, args) => { calls.push([cmd, ...args]); return { code: 0, out: '' }; };
  const wt = '/tmp/wt-EZD-1';
  assert.deepEqual(await regenerateTypes(ok, wt), { ok: true, step: 'gen-types', out: '' });
  assert.deepEqual(calls, [['pnpm', 'run', 'db:up'], [process.execPath, path.join(wt, 'scripts/db/gen-types.mjs')]]);
  calls.length = 0;
  const differs = async (cmd, args) => { calls.push([cmd, ...args]); return args.includes('--check') ? { code: 1, out: 'gen_types_mismatch' } : { code: 0, out: '' }; };
  assert.deepEqual(await regenerateTypes(differs, wt, { check: true }), { ok: false, step: 'gen-types --check', out: 'gen_types_mismatch' });
  assert.deepEqual(calls[1], [process.execPath, path.join(wt, 'scripts/db/gen-types.mjs'), '--check']);
  calls.length = 0;
  const down = async (cmd, args) => { calls.push([cmd, ...args]); return { code: 1, out: 'docker' }; };
  assert.deepEqual(await regenerateTypes(down, wt), { ok: false, step: 'db:up', out: 'docker' });
  assert.equal(calls.length, 1);
});

test('the loop regenerates the types after merging develop and checks them before the squash', () => {
  const src = readFileSync(path.join(repo, 'scripts/loop.mjs'), 'utf8');
  const ancestor = src.indexOf("if (git(['merge-base', '--is-ancestor', 'develop', 'HEAD'], wt).ok) {");
  const typesCheck = src.indexOf('regenerateTypes(laneRun(wt, lane), wt, { check: true })', ancestor);
  const merge = src.indexOf("git(['merge', '-q', '--no-edit', 'develop'], wt)", typesCheck);
  const order = src.indexOf('orderMigrations(git, wt, t.id)', merge);
  const regen = src.indexOf('regenerateTypes(laneRun(wt, lane), wt)', order);
  const end = src.indexOf('// end of the merge rounds', regen);
  const squash = src.indexOf("git(['merge', '--squash'", end);
  for (const [name, at] of Object.entries({ ancestor, typesCheck, merge, order, regen, end, squash })) assert.ok(at > 0, name);
  assert.ok(src.slice(merge, order).includes('settleGeneratedConflicts('), 'types conflicts are not sent to the builder');
});

// Review finding: another lane can squash into develop during any await, so nothing asynchronous may run between
// the last "develop is an ancestor of HEAD" test and the squash.
test('no await sits between the last ancestor test and the squash', () => {
  const src = readFileSync(path.join(repo, 'scripts/loop.mjs'), 'utf8');
  const head = "if (git(['merge-base', '--is-ancestor', 'develop', 'HEAD'], wt).ok) {";
  const ancestor = src.indexOf(head);
  assert.ok(ancestor > 0 && src.indexOf(head, ancestor + 1) < 0, 'one ancestor test');
  const end = src.indexOf('// end of the merge rounds', ancestor);
  const squash = src.indexOf("git(['merge', '--squash'", end);
  assert.ok(end > 0 && squash > end);
  // The rounds leave through one break, reached straight from the ancestor test.
  const rounds = src.slice(ancestor, end);
  assert.equal(rounds.split('break;').length - 1, 1, 'one way out of the merge rounds');
  const toBreak = rounds.slice(head.length, rounds.indexOf('break;'));
  assert.ok(!/\bawait\b/.test(toBreak), 'no await between the ancestor test and the break');
  assert.match(toBreak, /^\s*if \(typesOk \|\| !touchesSchema\(branchChanges\(wt\)\)\) $/);
  // The types check is followed by `continue`, so the ancestor test runs again after it.
  assert.match(rounds, /await regenerateTypes\(laneRun\(wt, lane\), wt, \{ check: true \}\);[\s\S]{0,400}?typesOk = true; round--;\s*continue;/);
  // From the end of the rounds to the squash commit: synchronous only.
  const commit = src.indexOf("git(['commit', '-q', '-m', msg])", squash);
  assert.ok(commit > squash);
  assert.ok(!/\bawait\b/.test(src.slice(end, commit)), 'no await between the rounds and the squash commit');
});
