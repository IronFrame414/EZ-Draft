// EZD-023d Step 2 (vault/plans/EZD-023d.md): the migration invocation and its timeouts. Pure; Node 22
// built-ins only. Nothing here runs a process or reads process.env.

/** Lock timeout from Q-0112 finding 13; the statement timeout is the archived plan's choice. */
export const MIGRATION_TIMEOUTS = Object.freeze({ lockTimeout: '5s', statementTimeout: '300s' });

/**
 * Appends `options=-c lock_timeout=<l> -c statement_timeout=<s>` (percent-encoded with `%20`, which libpq
 * decodes; `+` is not) to the URL's query. An existing `options` key fails closed (`db_url_has_options`).
 */
export function withTimeouts(dbUrl, { lockTimeout, statementTimeout } = MIGRATION_TIMEOUTS) {
  const url = String(dbUrl);
  const q = url.indexOf('?');
  const query = q === -1 ? '' : url.slice(q + 1);
  if (query.split('&').some((pair) => pair.split('=')[0] === 'options')) {
    throw new Error('db_url_has_options');
  }
  const options = encodeURIComponent(`-c lock_timeout=${lockTimeout} -c statement_timeout=${statementTimeout}`);
  return `${url}${q === -1 ? '?' : '&'}options=${options}`;
}

const dbUrlInvalid = () => Object.assign(new Error('db_url_invalid'), { code: 'db_url_invalid' });

/** Splits the password off a postgres URL: `{ url }` without it and the decoded `password` (EZD-042 D3, D4). */
export function splitDbPassword(dbUrl) {
  if (typeof dbUrl !== 'string' || dbUrl === '') throw dbUrlInvalid();
  let u;
  let password;
  try {
    u = new URL(dbUrl);
    if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:') throw dbUrlInvalid();
    password = decodeURIComponent(u.password);
  } catch {
    throw dbUrlInvalid();
  }
  u.password = '';
  return { url: u.href, password };
}

/** The `supabase db push` arguments (no password) and the child env that carries it. */
export function buildPushInvocation({ dbUrl, workdir, dryRun, lockTimeout, statementTimeout }) {
  const { url, password } = splitDbPassword(dbUrl);
  const env = password === '' ? {} : { PGPASSWORD: password };
  if (dryRun === true) {
    return { args: ['db', 'push', '--db-url', url, '--workdir', workdir, '--yes', '--dry-run'], env };
  }
  const timeouts = {
    lockTimeout: lockTimeout ?? MIGRATION_TIMEOUTS.lockTimeout,
    statementTimeout: statementTimeout ?? MIGRATION_TIMEOUTS.statementTimeout,
  };
  return { args: ['db', 'push', '--db-url', withTimeouts(url, timeouts), '--workdir', workdir, '--yes'], env };
}

/** The distinct migration file names in a dry-run output, in order; nothing else is kept. */
export function parsePendingMigrations(text) {
  const names = [];
  for (const m of String(text).matchAll(/\b\d{14}_[a-z0-9_]+\.sql\b/g)) {
    if (!names.includes(m[0])) names.push(m[0]);
  }
  return names;
}
