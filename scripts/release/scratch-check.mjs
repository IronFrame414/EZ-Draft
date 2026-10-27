// EZD-153 (vault/plans/EZD-153.md section 1, contract S1-S13; Q-0334 (b)): the scratch database step of the
// migration check. Node 22 built-ins plus the scripts/db lock. A scratch Supabase stack (`ezdraft-migcheck`) is
// built from the base tag's migrations, every service but Postgres is stopped, and the new migrations are applied
// one file at a time with `supabase migration up --local`; the catalog is read before and after each. Identity is
// the object id, so a rename, a move and a drop-and-recreate all show. M1 = a base object dropped or renamed
// unless retired; M4 = a created object whose create statement the scan does not find, or a migration that fails.
// Children get only SCRATCH_ENV_NAMES; their output is captured, never printed here.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTypesLock } from '../db/gen-types.mjs';
import { sharedTempDir } from '../db/stack-config.mjs';
import { findCreated, OBJECT_KINDS, splitStatements } from './sql-scan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

export const SCRATCH_PROJECT_ID = 'ezdraft-migcheck';
/** `supabase_db_<project_id>` (the name form of scripts/db/sql.mjs). */
export const SCRATCH_DB_CONTAINER = 'supabase_db_ezdraft-migcheck';
export const SCRATCH_CONFIG_PATH = path.join(HERE, 'scratch', 'supabase', 'config.toml');
/** The 8 names of scripts/backup/scratch.mjs SCRATCH_EXCLUDE, written out (not imported). */
export const MIGCHECK_EXCLUDE = Object.freeze([
  'studio',
  'mailpit',
  'logflare',
  'vector',
  'edge-runtime',
  'imgproxy',
  'postgres-meta',
  'supavisor',
]);
export const SCRATCH_LOCK_WAIT_MS = 600000;
/** The only environment names a scratch child gets (the release step holds its secrets in process.env). */
export const SCRATCH_ENV_NAMES = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'DOCKER_CERT_PATH',
  'DOCKER_TLS_VERIFY',
  'XDG_CONFIG_HOME',
  'XDG_RUNTIME_DIR',
]);

export const SNAPSHOT_SQL = `with sch as (
  select oid, nspname from pg_namespace
  where nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
    and nspname !~ '^pg_(toast_)?temp_'
), skip as (
  select classid, objid from pg_depend where deptype in ('e', 'i')
), rel as (
  select c.oid, c.relkind, s.nspname, c.relname from pg_class c join sch s on s.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'f', 'v', 'm', 'S')
    and not exists (select 1 from skip k where k.classid = 'pg_class'::regclass and k.objid = c.oid)
), obj as (
  select 'schema' as kind, s.nspname as name, 'n' || s.oid as id, '' as owned_by from sch s
    where not exists (select 1 from skip k where k.classid = 'pg_namespace'::regclass and k.objid = s.oid)
  union all
  select case r.relkind when 'v' then 'view' when 'm' then 'materialized_view' when 'S' then 'sequence' else 'table' end,
    r.nspname || '.' || r.relname, 'c' || r.oid,
    coalesce((select tr.nspname || '.' || tr.relname || '.' || a.attname from pg_depend d
      join rel tr on tr.oid = d.refobjid
      join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
      where r.relkind = 'S' and d.classid = 'pg_class'::regclass and d.objid = r.oid
        and d.refclassid = 'pg_class'::regclass and d.deptype = 'a' limit 1), '')
    from rel r
  union all
  select 'column', r.nspname || '.' || r.relname || '.' || a.attname, 'c' || r.oid || ':' || a.attnum, ''
    from rel r join pg_attribute a on a.attrelid = r.oid
    where r.relkind <> 'S' and a.attnum > 0 and not a.attisdropped
  union all
  select case p.prokind when 'p' then 'procedure' else 'function' end, s.nspname || '.' || p.proname, 'p' || p.oid, ''
    from pg_proc p join sch s on s.oid = p.pronamespace
    where not exists (select 1 from skip k where k.classid = 'pg_proc'::regclass and k.objid = p.oid)
  union all
  select case t.typtype when 'd' then 'domain' else 'type' end, s.nspname || '.' || t.typname, 't' || t.oid, ''
    from pg_type t join sch s on s.oid = t.typnamespace
    where t.typtype in ('b', 'c', 'd', 'e', 'r', 'm')
      and not exists (select 1 from skip k where k.classid = 'pg_type'::regclass and k.objid = t.oid)
  union all
  select 'extension', 'public.' || x.extname, 'x' || x.oid, '' from pg_extension x
)
select coalesce(json_agg(json_build_object('kind', kind, 'name', name, 'id', id, 'ownedBy', owned_by) order by id), '[]') from obj;`;

const SNAPSHOT_KINDS = [...OBJECT_KINDS, 'column'];
const CONTAINER_KINDS = ['table', 'view', 'materialized_view'];
const MIGRATIONS_DIR = 'supabase/migrations';
const migrationFile = (name) => `${MIGRATIONS_DIR}/${name}`;
const relationOf = (columnName) => columnName.slice(0, columnName.lastIndexOf('.'));
const relationIdOf = (columnId) => columnId.slice(0, columnId.indexOf(':'));

/** The `docker exec` arguments of the snapshot psql (backup `scratchPsqlArgs` with user `postgres`). */
export function snapshotPsqlArgs() {
  return [
    'exec',
    '-i',
    SCRATCH_DB_CONTAINER,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=terse',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-X',
    '-q',
    '-t',
    '-A',
  ];
}

/** The allow-listed environment of a scratch child; undefined values are dropped. */
export function scratchEnv(env) {
  const out = {};
  for (const name of SCRATCH_ENV_NAMES) {
    if (env[name] !== undefined) out[name] = env[name];
  }
  return out;
}

/** The snapshot JSON as entries; throws `snapshot_unreadable` on anything else. */
export function parseSnapshot(text) {
  const unreadable = () => new Error('snapshot_unreadable');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw unreadable();
  }
  if (!Array.isArray(data)) throw unreadable();
  const ids = new Set();
  return data.map((x) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw unreadable();
    const { kind, name, id, ownedBy } = x;
    if (![kind, name, id, ownedBy].every((v) => typeof v === 'string')) throw unreadable();
    if (!SNAPSHOT_KINDS.includes(kind)) throw unreadable();
    if (ids.has(id)) throw unreadable();
    ids.add(id);
    return { kind, name, id, ownedBy };
  });
}

/** `<kind>:<name>` of every object the scan finds created in this one file. */
export function scanCreatedKeys(sql) {
  const keys = new Set();
  for (const stmt of splitStatements(sql)) {
    for (const c of findCreated(stmt)) keys.add(`${c.kind}:${c.name}`);
  }
  return keys;
}

/** M1 and M4 of one applied file (section 1 compareStep rules). */
export function compareStep({ file, base, before, after, scanned, isRetired, baseTag }) {
  const at = migrationFile(file);
  const beforeById = new Map(before.map((x) => [x.id, x]));
  const afterById = new Map(after.map((x) => [x.id, x]));

  // M1: a base object present under its base name before this step and not after it.
  const candidates = [];
  for (const [id, b] of base) {
    if (beforeById.get(id)?.name !== b.name) continue;
    if (afterById.get(id)?.name === b.name) continue;
    if (isRetired({ kind: b.kind, name: b.name })) continue;
    candidates.push({ id, b });
  }
  const reported = new Set(candidates.map((c) => c.id));
  const m1 = candidates
    .filter(({ id, b }) => !(b.kind === 'column' && reported.has(relationIdOf(id))))
    .map(({ b }) => ({
      id: 'M1',
      file: at,
      object: b.name,
      detail: `${b.kind} is dropped or renamed on the scratch database but ${baseTag} still reads it (retire it in supabase/retired.json and release that first)`,
    }));

  // M4: an object new in this step whose create statement the scan did not find.
  const columnCovered = (name, id) =>
    scanned.has(`column:${name}`) ||
    CONTAINER_KINDS.some((k) => scanned.has(`${k}:${relationOf(name)}`)) ||
    (id !== null && !beforeById.has(relationIdOf(id)));
  const beforeColumnNames = new Set(before.filter((x) => x.kind === 'column').map((x) => x.name));
  const covered = (a) => {
    if (scanned.has(`${a.kind}:${a.name}`)) return true;
    if (a.kind === 'column') return columnCovered(a.name, a.id);
    if (a.kind === 'sequence' && a.ownedBy !== '') {
      if (beforeColumnNames.has(a.ownedBy)) return true;
      const col = after.find((x) => x.kind === 'column' && x.name === a.ownedBy && !beforeById.has(x.id));
      return columnCovered(a.ownedBy, col ? col.id : null);
    }
    return false;
  };
  const m4 = after
    .filter((a) => !beforeById.has(a.id) && !covered(a))
    .map((a) => ({
      id: 'M4',
      file: at,
      object: a.name,
      detail: `cannot be checked: the scratch database created this ${a.kind} but the scan did not find its create statement in this migration`,
    }));

  return [...m1, ...m4];
}

/** The production dependencies (contract S13). */
export function defaultScratchDeps() {
  return {
    run(command, args, { cwd, input, timeoutMs, env }) {
      const r = spawnSync(command, args, {
        cwd,
        input,
        env,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
      });
      return { status: r.error ? null : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
    lock: (fn) =>
      withTypesLock(fn, {
        lockDir: path.join(sharedTempDir(REPO_ROOT), 'ezd-migcheck.lock'),
        waitMs: SCRATCH_LOCK_WAIT_MS,
      }),
    tmpRoot: os.tmpdir(),
    env: process.env,
    supabaseBin: path.join(REPO_ROOT, 'node_modules', '.bin', 'supabase'),
  };
}

/** Lines the CLI adds after a failed start (the rerun hint, the update notice); never the note's line. */
const START_NOISE = ['Try rerunning the command', 'A new version of Supabase CLI', 'We recommend updating'];

/** The last non-empty stderr line of a failed start that is not CLI noise, or `(no stderr)`. */
const startErrorLine = (text) =>
  text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '' && !START_NOISE.some((p) => l.trimStart().startsWith(p)))
    .at(-1) ?? '(no stderr)';

/** The first line of `error.message` in the CLI's JSON stdout, or null. */
function cliErrorLine(stdout) {
  try {
    const message = JSON.parse(stdout.trim())?.error?.message;
    if (typeof message !== 'string') return null;
    const first = message.split('\n')[0].trim();
    return first === '' ? null : first;
  } catch {
    return null;
  }
}

/** The basenames of `applied` in the CLI's JSON stdout, or null. */
function appliedNames(stdout) {
  try {
    const applied = JSON.parse(stdout.trim())?.applied;
    if (!Array.isArray(applied) || !applied.every((p) => typeof p === 'string')) return null;
    return applied.map((p) => path.basename(p));
  } catch {
    return null;
  }
}

/** Builds the scratch, applies the new files one at a time and compares the catalog (section 1 steps 1-9). */
export function runScratchCheck(input, deps = defaultScratchDeps()) {
  const locked = deps.lock(() => scratchBody(input, deps));
  if (!locked.ok) return { violations: [], notes: [], failure: 'scratch_db_lock_timeout' };
  return locked.value;
}

function scratchBody(input, deps) {
  const env = scratchEnv(deps.env);
  const run = (command, args, opts) => deps.run(command, args, { ...opts, env });
  const bin = deps.supabaseBin;
  const violations = [];
  const notes = [];

  const w = mkdtempSync(path.join(deps.tmpRoot, 'ezd-migcheck-'));
  const migrationsDir = path.join(w, 'supabase', 'migrations');
  const snapshot = () => {
    try {
      const r = run('docker', snapshotPsqlArgs(), { input: SNAPSHOT_SQL, timeoutMs: 120000 });
      if (r.status !== 0) return null;
      return parseSnapshot(r.stdout);
    } catch {
      return null;
    }
  };

  const steps = () => {
    mkdirSync(migrationsDir, { recursive: true });
    copyFileSync(SCRATCH_CONFIG_PATH, path.join(w, 'supabase', 'config.toml'));
    for (const [name, text] of Object.entries(input.released)) writeFileSync(path.join(migrationsDir, name), text);

    run(bin, ['stop', '--no-backup', '--workdir', w], { cwd: w, timeoutMs: 120000 });
    const started = run(bin, ['start', '--exclude', MIGCHECK_EXCLUDE.join(','), '--workdir', w], {
      cwd: w,
      timeoutMs: 600000,
    });
    if (started.status !== 0) {
      notes.push(`scratch start: ${startErrorLine(started.stderr)}`);
      return 'scratch_start_failed';
    }

    const ps = run('docker', ['ps', '--format', '{{.Names}}'], { timeoutMs: 120000 });
    if (ps.status !== 0) return 'scratch_start_failed';
    const names = ps.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith(`_${SCRATCH_PROJECT_ID}`));
    if (!names.includes(SCRATCH_DB_CONTAINER)) return 'scratch_start_failed';
    for (const name of names) {
      if (name === SCRATCH_DB_CONTAINER) continue;
      if (run('docker', ['stop', name], { timeoutMs: 120000 }).status !== 0) return 'scratch_services_stop_failed';
    }

    const s0 = snapshot();
    if (s0 === null) return 'scratch_snapshot_failed';
    const base = new Map(s0.map((x) => [x.id, x]));
    let before = s0;

    const newNames = Object.keys(input.newFiles).sort();
    for (const name of newNames) {
      writeFileSync(path.join(migrationsDir, name), input.newFiles[name]);
      // --output-format json: without it CLI 2.121.0 prints JSON only when it detects an agent (plan step 7).
      const up = run(bin, ['migration', 'up', '--local', '--output-format', 'json', '--workdir', w], {
        cwd: w,
        timeoutMs: 300000,
      });
      if (up.status !== 0) {
        const line = cliErrorLine(up.stdout);
        violations.push({
          id: 'M4',
          file: migrationFile(name),
          object: name,
          detail: `cannot be checked: the migration failed on the scratch database${line === null ? '' : `: ${line}`}`,
        });
        return null;
      }
      const applied = appliedNames(up.stdout);
      if (applied === null || applied.length !== 1 || applied[0] !== name) {
        violations.push({
          id: 'M4',
          file: migrationFile(name),
          object: name,
          detail: 'cannot be checked: the scratch database did not apply it',
        });
        return null;
      }
      const after = snapshot();
      if (after === null) return 'scratch_snapshot_failed';
      violations.push(
        ...compareStep({
          file: name,
          base,
          before,
          after,
          scanned: scanCreatedKeys(input.newFiles[name]),
          isRetired: input.isRetired,
          baseTag: input.baseTag,
        }),
      );
      before = after;
    }
    notes.push(`scratch database: ${newNames.length} new migration(s) applied on top of ${input.baseTag}`);
    return null;
  };

  let failure;
  try {
    failure = steps();
  } finally {
    const stopped = run(bin, ['stop', '--no-backup', '--workdir', w], { cwd: w, timeoutMs: 120000 });
    if (stopped.status !== 0) notes.push('scratch_db_stop_failed');
    rmSync(w, { recursive: true, force: true });
  }
  return { violations, notes, failure };
}
