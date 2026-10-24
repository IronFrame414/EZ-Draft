// EZD-023b Step 1 (vault/plans/EZD-023b.md): release context guards, the presence check and masking. Pure;
// Node 22 built-ins only. Nothing here reads process.env, runs git or reaches the network: `env` is injected.

/** The 10 names the release step receives from the `release` environment (archived plan Step 4 order). */
export const RELEASE_SECRET_NAMES = Object.freeze([
  'VERCEL_TOKEN',
  'VERCEL_PROJECT_ID',
  'VERCEL_TEAM_ID',
  'TENANT1_OWNER_EMAIL',
  'BACKUP_SOURCE_DB_URL',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_BUCKET',
  'RELEASE_S3_ACCESS_KEY_ID',
  'RELEASE_S3_SECRET_ACCESS_KEY',
]);

/**
 * The names a configured release needs (archived plan Step 6 step 2 order): GITHUB_TOKEN plus the release names
 * other than TENANT1_OWNER_EMAIL, which part d checks only when it is needed.
 */
export const ENV_REQUIRED_NAMES = Object.freeze([
  'GITHUB_TOKEN',
  'VERCEL_TOKEN',
  'VERCEL_PROJECT_ID',
  'VERCEL_TEAM_ID',
  'BACKUP_SOURCE_DB_URL',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_BUCKET',
  'RELEASE_S3_ACCESS_KEY_ID',
  'RELEASE_S3_SECRET_ACCESS_KEY',
]);

/**
 * Runs first, before git, network or any secret. Reads only CLAUDECODE, GITHUB_ACTIONS, GITHUB_EVENT_NAME and
 * GITHUB_REF, in that order (archived plan Step 5; Q-0106).
 */
export function checkReleaseContext(env) {
  if (env.CLAUDECODE !== undefined) return { ok: false, code: 'agent_refused' };
  if (env.GITHUB_ACTIONS !== 'true') return { ok: false, code: 'not_in_actions' };
  if (env.GITHUB_EVENT_NAME !== 'push') return { ok: false, code: 'wrong_event' };
  if (env.GITHUB_REF !== 'refs/heads/main') return { ok: false, code: 'not_main' };
  return { ok: true };
}

// Missing = undefined or blank after trimming (whitespace counts as empty: fails closed).
const isMissing = (value) => value === undefined || value === null || String(value).trim() === '';

/**
 * Looks only at whether each name is empty; no value is used (Q-0113). Every release name missing →
 * `not_configured`; any required name missing → `missing` with the names in list order (the backup key never
 * stands in for the release key, Q-0112 finding 10); else `complete`.
 */
export function checkPresence(env) {
  if (RELEASE_SECRET_NAMES.every((name) => isMissing(env[name]))) return { state: 'not_configured' };
  const missing = ENV_REQUIRED_NAMES.filter((name) => isMissing(env[name]));
  if (missing.length) return { state: 'missing', missing };
  return { state: 'complete' };
}

/**
 * The derived values GitHub cannot mask on its own (Q-0112 finding 7): the database password as written
 * (percent-encoding kept) and decoded, and the trimmed owner email. Deduplicated, never empty strings.
 */
export function valuesToMask(env) {
  const values = new Set();
  const add = (v) => {
    if (typeof v === 'string' && v !== '') values.add(v);
  };
  const dbUrl = env.BACKUP_SOURCE_DB_URL;
  if (typeof dbUrl === 'string' && dbUrl !== '') {
    let password = '';
    try {
      password = new URL(dbUrl).password;
    } catch {
      password = '';
    }
    if (password !== '') {
      add(password);
      try {
        add(decodeURIComponent(password));
      } catch {
        // Only the raw form is returned when decoding fails.
      }
    }
  }
  const email = env.TENANT1_OWNER_EMAIL;
  if (typeof email === 'string') add(email.trim());
  return [...values];
}

/** One `::add-mask::<line>` per non-empty line, so a value with a line break is masked past the break. */
export function maskCommands(value) {
  return String(value)
    .split(/\r?\n/)
    .filter((line) => line !== '')
    .map((line) => `::add-mask::${line.replaceAll('%', '%25')}`);
}
