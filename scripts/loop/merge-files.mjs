// EZD-1941 (audit 2026-11-23 W2): files two lanes may change at once, settled by the loop when a branch takes in develop.
//   - app/src/server/db/database.types.ts is generated from the migrations. A merge never hand-merges it: the loop takes
//     either side of a conflict, then regenerates it on the lane database (pnpm db:up, scripts/db/gen-types.mjs) and
//     commits the result. Before the squash, `gen-types.mjs --check` fails the merge if the committed file differs.
//   - A ticket claims the single migration file it adds. A branch migration whose timestamp sorts at or before develop's
//     newest (another lane merged one meanwhile) is renamed to the next free second after it, keeping the branch's own
//     order, so both apply and they apply in the order they merged.
// Node built-ins only. `git` and `run` are injected so the tests use a temp repo and a fake runner.
import path from 'node:path';

export const TYPES_FILE = 'app/src/server/db/database.types.ts';
export const MIGRATIONS_DIR = 'supabase/migrations/';
const MIGRATION = /^(\d{14})_(.+\.sql)$/;

// The 14-digit version of a migration path, or null when it is not a migration file.
export function migrationVersion(f) {
  const s = String(f || '');
  if (!s.startsWith(MIGRATIONS_DIR)) return null;
  const m = MIGRATION.exec(s.slice(MIGRATIONS_DIR.length));
  return m ? m[1] : null;
}

// YYYYMMDDHHMMSS plus `n` seconds, as a calendar time in UTC (20261124235959 + 1 = 20261125000000).
export function addSeconds(version, n) {
  const v = String(version);
  const t = Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(8, 10), +v.slice(10, 12), +v.slice(12, 14));
  const d = new Date(t + n * 1000);
  const p = (x, w = 2) => String(x).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

// Renames for the migrations a branch adds so each sorts after every migration develop has and after the branch's
// previous one: [{ from, to }]. `developFiles` are develop's migration paths, `branchAdded` the paths the branch adds.
export function migrationRenames(developFiles, branchAdded) {
  const devVersions = developFiles.map(migrationVersion).filter(Boolean).sort();
  let last = devVersions.at(-1) ?? null;
  const out = [];
  const mine = branchAdded.filter((f) => migrationVersion(f)).sort();
  for (const f of mine) {
    const v = migrationVersion(f);
    if (last === null || v > last) { last = v; continue; }
    const to = `${MIGRATIONS_DIR}${addSeconds(last, 1)}_${MIGRATION.exec(f.slice(MIGRATIONS_DIR.length))[2]}`;
    out.push({ from: f, to });
    last = migrationVersion(to);
  }
  return out;
}

// Whether a branch's own changes need the types regenerated and checked: it adds or changes a migration or the types.
export const touchesSchema = (changed) => changed.some((f) => f === TYPES_FILE || f.startsWith(MIGRATIONS_DIR));

// After a conflicted `git merge develop`: the types file is staged as develop's side (it is regenerated afterwards);
// returns the conflicts left for the builder.
export function settleGeneratedConflicts(conflicted, git, wt) {
  const rest = [];
  for (const f of conflicted) {
    if (f === TYPES_FILE) {
      git(['checkout', '--theirs', '--', f], wt);
      git(['add', '--', f], wt);
    } else rest.push(f);
  }
  return rest;
}

// Renames the branch's migrations that sort at or before develop's newest, in one commit. Returns the renames.
export function orderMigrations(git, wt, ticket) {
  const dev = git(['ls-tree', '--name-only', 'develop', MIGRATIONS_DIR], wt).out.split('\n').filter(Boolean);
  const added = git(['diff', '--name-only', '--diff-filter=A', 'develop...HEAD', '--', MIGRATIONS_DIR], wt).out.split('\n').filter(Boolean);
  const renames = migrationRenames(dev, added);
  if (!renames.length) return { ok: true, renames };
  for (const r of renames) {
    const mv = git(['mv', '--', r.from, r.to], wt);
    if (!mv.ok) return { ok: false, renames, error: `git mv ${r.from} ${r.to}: ${mv.err || mv.out}` };
  }
  const msg = `chore(${ticket}): migrations renamed to apply after develop's newest\n\n${renames.map((r) => `${r.from} -> ${r.to}`).join('\n')}`;
  const cm = git(['commit', '-q', '-m', msg], wt);
  if (!cm.ok) return { ok: false, renames, error: cm.err || cm.out };
  return { ok: true, renames };
}

// The worktree's own gen-types script: it writes the types file of the checkout it sits in, never the main checkout.
const genTypes = (wt) => path.join(wt, 'scripts/db/gen-types.mjs');

// Resets the lane database to the worktree's migrations, then writes (or, with check, compares) the types file.
// `run(cmd, args)` resolves { code, out }. Returns { ok, step, out }.
export async function regenerateTypes(run, wt, { check = false } = {}) {
  const up = await run('pnpm', ['run', 'db:up']);
  if (up.code !== 0) return { ok: false, step: 'db:up', out: up.out };
  const g = await run(process.execPath, [genTypes(wt), ...(check ? ['--check'] : [])]);
  return { ok: g.code === 0, step: check ? 'gen-types --check' : 'gen-types', out: g.out };
}
