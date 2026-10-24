// EZD-025 Step 4 (vault/plans/EZD-025.md; Interface contract): the names each backup run reads, the presence
// check (Step 3: not_configured / env_missing) and the config loader. Values are never printed.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnv } from '../release/dump.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SOURCE_NAMES = ['BACKUP_SOURCE_DB_URL', 'BACKUP_SOURCE_SUPABASE_URL', 'BACKUP_SOURCE_SECRET_KEY'];
const S3_NAMES = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
];
const FILES_NAMES = Object.freeze([...SOURCE_NAMES, ...S3_NAMES]);

/** The exact secret list of each workflow (Step 3); the restore reads the files set. */
export const BACKUP_NAMES = Object.freeze({
  files: FILES_NAMES,
  db: Object.freeze(['BACKUP_SOURCE_DB_URL', ...S3_NAMES]),
  restore: FILES_NAMES,
});

const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * `{ ok: true }`, `{ ok: false, code: 'not_configured' }` (every name empty) or
 * `{ ok: false, code: 'env_missing', missing }`. With `local` only the BACKUP_S3_* names count.
 */
export function checkPresence(env, kind, { local = false } = {}) {
  const names = BACKUP_NAMES[kind].filter((n) => !local || n.startsWith('BACKUP_S3_'));
  const missing = names.filter((n) => isEmpty(env[n]));
  if (missing.length === names.length) return { ok: false, code: 'not_configured' };
  if (missing.length > 0) return { ok: false, code: 'env_missing', missing };
  return { ok: true };
}

/** The local stack's values from `supabase status -o json` (tests, dev). */
function localSource() {
  const r = spawnSync(path.join(REPO_ROOT, 'node_modules', '.bin', 'supabase'), ['status', '-o', 'json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: childEnv(process.env),
  });
  if (r.status !== 0) throw new Error('supabase status failed');
  const json = JSON.parse(r.stdout.trim());
  return { dbUrl: json.DB_URL, apiUrl: json.API_URL, secretKey: json.SECRET_KEY || json.SERVICE_ROLE_KEY };
}

/** The run's values. `sourceSupabaseUrl` and `sourceSecretKey` are null for `db`. */
export function loadBackupConfig(env, { kind, local = false }) {
  const value = (n) => (isEmpty(env[n]) ? null : String(env[n]));
  let sourceDbUrl = value('BACKUP_SOURCE_DB_URL');
  let sourceSupabaseUrl = value('BACKUP_SOURCE_SUPABASE_URL');
  let sourceSecretKey = value('BACKUP_SOURCE_SECRET_KEY');
  if (local) {
    const l = localSource();
    sourceDbUrl = l.dbUrl;
    sourceSupabaseUrl = l.apiUrl;
    sourceSecretKey = l.secretKey;
  }
  if (kind === 'db') {
    sourceSupabaseUrl = null;
    sourceSecretKey = null;
  }
  return {
    sourceDbUrl,
    sourceSupabaseUrl,
    sourceSecretKey,
    s3: {
      endpoint: value('BACKUP_S3_ENDPOINT'),
      region: value('BACKUP_S3_REGION'),
      bucket: value('BACKUP_S3_BUCKET'),
      accessKeyId: value('BACKUP_S3_ACCESS_KEY_ID'),
      secretAccessKey: value('BACKUP_S3_SECRET_ACCESS_KEY'),
    },
  };
}

/** Every configured value, for the child-output mask list (Step 3, `safeLines`). */
export function configValues(cfg) {
  return [cfg.sourceDbUrl, cfg.sourceSupabaseUrl, cfg.sourceSecretKey, ...Object.values(cfg.s3)].filter(
    (v) => typeof v === 'string' && v !== '',
  );
}
