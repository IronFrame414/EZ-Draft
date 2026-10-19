// EZD-023d Step 1 (vault/plans/EZD-023d.md): child processes, the dump invocation, `dumpDatabase` and the
// Supabase CLI runner. Node 22 built-ins only. EZD-025 imports `dumpDatabase` and `AUTH_DATA_EXCLUDES`.
//
// Child output is captured, never inherited, so no raw child text reaches the log (Q-0112); children get an
// env without the release secrets, the job token or the backup key (`childEnv`).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_SECRET_NAMES } from './context.mjs';
import { buildPushInvocation } from './push.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The four auth session tables kept out of every data dump (Q-0112). */
export const AUTH_DATA_EXCLUDES = Object.freeze([
  'auth.sessions',
  'auth.refresh_tokens',
  'auth.one_time_tokens',
  'auth.flow_state',
]);

/** The pinned CLI's data-only exclusion flag (`supabase db dump --help`, 2.121.0). */
export const DUMP_EXCLUDE_FLAG = '--exclude';

/** The three dump files, in dump order (EZD-025 Step 4 uses the same names). */
export const DUMP_FILES = Object.freeze(['roles.sql', 'schema.sql', 'data.sql']);

/** A role password in `roles.sql`: the second line of defence after the CLI's `--no-role-passwords`. */
export const ROLE_PASSWORD_RE = /\bPASSWORD\s+'|SCRAM-SHA-256\$|\bmd5[0-9a-f]{32}\b/i;

const DROPPED_ENV_NAMES = Object.freeze([
  ...RELEASE_SECRET_NAMES,
  'GITHUB_TOKEN',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
]);

/**
 * Spawns `command` without a shell, writes `input` to stdin and closes it, and captures both streams as UTF-8.
 * Never rejects: a spawn error resolves `{ code: null, stdout: '', stderr: <message> }`.
 */
export function runChild(command, args, { cwd, env, input } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    let child;
    try {
      child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      done({ code: null, stdout: '', stderr: err instanceof Error ? err.message : String(err) });
      return;
    }
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => done({ code: null, stdout: '', stderr: err.message }));
    child.on('close', (code) => done({ code, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

/** A copy of `env` without the 10 release secrets, GITHUB_TOKEN and the backup key. */
export function childEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) {
    if (!DROPPED_ENV_NAMES.includes(k)) out[k] = v;
  }
  return out;
}

const DUMP_KINDS = ['roles', 'schema', 'data'];

/** The `supabase db dump` arguments for one kind (pure). */
export function buildDumpInvocation(kind, { dbUrl, local, file, exclude } = {}) {
  if (!DUMP_KINDS.includes(kind)) throw new Error('dump_kind_invalid');
  if (exclude !== undefined && kind !== 'data') throw new Error('dump_exclude_data_only');
  const args = ['db', 'dump'];
  if (local === true) args.push('--local');
  else args.push('--db-url', dbUrl);
  if (kind === 'roles') args.push('--role-only');
  if (kind === 'data') {
    args.push('--data-only', '--use-copy');
    for (const name of exclude ?? AUTH_DATA_EXCLUDES) args.push(DUMP_EXCLUDE_FLAG, name);
  }
  if (file !== undefined) args.push('--file', file);
  return { args };
}

/**
 * The pinned CLI at `<root>/node_modules/.bin/supabase` over `run`. A non-zero exit rejects with
 * `supabase db dump|push exited <code>` (no arguments, so never the URL) and `exitCode`, `stdout`, `stderr`.
 */
export function createSupabaseCli({ root = REPO_ROOT, run = runChild } = {}) {
  const command = path.join(root, 'node_modules', '.bin', 'supabase');
  const exec = async (what, args) => {
    const r = await run(command, args, { cwd: root, env: childEnv(process.env) });
    if (r.code === 0) return r.stdout;
    throw Object.assign(new Error(`supabase db ${what} exited ${r.code}`), {
      exitCode: r.code,
      stdout: r.stdout,
      stderr: r.stderr,
    });
  };
  return {
    dump: (kind, opts) => exec('dump', buildDumpInvocation(kind, opts).args),
    pushDryRun: ({ dbUrl, workdir }) => exec('push', buildPushInvocation({ dbUrl, workdir, dryRun: true }).args),
    push: ({ dbUrl, workdir, lockTimeout, statementTimeout }) =>
      exec('push', buildPushInvocation({ dbUrl, workdir, dryRun: false, lockTimeout, statementTimeout }).args),
  };
}

const dumpError = (detail, extra = {}) =>
  Object.assign(new Error(`dump_failed: ${detail}`), { code: 'dump_failed', detail, ...extra });

/**
 * Dumps roles, schema and data into `outDir`, in that order, with the auth exclusions on data only. Each file
 * must exist and be non-empty; `roles.sql` must hold no role password. Rejects `Error` with `code`
 * `dump_failed` and `detail`; the child's text is kept on `error.stderr` only.
 */
export async function dumpDatabase({ dbUrl, local, outDir, supabase = createSupabaseCli() }) {
  // The CLI opens `--file` itself and fails on a missing folder (DbDumpOpenFileError), so make it here.
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const kind of DUMP_KINDS) {
    const name = `${kind}.sql`;
    const file = path.join(outDir, name);
    const opts = { dbUrl, local, file };
    if (kind === 'data') opts.exclude = AUTH_DATA_EXCLUDES;
    try {
      await supabase.dump(kind, opts);
    } catch (err) {
      throw dumpError(`${kind}_failed`, { stderr: err?.stderr ?? '' });
    }
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      size = 0;
    }
    if (size <= 0) throw dumpError(`${kind}_empty`);
    const bytes = readFileSync(file);
    if (kind === 'roles' && ROLE_PASSWORD_RE.test(bytes.toString('utf8'))) throw dumpError('role_passwords');
    files.push({ name, path: file, size, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return { files };
}
