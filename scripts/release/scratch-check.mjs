// EZD-153 (vault/plans/EZD-153.md section 1, contract S1-S13; Q-0334 (b)): the scratch database step of the
// migration check. Node 22 built-ins plus the scripts/db lock. A scratch Supabase stack (`ezdraft-migcheck`) is
// built from the base tag's migrations, every service but Postgres is stopped, and the new migrations are applied
// one file at a time with `supabase migration up --local`; the catalog is read before and after each. Identity is
// the object id, so a rename, a move and a drop-and-recreate all show. M1 = a base object dropped or renamed
// unless retired; M4 = a created object whose create statement the scan does not find, or a migration that fails.
// EZD-2008: each build lane (EZD_LANE 0-4) has its own scratch stack (project id, container, ports + 100 x lane) and
// its own lock, so one lane's check never waits on another's; lane 0 is the committed config, unchanged.
// EZD-2039: with EZD_MIGCHECK_KEEP=1 (set only by scratch-check-local.test.mjs) the lane's stack is started once with no
// migrations, its data folder is copied to a docker volume, and each later run copies it back instead of a new start;
// the stack is left running for stopKeptScratch. Without the name every step is as before.
// Children get only SCRATCH_ENV_NAMES; their output is captured and printed only as failure notes (cliFailureNotes, EZD-259): URL passwords redacted, at most CLI_NOTE_MAX_LINES lines per source.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTypesLock } from '../db/gen-types.mjs';
import { laneAppPorts, laneProjectId, stackContainer, STACK_PORT_STEP } from '../db/lane.mjs';
import { sharedTempDir } from '../db/stack-config.mjs';
import { redactUrl } from './redact.mjs';
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
/** EZD-2008 (AC-EZD-2008-1): the scratch stack has lanes 0-4. */
export const SCRATCH_MAX_LANE = 4;

/** 0-4 from EZD_LANE (unset or '' is 0); anything else is null. */
export function scratchLane(env) {
  const v = env.EZD_LANE;
  if (v === undefined || v === '') return 0;
  return /^[0-4]$/.test(v) ? Number(v) : null;
}

/** The scratch project of a lane: lane 0 is SCRATCH_PROJECT_ID, lane n adds -lane<n>. */
export function scratchProjectId(lane) {
  return laneProjectId(SCRATCH_PROJECT_ID, lane);
}

/** The scratch database container of a lane: lane 0 is SCRATCH_DB_CONTAINER. */
export function scratchDbContainer(lane) {
  return stackContainer('db', SCRATCH_PROJECT_ID, lane);
}

/** A lane's scratch config: project id, every port (+ 100 x lane) and the site URL moved; lane 0 and every other line unchanged. */
export function scratchConfigToml(toml, lane) {
  if (lane === 0) return toml;
  const web = laneAppPorts(lane).web;
  return toml
    .split('\n')
    .map((line) => {
      if (/^project_id\s*=\s*"[^"]+"\s*$/.test(line)) return `project_id = "${scratchProjectId(lane)}"`;
      const port = /^(\s*)([a-z_]*port)(\s*=\s*)(\d+)\s*$/.exec(line);
      if (port) return `${port[1]}${port[2]}${port[3]}${Number(port[4]) + STACK_PORT_STEP * lane}`;
      if (/^site_url\s*=\s*"http:\/\/127\.0\.0\.1:3000"\s*$/.test(line)) {
        return line.replace('127.0.0.1:3000', `127.0.0.1:${web}`);
      }
      return line;
    })
    .join('\n');
}

/** The lock folder name of a lane: one scratch run per lane, never one per machine. */
export function scratchLockName(lane) {
  return lane === 0 ? 'ezd-migcheck.lock' : `ezd-migcheck-lane${lane}.lock`;
}

/** The lock of defaultScratchDeps: `lock(fn, { lane })` holds only that lane's folder under `lockRoot`. */
export function scratchLock({ lockRoot, waitMs = SCRATCH_LOCK_WAIT_MS }) {
  return (fn, { lane = 0 } = {}) =>
    withTypesLock(fn, { lockDir: path.join(lockRoot, scratchLockName(lane)), waitMs });
}
/** EZD-2039: '1' under this name in deps.env keeps the lane's stack running between runs (tests only). */
export const SCRATCH_KEEP_ENV = 'EZD_MIGCHECK_KEEP';
export const SCRATCH_PGDATA = '/var/lib/postgresql/data';
export const PRISTINE_MOUNT = '/ezd-pristine';

/** The docker volume that holds a kept lane's data folder as it was before any migration. */
export function scratchPristineVolume(lane) {
  return `${scratchProjectId(lane)}-pristine`;
}

/** sh scripts of the helper container; $1 is the database container's id, so a copy is only used with the container it came from. */
export const PRISTINE_CAPTURE_SH = `set -e; rm -rf ${PRISTINE_MOUNT}/data ${PRISTINE_MOUNT}/complete; cp -a ${SCRATCH_PGDATA} ${PRISTINE_MOUNT}/data; printf %s "$1" > ${PRISTINE_MOUNT}/complete`;
export const PRISTINE_RESTORE_SH = `[ "$(cat ${PRISTINE_MOUNT}/complete 2>/dev/null)" = "$1" ] || exit 3; set -e; find ${SCRATCH_PGDATA} -mindepth 1 -delete; cp -a ${PRISTINE_MOUNT}/data/. ${SCRATCH_PGDATA}/`;
export const PG_READY_SH =
  'i=0; while [ $i -lt 240 ]; do pg_isready -q -h 127.0.0.1 -U postgres && exit 0; i=$((i+1)); sleep 0.25; done; exit 1';

/** `docker run` arguments of the helper: the database container's volumes plus the pristine volume, no network. */
export function pristineHelperArgs({ container, volume, image, script, id }) {
  return [
    'run',
    '--rm',
    '--network',
    'none',
    '--user',
    '0',
    '--entrypoint',
    'sh',
    '--volumes-from',
    container,
    '-v',
    `${volume}:${PRISTINE_MOUNT}`,
    image,
    '-c',
    script,
    'sh',
    id,
  ];
}

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
export function snapshotPsqlArgs(container = SCRATCH_DB_CONTAINER) {
  return [
    'exec',
    '-i',
    container,
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
    lock: scratchLock({ lockRoot: sharedTempDir(REPO_ROOT) }),
    tmpRoot: os.tmpdir(),
    env: process.env,
    supabaseBin: path.join(REPO_ROOT, 'node_modules', '.bin', 'supabase'),
  };
}

/** Lines the CLI adds after a failed start (the rerun hint, the update notice); never the note's line. */
const START_NOISE = ['Try rerunning the command', 'A new version of Supabase CLI', 'We recommend updating'];

export const CLI_NOTE_MAX_LINES = 20;
export const CLI_NOTE_MAX_CHARS = 500;

/** The note lines of a failed CLI or docker step (EZD-259 R1): a summary, the JSON error lines, the stderr lines. */
export function cliFailureNotes(step, { stdout, stderr }) {
  let errorLines = [];
  try {
    const message = JSON.parse(stdout.trim())?.error?.message;
    if (typeof message === 'string') {
      errorLines = message
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '');
    }
  } catch {
    errorLines = [];
  }
  const stderrLines = stderr
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '' && !START_NOISE.some((p) => l.trimStart().startsWith(p)));
  const clean = (line) => {
    const r = redactUrl(line);
    return r.length > CLI_NOTE_MAX_CHARS ? r.slice(0, CLI_NOTE_MAX_CHARS) : r;
  };
  const summary = errorLines[0] ?? stderrLines.at(-1) ?? '(no stderr)';
  return [
    `scratch ${step}: ${clean(summary)}`,
    ...errorLines.slice(0, CLI_NOTE_MAX_LINES).map((l) => `scratch ${step} error: ${clean(l)}`),
    ...stderrLines.slice(-CLI_NOTE_MAX_LINES).map((l) => `scratch ${step} stderr: ${clean(l)}`),
  ];
}

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
  const lane = scratchLane(deps.env);
  if (lane === null) return { violations: [], notes: [], failure: 'scratch_lane_invalid' };
  const locked = deps.lock(() => scratchBody(input, deps, lane), { lane });
  if (!locked.ok) return { violations: [], notes: [], failure: 'scratch_db_lock_timeout' };
  return locked.value;
}

function scratchBody(input, deps, lane) {
  const projectId = scratchProjectId(lane);
  const dbContainer = scratchDbContainer(lane);
  const env = scratchEnv(deps.env);
  const run = (command, args, opts) => deps.run(command, args, { ...opts, env });
  const bin = deps.supabaseBin;
  const keep = deps.env[SCRATCH_KEEP_ENV] === '1';
  const volume = scratchPristineVolume(lane);
  const violations = [];
  const notes = [];

  const w = mkdtempSync(path.join(deps.tmpRoot, 'ezd-migcheck-'));
  const migrationsDir = path.join(w, 'supabase', 'migrations');
  const snapshot = () => {
    try {
      const r = run('docker', snapshotPsqlArgs(dbContainer), { input: SNAPSHOT_SQL, timeoutMs: 120000 });
      if (r.status !== 0) return null;
      return parseSnapshot(r.stdout);
    } catch {
      return null;
    }
  };

  /** Stop before start, start, and stop every service but Postgres (steps 2-5). Returns a failure or null. */
  const startStack = () => {
    const pre = run(bin, ['stop', '--no-backup', '--workdir', w], { cwd: w, timeoutMs: 120000 });
    if (pre.status !== 0) {
      notes.push(...cliFailureNotes('stop before start', pre));
      return 'scratch_start_failed';
    }
    const started = run(bin, ['start', '--exclude', MIGCHECK_EXCLUDE.join(','), '--workdir', w], {
      cwd: w,
      timeoutMs: 600000,
    });
    if (started.status !== 0) {
      notes.push(...cliFailureNotes('start', started));
      return 'scratch_start_failed';
    }

    const ps = run('docker', ['ps', '--format', '{{.Names}}'], { timeoutMs: 120000 });
    if (ps.status !== 0) {
      notes.push(...cliFailureNotes('docker ps', ps));
      return 'scratch_start_failed';
    }
    const names = ps.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith(`_${projectId}`));
    if (!names.includes(dbContainer)) {
      notes.push(
        `scratch start: ${dbContainer} is not running; running: ${names.length > 0 ? names.join(', ') : 'none'}`,
      );
      return 'scratch_start_failed';
    }
    for (const name of names) {
      if (name === dbContainer) continue;
      const r = run('docker', ['stop', name], { timeoutMs: 120000 });
      if (r.status !== 0) {
        notes.push(...cliFailureNotes(`docker stop ${name}`, r));
        return 'scratch_services_stop_failed';
      }
    }
    return null;
  };

  /** `<id> <image> <running>` of the lane's database container, or null when there is none. */
  const inspectDb = () => {
    const r = run('docker', ['inspect', '-f', '{{.Id}} {{.Config.Image}} {{.State.Running}}', dbContainer], {
      timeoutMs: 120000,
    });
    const m = r.status === 0 ? /^(\S+) (\S+) (true|false)$/.exec(r.stdout.trim()) : null;
    return m ? { id: m[1], image: m[2], running: m[3] === 'true' } : null;
  };

  /** Stops Postgres, runs `script` in the helper over its data folder, starts it again and waits for it. Returns the failed step's result or null. */
  const swapData = (db, script) => {
    const calls = [
      ['docker stop database', ['stop', dbContainer]],
      ['pristine copy', pristineHelperArgs({ container: dbContainer, volume, image: db.image, script, id: db.id })],
      ['docker start database', ['start', dbContainer]],
      ['database ready', ['exec', dbContainer, 'sh', '-c', PG_READY_SH]],
    ];
    for (const [step, args] of calls) {
      const r = run('docker', args, { timeoutMs: 120000 });
      if (r.status !== 0) return { step, r };
    }
    return null;
  };

  /** EZD-2039 keep mode: the kept stack with its data folder put back, or a new stack whose data folder is copied first. */
  const keptStack = () => {
    const kept = inspectDb();
    if (kept !== null && kept.running && swapData(kept, PRISTINE_RESTORE_SH) === null) return null;
    const failure = startStack();
    if (failure !== null) return failure;
    const db = inspectDb();
    if (db === null) {
      notes.push(`scratch keep: ${dbContainer} cannot be inspected`);
      return 'scratch_start_failed';
    }
    const failed = swapData(db, PRISTINE_CAPTURE_SH);
    if (failed !== null) {
      notes.push(...cliFailureNotes(failed.step, failed.r));
      return 'scratch_start_failed';
    }
    return null;
  };

  const steps = () => {
    mkdirSync(migrationsDir, { recursive: true });
    writeFileSync(
      path.join(w, 'supabase', 'config.toml'),
      scratchConfigToml(readFileSync(SCRATCH_CONFIG_PATH, 'utf8'), lane),
    );
    const writeReleased = () => {
      for (const [name, text] of Object.entries(input.released)) writeFileSync(path.join(migrationsDir, name), text);
    };
    if (!keep) {
      writeReleased();
      const failure = startStack();
      if (failure !== null) return failure;
    } else {
      // The kept stack has no migrations; the released ones go on with the same command as the new ones.
      const failure = keptStack();
      if (failure !== null) return failure;
      writeReleased();
      if (Object.keys(input.released).length > 0) {
        const up = run(bin, ['migration', 'up', '--local', '--output-format', 'json', '--workdir', w], {
          cwd: w,
          timeoutMs: 300000,
        });
        if (up.status !== 0) {
          notes.push(...cliFailureNotes('released migrations', up));
          return 'scratch_start_failed';
        }
      }
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
    if (!keep) {
      const stopped = run(bin, ['stop', '--no-backup', '--workdir', w], { cwd: w, timeoutMs: 120000 });
      if (stopped.status !== 0) notes.push('scratch_db_stop_failed');
    }
    rmSync(w, { recursive: true, force: true });
  }
  return { violations, notes, failure };
}

/** EZD-2039: stops the lane's kept stack and removes its pristine volume, under the lane's lock. `{ ok, failure }`. */
export function stopKeptScratch(deps = defaultScratchDeps()) {
  const lane = scratchLane(deps.env);
  if (lane === null) return { ok: false, failure: 'scratch_lane_invalid' };
  const env = scratchEnv(deps.env);
  const locked = deps.lock(
    () => {
      const w = mkdtempSync(path.join(deps.tmpRoot, 'ezd-migcheck-'));
      try {
        mkdirSync(path.join(w, 'supabase'), { recursive: true });
        writeFileSync(
          path.join(w, 'supabase', 'config.toml'),
          scratchConfigToml(readFileSync(SCRATCH_CONFIG_PATH, 'utf8'), lane),
        );
        const stopped = deps.run(deps.supabaseBin, ['stop', '--no-backup', '--workdir', w], {
          cwd: w,
          timeoutMs: 120000,
          env,
        });
        const removed = deps.run('docker', ['volume', 'rm', '-f', scratchPristineVolume(lane)], {
          timeoutMs: 120000,
          env,
        });
        if (stopped.status !== 0) return 'scratch_db_stop_failed';
        return removed.status !== 0 ? 'scratch_pristine_remove_failed' : null;
      } finally {
        rmSync(w, { recursive: true, force: true });
      }
    },
    { lane },
  );
  if (!locked.ok) return { ok: false, failure: 'scratch_db_lock_timeout' };
  return { ok: locked.value === null, failure: locked.value };
}
