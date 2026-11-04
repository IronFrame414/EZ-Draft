// EZD-025 Step 5 (vault/plans/EZD-025.md; Interface contract): the scratch Supabase stack the restore builds.
// The schema comes from the repo's migrations up to the dump's version (so `supabase_migrations` and Step 2's
// trigger come from the repo, not from the dump); `data.sql` is then loaded as `supabase_admin` (the stack's
// superuser: `postgres` may not set `session_replication_role` or disable a trigger on `storage.objects`), and
// the off-site files are uploaded through scratch Storage. Child output is captured, never printed here.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { childEnv, runChild } from '../release/dump.mjs';
import { pickRestoreVersions } from './pick.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SCRATCH_CONFIG = path.join(HERE, 'scratch', 'supabase', 'config.toml');
const SUPABASE_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'supabase');
/** `supabase_db_<project_id>` (the name form of scripts/db/sql.mjs). */
export const SCRATCH_DB_CONTAINER = 'supabase_db_ezdraft-restore';
/** Containers the scratch stack does not start (pinned CLI 2.121.0 `supabase start --exclude` names). */
export const SCRATCH_EXCLUDE = Object.freeze([
  'studio',
  'mailpit',
  'logflare',
  'vector',
  'edge-runtime',
  'imgproxy',
  'postgres-meta',
  'supavisor',
]);
const MIGRATION_RE = /^(\d{14})_[a-z0-9_]+\.sql$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const failure = (code, r) => Object.assign(new Error(code), { code, stderr: r?.stderr ?? '' });

/** A temporary workdir with the scratch config and every migration whose version is ≤ the dump's. */
export async function prepareWorkdir({ newestMigration, repoRoot = REPO_ROOT }) {
  const dir = path.join(repoRoot, 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => MIGRATION_RE.test(f));
  const versions = files.map((f) => MIGRATION_RE.exec(f)[1]);
  if (typeof newestMigration !== 'string' || !versions.includes(newestMigration)) {
    throw Object.assign(new Error('repo_older_than_dump'), { code: 'repo_older_than_dump' });
  }
  const workdir = mkdtempSync(path.join(os.tmpdir(), 'ezd025-scratch-'));
  mkdirSync(path.join(workdir, 'supabase', 'migrations'), { recursive: true });
  copyFileSync(SCRATCH_CONFIG, path.join(workdir, 'supabase', 'config.toml'));
  for (const f of files) {
    if (MIGRATION_RE.exec(f)[1] <= newestMigration) {
      copyFileSync(path.join(dir, f), path.join(workdir, 'supabase', 'migrations', f));
    }
  }
  return workdir;
}

const cli = (args, workdir) => runChild(SUPABASE_BIN, [...args, '--workdir', workdir], { cwd: workdir, env: childEnv(process.env) });

/** Stops any leftover scratch stack (no volume reused), starts a fresh one and reads its status. */
export async function startScratch(workdir) {
  await cli(['stop', '--no-backup'], workdir);
  const started = await cli(['start', '--exclude', SCRATCH_EXCLUDE.join(',')], workdir);
  if (started.code !== 0) throw failure('scratch_start_failed', started);
  const status = await cli(['status', '-o', 'json'], workdir);
  if (status.code !== 0) throw failure('scratch_start_failed', status);
  const json = JSON.parse(status.stdout.trim());
  return {
    apiUrl: json.API_URL,
    dbUrl: json.DB_URL,
    secretKey: json.SECRET_KEY || json.SERVICE_ROLE_KEY,
    dbContainer: SCRATCH_DB_CONTAINER,
  };
}

/**
 * The `docker exec` arguments of the scratch psql (EZD-152 Step 2b). `VERBOSITY=terse` makes psql write only
 * `SEVERITY:  message` lines, never a DETAIL, HINT, QUERY, CONTEXT or LINE n field that could quote a client row.
 */
export function scratchPsqlArgs(container, { user = 'postgres', extra = [] } = {}) {
  return [
    'exec',
    '-i',
    container,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=terse',
    ...extra,
    '-U',
    user,
    '-d',
    'postgres',
    '-X',
    '-q',
    '-t',
    '-A',
  ];
}

/** psql in the scratch database container; resolves stdout, rejects with `code` on a SQL error. */
async function psql(scratch, input, { user = 'postgres', code = 'scratch_sql_failed', extra = [] } = {}) {
  const r = await runChild('docker', scratchPsqlArgs(scratch.dbContainer, { user, extra }), { input });
  if (r.code !== 0) throw failure(code, r);
  return r.stdout.trim();
}

const TABLE_RE = /^(?:COPY|INSERT INTO)\s+((?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)\.(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*))[\s(]/;

/** Every table a COPY or INSERT line of `data.sql` names, in first-seen order. */
export function dumpTables(text) {
  const seen = new Set();
  for (const line of text.split('\n')) {
    const m = TABLE_RE.exec(line);
    if (m) seen.add(m[1]);
  }
  return [...seen];
}

/** Loads `data.sql` in one transaction with triggers off; rows the migrations inserted are replaced. */
export async function loadData(scratch, dataSqlPath) {
  const data = readFileSync(dataSqlPath, 'utf8');
  const tables = dumpTables(data);
  const head = ['SET session_replication_role = replica;'];
  if (tables.length > 0) head.push(`TRUNCATE ${tables.join(', ')} CASCADE;`);
  await psql(scratch, `${head.join('\n')}\n${data}`, {
    user: 'supabase_admin',
    code: 'data_load_failed',
    extra: ['--single-transaction'],
  });
}

const setTrigger = (scratch, state) =>
  psql(scratch, `alter table storage.objects ${state} trigger sent_files_soft_delete;`, { user: 'supabase_admin' });

const scratchStorage = (scratch) =>
  createClient(scratch.apiUrl, scratch.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage;

/** Uploads one version per off-site key under `files/` (`pickRestoreVersions`) into scratch Storage. */
export async function uploadFiles(scratch, store, tmpDir = os.tmpdir()) {
  const storage = scratchStorage(scratch);
  const tmp = mkdtempSync(path.join(tmpDir, 'ezd025-upload-'));
  let filesRestored = 0;
  await setTrigger(scratch, 'disable');
  try {
    const picks = pickRestoreVersions(await store.listVersions('files/'));
    const buckets = new Set();
    let n = 0;
    for (const [key, entry] of Object.entries(picks).sort(([a], [b]) => (a < b ? -1 : 1))) {
      const rest = key.slice('files/'.length);
      const slash = rest.indexOf('/');
      if (slash <= 0) continue;
      const bucket = rest.slice(0, slash);
      const name = rest.slice(slash + 1);
      if (!buckets.has(bucket)) {
        const { data } = await storage.getBucket(bucket);
        if (!data) {
          const { error } = await storage.createBucket(bucket, { public: false });
          if (error) throw failure('files_restore_failed');
        }
        buckets.add(bucket);
      }
      const file = path.join(tmp, `${(n += 1)}`);
      const { contentType } = (await store.getToFile(key, file, { versionId: entry.versionId })) ?? {};
      const { error } = await storage
        .from(bucket)
        .upload(name, readFileSync(file), { upsert: true, contentType: contentType ?? 'application/octet-stream' });
      if (error) throw failure('files_restore_failed');
      filesRestored += 1;
    }
  } finally {
    await setTrigger(scratch, 'enable');
    rmSync(tmp, { recursive: true, force: true });
  }
  return { filesRestored };
}

export async function stopScratch(workdir) {
  await cli(['stop', '--no-backup'], workdir);
}

/** The restore's checks against the scratch stack (and the off-site copy for `offsiteSha256`). */
export function scratchQueries(scratch, store) {
  const storage = scratchStorage(scratch);
  const uuid = (id) => {
    if (!UUID_RE.test(id)) throw new Error('not a uuid');
    return id.toLowerCase();
  };
  return {
    async maxMigration() {
      return psql(scratch, 'select max(version) from supabase_migrations.schema_migrations;');
    },
    async triggerEnabled() {
      const v = await psql(scratch, "select tgenabled from pg_trigger where tgname = 'sent_files_soft_delete';");
      return v === 'O';
    },
    async projectExists(id) {
      return (await psql(scratch, `select count(*) from public.project where id = '${uuid(id)}';`)) === '1';
    },
    async objectsFor(projectId) {
      const out = await psql(
        scratch,
        `select coalesce(json_agg(json_build_object('bucket', o.bucket_id, 'name', o.name) order by o.bucket_id, o.name), '[]')
         from storage.objects o join public.project p on p.id = '${uuid(projectId)}'
         where starts_with(o.name, p.tenant_id::text || '/' || p.id::text || '/');`,
      );
      return JSON.parse(out);
    },
    async sha256Of(bucket, name) {
      const { data, error } = await storage.from(bucket).download(name);
      if (error || !data) return null;
      return createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex');
    },
    async offsiteSha256(bucket, name) {
      const h = await store.head(`files/${bucket}/${name}`);
      return h?.meta?.sha256 ?? null;
    },
  };
}
