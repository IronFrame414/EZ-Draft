// EZD-025 Step 8 (vault/plans/EZD-025.md): helpers for the tests that use the local Supabase stack.
// Node 22 built-ins only: SQL goes through `docker exec -i supabase_db_<project> psql` (the way
// scripts/db/sql.mjs reaches the main stack), Storage and Auth through their HTTP APIs with the local secret
// key. Nothing here leaves 127.0.0.1 (CLAUDE.md rule 6; the EZD-021 net guard).
//
// Deviation from the plan's wording, structural only: the plan lists postgres.js for `adminSql`; the root
// package.json has no `postgres` dependency yet, so this helper uses psql in the container instead.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SUPABASE_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'supabase');
export const MAIN_DB_CONTAINER = 'supabase_db_ezdraft';
export const SCRATCH_DB_CONTAINER = 'supabase_db_ezdraft-restore';

/** True when the file's tests belong to the run scope (plan Step 8 scope guard; Q-0006). */
export function inScope(ticket = 'EZD-025') {
  const grep = process.env.EZD_TEST_GREP;
  if (grep === undefined || grep === '') return true;
  try {
    return new RegExp(grep).test(ticket);
  } catch {
    return false;
  }
}

/** Environment for a spawned child: the outer test scope and test context never leak into it. */
export function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/** `supabase status -o json` of a stack: { apiUrl, secretKey }. `workdir` selects the scratch stack. */
export function stackStatus(workdir) {
  const args = ['status', '-o', 'json', ...(workdir ? ['--workdir', workdir] : [])];
  const r = spawnSync(SUPABASE_BIN, args, { cwd: REPO_ROOT, encoding: 'utf8', env: childEnv() });
  if (r.status !== 0) throw new Error(`supabase status failed (exit ${r.status})`);
  const json = JSON.parse(r.stdout.trim());
  return {
    apiUrl: json.API_URL,
    secretKey: json.SECRET_KEY || json.SERVICE_ROLE_KEY,
    dbUrl: json.DB_URL,
  };
}

/** Runs SQL (as `postgres`, or `supabase_admin` for storage.objects DDL) in a stack's database container; returns trimmed stdout. Throws on a SQL error. */
export function exec(sqlText, container = MAIN_DB_CONTAINER, user = 'postgres') {
  const r = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'],
    { input: sqlText, encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`psql failed in ${container}: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

/**
 * Runs SQL that deletes from storage.* tables. Storage's own trigger storage.protect_delete refuses a direct
 * delete unless `storage.allow_delete_query` is 'true' in the session, so with it set only a trigger of ours can
 * refuse the delete (T9 (e)).
 */
export function execStorageDelete(sqlText, container = MAIN_DB_CONTAINER, user = 'postgres') {
  return exec(`begin;\nset local storage.allow_delete_query = 'true';\n${sqlText}\ncommit;`, container, user);
}

/** Rows of a select as an array of objects. */
export function query(selectSql, container = MAIN_DB_CONTAINER) {
  const out = exec(`select coalesce(json_agg(q), '[]'::json) from (${selectSql}) q;`, container);
  return JSON.parse(out);
}

const authHeaders = (key) => ({ apikey: key, authorization: `Bearer ${key}` });
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

/** Storage and Auth calls against one stack with its secret key. */
export function storageApi({ apiUrl, secretKey }) {
  const call = async (method, route, { json, body, headers } = {}) => {
    const res = await fetch(`${apiUrl}${route}`, {
      method,
      headers: {
        ...authHeaders(secretKey),
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
    return res;
  };
  return {
    async createBucket(name) {
      const res = await call('POST', '/storage/v1/bucket', { json: { id: name, name, public: false } });
      if (!res.ok && res.status !== 409 && res.status !== 400) throw new Error(`createBucket ${res.status}`);
    },
    /** Uploads bytes; resolves { status }. */
    async upload(bucket, name, bytes, { upsert = false } = {}) {
      const res = await call('POST', `/storage/v1/object/${bucket}/${encodePath(name)}`, {
        body: bytes,
        headers: { 'content-type': 'application/octet-stream', 'x-upsert': String(upsert) },
      });
      return { status: res.status };
    },
    async remove(bucket, names) {
      const res = await call('DELETE', `/storage/v1/object/${bucket}`, { json: { prefixes: names } });
      return { status: res.status };
    },
    async move(bucket, from, to) {
      const res = await call('POST', '/storage/v1/object/move', {
        json: { bucketId: bucket, sourceKey: from, destinationKey: to },
      });
      return { status: res.status };
    },
    /** Resolves a Buffer, or null when the object cannot be downloaded. */
    async download(bucket, name) {
      const res = await call('GET', `/storage/v1/object/authenticated/${bucket}/${encodePath(name)}`);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    },
    async createAuthUser(email) {
      const res = await call('POST', '/auth/v1/admin/users', { json: { email, email_confirm: true } });
      if (!res.ok) throw new Error(`auth createUser ${res.status}`);
      return (await res.json()).id;
    },
    async deleteAuthUser(id) {
      await call('DELETE', `/auth/v1/admin/users/${id}`);
    },
  };
}

const made = { buckets: [], tenants: [], authUsers: [] };

/** Creates a private bucket on the main stack and removes it (with its objects) at cleanup(). */
export async function newBucket(name) {
  await storageApi(stackStatus()).createBucket(name);
  made.buckets.push(name);
  return name;
}

/**
 * Runs `node <script> <args>` from the repo root as an async child (the stub bucket lives in this process, so
 * a blocking spawn would deadlock). Resolves { code, stdout, stderr, last } where `last` is the last stdout
 * line that parses as a JSON object, or null.
 */
export function runCli(script, args, env = {}, { timeoutMs = 600_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(REPO_ROOT, script), ...args], {
      cwd: REPO_ROOT,
      env: childEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      let last = null;
      for (const line of stdout.split('\n').reverse()) {
        try {
          const v = JSON.parse(line.trim());
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            last = v;
            break;
          }
        } catch {
          // not a JSON line
        }
      }
      resolve({ code, stdout, stderr, last });
    });
  });
}

/** The env a backup CLI reads for a stub bucket (plan Step 4 `loadBackupConfig` names). */
export function stubEnv(stub, { secret = 'stub-secret-EZD025' } = {}) {
  return {
    BACKUP_S3_ENDPOINT: stub.endpoint,
    BACKUP_S3_REGION: 'us-east-1',
    BACKUP_S3_BUCKET: stub.bucket,
    BACKUP_S3_ACCESS_KEY_ID: 'stub-key-id',
    BACKUP_S3_SECRET_ACCESS_KEY: secret,
    GITHUB_ACTIONS: '',
  };
}

/**
 * Plan Step 8: a tenant `EZD-025 test <suffix>`, a project `EZD-025 drill <suffix>` (address 'y', type
 * 'kitchen'), an Auth user `ezd025-<suffix>@example.com` with app_user and membership, and a private bucket
 * `ezd025-<suffix>`. Returns ids and the names.
 */
export async function createDrillData({ suffix = randomUUID().slice(0, 8) } = {}) {
  const local = stackStatus();
  const api = storageApi(local);
  const email = `ezd025-${suffix}@example.com`;
  const bucket = `ezd025-${suffix}`;
  const tenantId = exec(
    `insert into public.tenant (name) values ('EZD-025 test ${suffix}') returning id;`,
  ).split('\n')[0];
  made.tenants.push(tenantId);
  const projectId = exec(
    `insert into public.project (tenant_id, name, address, type)
     values ('${tenantId}', 'EZD-025 drill ${suffix}', 'y', 'kitchen') returning id;`,
  ).split('\n')[0];
  // The sign-up hook refuses an unknown email, so the app_user and an active membership come first.
  const appUserId = exec(`insert into public.app_user (email) values ('${email}') returning id;`).split('\n')[0];
  exec(
    `insert into public.membership (tenant_id, user_id, status, scope)
     values ('${tenantId}', '${appUserId}', 'active', 'all');`,
  );
  const authUserId = await api.createAuthUser(email);
  made.authUsers.push(authUserId);
  exec(`update public.app_user set auth_user_id = '${authUserId}' where id = '${appUserId}';`);
  await api.createBucket(bucket);
  made.buckets.push(bucket);
  return { suffix, email, bucket, tenantId, projectId, appUserId, authUserId, api, local };
}

/** Removes what createDrillData made (rows, objects, buckets, Auth users) from the main stack. */
export async function cleanup() {
  const local = stackStatus();
  const api = storageApi(local);
  for (const bucket of made.buckets.splice(0)) {
    execStorageDelete(`delete from storage.objects where bucket_id = '${bucket}';`);
    execStorageDelete(`delete from storage.buckets where id = '${bucket}';`);
  }
  exec(
    `do $$ begin if to_regclass('public.backup_run') is not null then
       delete from public.backup_run where scope like 'buckets:ezd025-%'; end if; end $$;`,
  );
  for (const tenantId of made.tenants.splice(0)) {
    exec(`delete from public.membership where tenant_id = '${tenantId}';`);
    exec(`delete from public.project where tenant_id = '${tenantId}';`);
    exec(`delete from public.app_user where email like 'ezd025-%@example.com' and id not in (select user_id from public.membership);`);
    exec(`delete from public.tenant where id = '${tenantId}';`);
  }
  for (const id of made.authUsers.splice(0)) await api.deleteAuthUser(id);
}

/**
 * Real store (over the stub bucket) and real source (over the local stack) for tests that call the run functions
 * directly (plan Interface contract: `createS3Store(s3)`, `createSource({ dbUrl, supabaseUrl, secretKey })`).
 * `close()` ends the source's connection.
 */
export async function realDeps(stub) {
  const { createS3Store } = await import('../s3-store.mjs');
  const { createSource } = await import('../source.mjs');
  const local = stackStatus();
  const store = createS3Store({
    endpoint: stub.endpoint,
    region: 'us-east-1',
    bucket: stub.bucket,
    accessKeyId: 'stub-key-id',
    secretAccessKey: 'stub-secret-EZD025',
  });
  const source = createSource({ dbUrl: local.dbUrl, supabaseUrl: local.apiUrl, secretKey: local.secretKey });
  return { store, source, local, close: () => source.close() };
}

/** The largest 14-digit migration version in supabase/migrations (computed, never typed). */
export function newestMigrationVersion() {
  return readdirSync(path.join(REPO_ROOT, 'supabase', 'migrations'))
    .map((f) => /^(\d{14})_/.exec(f)?.[1])
    .filter(Boolean)
    .sort()
    .at(-1);
}
