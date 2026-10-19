// EZD-023a test helper (vault/plans/EZD-023a.md section 3, "test helper" row): temporary git repositories
// with a bare `origin` reached over `file://`, so no test ever touches the network. Node 22 built-ins only.
// EZD-023b imports these names.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CHECK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'release', 'check-migrations.mjs');

const GIT_IDENTITY = [
  '-c',
  'user.name=EZ Draft Test',
  '-c',
  'user.email=test@example.test',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'tag.gpgSign=false',
  '-c',
  'init.defaultBranch=main',
];

function gitEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return env;
}

const tmpDir = () => mkdtempSync(path.join(os.tmpdir(), 'ezd-023a-'));

/** Runs git in `dir` with a fixed identity and no signing; returns trimmed stdout; throws on a non-zero exit. */
export function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...GIT_IDENTITY, ...args], { encoding: 'utf8', env: gitEnv() });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} in ${dir} exited ${r.status}\n${r.stdout}${r.stderr}`);
  }
  return r.stdout.trim();
}

// Every temp folder a fixture makes, by the origin it belongs to, so `cleanup()` removes clones too.
const owned = new Map();
const own = (origin, dir) => {
  if (!owned.has(origin)) owned.set(origin, []);
  owned.get(origin).push(dir);
};

/** A bare `origin` and a working repo on branch `main` whose remote `origin` is the bare repo (file://). */
export function makeRepo() {
  const originRoot = tmpDir();
  const origin = path.join(originRoot, 'origin.git');
  git(originRoot, 'init', '--bare', '-b', 'main', origin);
  const workRoot = tmpDir();
  const work = path.join(workRoot, 'work');
  git(workRoot, 'init', '-b', 'main', work);
  git(work, 'remote', 'add', 'origin', pathToFileURL(origin).href);
  own(origin, originRoot);
  own(origin, workRoot);
  const cleanup = () => {
    for (const d of owned.get(origin) ?? []) rmSync(d, { recursive: true, force: true });
    owned.delete(origin);
  };
  return { origin, work, cleanup };
}

/**
 * Writes `files` (path → text, or null to delete) into `dir`, stages everything and commits.
 * Returns the commit sha.
 */
export function commitFiles(dir, files, message) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    if (text === null) {
      if (existsSync(abs)) unlinkSync(abs);
      continue;
    }
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '--allow-empty', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

/** An annotated tag at HEAD (the shape EZD-023b's release workflow creates). */
export function tagAnnotated(dir, name) {
  git(dir, 'tag', '-a', '-m', `release ${name}`, name);
}

/** Clones `origin` over file:// into a fresh temp folder; returns the clone's path. */
export function cloneFrom(origin, { depth, noTags } = {}) {
  const root = tmpDir();
  own(origin, root);
  const dir = path.join(root, 'clone');
  const args = ['clone', '-q'];
  if (depth) args.push('--depth', String(depth));
  if (noTags) args.push('--no-tags');
  args.push(pathToFileURL(origin).href, dir);
  git(root, ...args);
  return dir;
}

/**
 * Spawns `node scripts/release/check-migrations.mjs <args>` with `cwd`, an env copied from process.env
 * minus GITHUB_ACTIONS, then `env` merged in. Returns { status, stdout, stderr }.
 */
export function runCheck(cwd, args = [], env = {}) {
  const base = gitEnv();
  delete base.GITHUB_ACTIONS;
  const r = spawnSync(process.execPath, [CHECK_SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...base, ...env },
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** The plan's base migration `FIX` (section 4), released as tag `phase-0`. */
export const FIX_NAME = '20261101000000_create_fixture.sql';
export const FIX = `create table public.fixture_item (id uuid primary key, legacy_note text);
create view public.fixture_view as select id from public.fixture_item;
create type public.fixture_kind as enum ('a','b');
create schema extra;
create function public.health() returns text language sql as $$ select 'ok' $$;
`;
export const RETIRED_EMPTY = '{"retired":[]}\n';
export const migrationPath = (name) => `supabase/migrations/${name}`;
export const RETIRED_PATH = 'supabase/retired.json';
export const DROP_NAME = '20261102000000_drop_legacy_note.sql';
export const DROP_SQL = 'alter table public.fixture_item drop column legacy_note;\n';
