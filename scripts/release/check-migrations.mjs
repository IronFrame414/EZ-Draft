#!/usr/bin/env node
// EZD-023a Step 4 (vault/plans/EZD-023a.md): the release-safety migration check. Node 22 built-ins only.
// Refuses a migration that drops or renames something the previous release tag still reads (M1), an edited
// or removed released migration (M2), an out-of-order version (M3), SQL that cannot be checked statically
// (M4) and a malformed supabase/retired.json (M5). In GitHub Actions a failed tag fetch is M0 (fails closed).
// Run by the root `lint` script, so every gate run and CI run it (docs/architecture.md ### Release safety).
//
// CLI: node scripts/release/check-migrations.mjs [--root <dir>] [--base <tag>] [--head <git ref>] [--no-fetch]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listReleaseTags, previousReleaseTag, RELEASE_TAG_RE } from './tags.mjs';
import {
  findCreated,
  findDefined,
  findDestructive,
  findUnverifiable,
  OBJECT_KINDS,
  splitStatements,
} from './sql-scan.mjs';

export const MIGRATIONS_DIR = 'supabase/migrations';
export const RETIRED_FILE = 'supabase/retired.json';
const RETIRED_KINDS = [...OBJECT_KINDS, 'column'];
const SEGMENT_RE = /^[a-z_][a-z0-9_]*$/;
const VERSION_RE = /^(\d{14})_/;

const versionOf = (name) => {
  const m = VERSION_RE.exec(name);
  return m ? m[1] : null;
};
const lf = (text) => text.replace(/\r\n?/g, '\n');
const migrationFile = (name) => `${MIGRATIONS_DIR}/${name}`;

// ---------------------------------------------------------------------------------------------------
// Pure core.
// ---------------------------------------------------------------------------------------------------

/**
 * Validates the text of supabase/retired.json (`null` = missing). Returns { entries, errors }; `entries`
 * is the list when there are no errors, else []. The CLI turns each error into an M5 line (Step 2 format).
 */
export function validateRetired(text) {
  const errors = [];
  if (text === null || text === undefined) return { entries: [], errors: ['missing'] };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { entries: [], errors: ['not valid JSON'] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.retired)) {
    return { entries: [], errors: ['expected an object with a "retired" array'] };
  }
  data.retired.forEach((e, n) => {
    const at = `entry ${n + 1}`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      errors.push(`${at}: expected an object with kind, name, ticket and reason`);
      return;
    }
    if (!RETIRED_KINDS.includes(e.kind)) {
      errors.push(`${at}: kind must be one of ${RETIRED_KINDS.join(', ')}`);
    }
    if (typeof e.name !== 'string') {
      errors.push(`${at}: name must be a string`);
    } else {
      const segments = e.name.split('.');
      const want = e.kind === 'column' ? 3 : e.kind === 'schema' ? 1 : 2;
      if (RETIRED_KINDS.includes(e.kind) && segments.length !== want) {
        errors.push(`${at}: a ${e.kind} name has ${want} dot-separated segment(s), got "${e.name}"`);
      }
      if (!segments.every((s) => SEGMENT_RE.test(s))) {
        errors.push(`${at}: name must be lower case, unquoted and schema-qualified, got "${e.name}"`);
      }
    }
    if (typeof e.ticket !== 'string' || !/^EZD-\d+[a-z]?$/.test(e.ticket)) {
      errors.push(`${at}: ticket must be an EZD-xxx id`);
    }
    if (typeof e.reason !== 'string' || e.reason.trim() === '') {
      errors.push(`${at}: reason must be a non-empty string`);
    }
  });
  return { entries: errors.length ? [] : data.retired, errors };
}

const CONTAINER_KINDS = ['table', 'view', 'materialized_view'];
const containerOf = (columnName) => columnName.slice(0, columnName.lastIndexOf('.'));

/** True when `retired` (the base tag's entries) covers the object; a retired table, view or materialized view covers its columns. */
function isRetired(retired, item) {
  for (const e of retired) {
    if (e.kind === item.kind && e.name === item.name) return true;
    if (CONTAINER_KINDS.includes(e.kind) && item.kind === 'column' && containerOf(item.name) === e.name) return true;
  }
  return false;
}

/**
 * The base object set (Step 4, Q-0156 (a)): everything the released migrations define, keyed `kind:name`,
 * plus the containers whose every column counts. Drops and renames are not subtracted (stricter, never weaker).
 */
function baseObjectSet(released) {
  const keys = new Set();
  const allColumns = new Set();
  for (const name of Object.keys(released).sort()) {
    for (const stmt of splitStatements(released[name])) {
      for (const d of findDefined(stmt)) {
        keys.add(`${d.kind}:${d.name}`);
        if (d.allColumns) allColumns.add(d.name);
      }
    }
  }
  return {
    has: (item) =>
      keys.has(`${item.kind}:${item.name}`) ||
      (item.kind === 'column' && allColumns.has(containerOf(item.name))),
  };
}

/**
 * The check (Step 4 table, M1–M4). `released` and `current` map migration file names to SQL text;
 * `retired` is the base tag's entry array. Returns { ok, notes, violations }.
 */
export function checkMigrations({ baseTag, released, retired, current }) {
  const violations = [];
  const notes = [];
  const add = (id, file, object, detail) => violations.push({ id, file, object, detail });

  // M2: released migrations are frozen.
  const releasedNames = Object.keys(released).sort();
  for (const name of releasedNames) {
    if (!(name in current)) add('M2', migrationFile(name), name, 'released migration removed');
    else if (lf(current[name]) !== lf(released[name])) {
      add('M2', migrationFile(name), name, 'released migration changed');
    }
  }

  const newest = releasedNames.map(versionOf).filter(Boolean).sort().at(-1) ?? null;
  const newNames = Object.keys(current)
    .filter((n) => !(n in released))
    .sort();
  notes.push(`${newNames.length} new migration(s) since ${baseTag}`);

  // Objects created by new migrations, in version order, by kind and name; only objects absent from the
  // base object set count (re-declaring a released object never makes it new). A created table, view or
  // materialized view covers its columns.
  const base = baseObjectSet(released);
  const created = new Set();
  const createdContainers = new Set();
  const isCreated = (item) =>
    created.has(`${item.kind}:${item.name}`) ||
    (item.kind === 'column' && createdContainers.has(containerOf(item.name)));

  for (const name of newNames) {
    const file = migrationFile(name);
    const version = versionOf(name);
    // M3: versions only go up.
    if (newest !== null && (version === null || version <= newest)) {
      add('M3', file, name, `version is not newer than the newest released migration ${newest}`);
    }
    for (const stmt of splitStatements(current[name])) {
      for (const c of findCreated(stmt)) {
        if (base.has(c)) continue;
        created.add(`${c.kind}:${c.name}`);
        if (CONTAINER_KINDS.includes(c.kind)) createdContainers.add(c.name);
      }
      // M1: drops and renames of what the base tag still reads.
      for (const d of findDestructive(stmt)) {
        if (isCreated(d) || isRetired(retired, d)) continue;
        add(
          'M1',
          file,
          d.name,
          `is dropped or renamed but ${baseTag} still reads it (retire it in ${RETIRED_FILE} and release that first)`,
        );
      }
      // M4: what the scan cannot see.
      for (const u of findUnverifiable(stmt)) {
        add(
          'M4',
          file,
          name,
          u.reason === 'cascade'
            ? 'cannot be checked: drop with cascade'
            : 'cannot be checked: drop or rename inside a string or function body',
        );
      }
    }
  }

  return { ok: violations.length === 0, notes, violations };
}

// ---------------------------------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { root: process.cwd(), base: null, head: null, fetch: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = path.resolve(argv[++i] ?? '.');
    else if (a === '--base') opts.base = argv[++i] ?? null;
    else if (a === '--head') opts.head = argv[++i] ?? null;
    else if (a === '--no-fetch') opts.fetch = false;
    else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

const HEAD_SHA_RE = /^[0-9a-f]{7,40}$/;

/** Step 4 Ref validation (Q-0156 (a)): `--base` and `--head` are checked before any git process starts. */
function invalidRef(argv, opts) {
  if (argv.includes('--base') && (opts.base === null || !RELEASE_TAG_RE.test(opts.base))) {
    return 'invalid_ref: --base must be a release tag (phase-N or phase-N.k)';
  }
  if (argv.includes('--head') && (opts.head === null || !(RELEASE_TAG_RE.test(opts.head) || HEAD_SHA_RE.test(opts.head)))) {
    return 'invalid_ref: --head must be a release tag or a commit sha (7 to 40 lower-case hex characters)';
  }
  return null;
}

function makeGit(root) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  return (args, { timeout } = {}) => {
    const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env, timeout });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      throw new Error(`git ${args.join(' ')} exited ${r.status}: ${(r.stderr ?? '').trim()}`);
    }
    return r.stdout ?? '';
  };
}

/** Migrations and retired.json at a git ref: { migrations: Record<name, text>, retired: string | null }. */
function readRef(git, ref) {
  const listing = git(['ls-tree', '--name-only', ref, `${MIGRATIONS_DIR}/`]);
  const migrations = {};
  for (const line of listing.split('\n')) {
    const name = path.posix.basename(line.trim());
    if (!name.endsWith('.sql')) continue;
    migrations[name] = git(['show', `${ref}:${MIGRATIONS_DIR}/${name}`]);
  }
  let retired = null;
  try {
    retired = git(['show', `${ref}:${RETIRED_FILE}`]);
  } catch {
    retired = null;
  }
  return { migrations, retired };
}

/** Migrations and retired.json in the working tree under `root`. */
function readWorkingTree(root) {
  const dir = path.join(root, MIGRATIONS_DIR);
  const migrations = {};
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
      migrations[name] = readFileSync(path.join(dir, name), 'utf8');
    }
  }
  const retiredPath = path.join(root, RETIRED_FILE);
  const retired = existsSync(retiredPath) ? readFileSync(retiredPath, 'utf8') : null;
  return { migrations, retired };
}

/** Fetches `phase-*` tags from origin; returns true on success. Never pushes, never prompts, 30 s timeout. */
function fetchTags(git) {
  try {
    const shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true';
    const args = ['fetch', '--no-tags'];
    if (shallow) args.push('--depth=1');
    args.push('origin', '+refs/tags/phase-*:refs/tags/phase-*');
    git(args, { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

function printViolations(out, violations) {
  for (const v of violations) out(`[${v.id}] ${v.file}: ${v.object} ${v.detail}`);
}

export function main(argv, out = (line) => process.stdout.write(`${line}\n`)) {
  const opts = parseArgs(argv);
  const invalid = invalidRef(argv, opts);
  if (invalid) {
    out(invalid);
    return 1;
  }
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  const git = makeGit(opts.root);

  if (inActions || opts.fetch) {
    if (!fetchTags(git)) {
      if (inActions) {
        out('[M0] origin: release tags could not be fetched');
        out('migration check failed: 1 violation(s)');
        return 1;
      }
      out('tags_not_fetched: could not fetch release tags from origin; checking against local tags');
    }
  } else {
    out('tags_not_fetched (--no-fetch)');
  }

  const head = opts.head ? readRef(git, opts.head) : readWorkingTree(opts.root);
  const headRetired = validateRetired(head.retired);
  const m5 = headRetired.errors.map((e) => ({ id: 'M5', file: RETIRED_FILE, object: '', detail: e }));

  const baseTag = opts.base ?? previousReleaseTag(listReleaseTags(git));
  if (baseTag === null) {
    out('no release tag yet: nothing is released');
    printViolations(out, m5);
    if (m5.length) {
      out(`migration check failed: ${m5.length} violation(s)`);
      return 1;
    }
    out('migration check passed (no release tag: supabase/retired.json only)');
    return 0;
  }

  const base = readRef(git, baseTag);
  const baseRetired = validateRetired(base.retired);
  const result = checkMigrations({
    baseTag,
    released: base.migrations,
    retired: base.retired === null ? [] : baseRetired.entries,
    current: head.migrations,
  });
  const violations = [...result.violations, ...m5];
  for (const n of result.notes) out(n);
  printViolations(out, violations);
  if (violations.length) {
    out(`migration check failed against ${baseTag}: ${violations.length} violation(s)`);
    return 1;
  }
  out(`migration check passed against ${baseTag}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let code;
  try {
    code = main(process.argv.slice(2));
  } catch (err) {
    process.stdout.write(`migration check error: ${err instanceof Error ? err.message : String(err)}\n`);
    code = 1;
  }
  process.exit(code);
}
