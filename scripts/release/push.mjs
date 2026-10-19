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

/** The `supabase db push` arguments: a dry run lists pending files; the real push carries the timeouts. */
export function buildPushInvocation({ dbUrl, workdir, dryRun, lockTimeout, statementTimeout }) {
  if (dryRun === true) {
    return { args: ['db', 'push', '--db-url', dbUrl, '--workdir', workdir, '--yes', '--dry-run'] };
  }
  const timeouts = {
    lockTimeout: lockTimeout ?? MIGRATION_TIMEOUTS.lockTimeout,
    statementTimeout: statementTimeout ?? MIGRATION_TIMEOUTS.statementTimeout,
  };
  return { args: ['db', 'push', '--db-url', withTimeouts(dbUrl, timeouts), '--workdir', workdir, '--yes'] };
}

/** The distinct migration file names in a dry-run output, in order; nothing else is kept. */
export function parsePendingMigrations(text) {
  const names = [];
  for (const m of String(text).matchAll(/\b\d{14}_[a-z0-9_]+\.sql\b/g)) {
    if (!names.includes(m[0])) names.push(m[0]);
  }
  return names;
}
