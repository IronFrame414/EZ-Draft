// EZD-023d Step 4 (vault/plans/EZD-023d.md; archived plan Step 9): the psql runner, the tenant 1 check and
// `renderBootstrap`. Node 22 built-ins only. SQL goes on psql's stdin, never in an argument or a file; the connection goes in `PG*` variables of the child, never in an argument (EZD-041).
import { childEnv, runChild } from './dump.mjs';

const codeError = (code) => Object.assign(new Error(code), { code });

/** The psql flags of scripts/db/sql.mjs plus `-v VERBOSITY=terse` (EZD-152: psql prints only severity and message lines), without a database argument: the connection is in `PG*` variables. */
export const PSQL_ARGS = Object.freeze(['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse', '-X', '-q', '-t', '-A']);

/** The URL query keys that are allowed, and the `PG*` variable each one sets (EZD-041 D5). */
export const PG_QUERY_ENV = Object.freeze({
  options: 'PGOPTIONS',
  sslmode: 'PGSSLMODE',
  sslrootcert: 'PGSSLROOTCERT',
  application_name: 'PGAPPNAME',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
});

/**
 * A database URL as `PG*` variables (EZD-041 D4, D5). Pure. Anything unexpected throws `db_url_invalid`, with
 * no cause and nothing from the URL in the error.
 */
export function pgEnvFromUrl(dbUrl) {
  try {
    if (typeof dbUrl !== 'string' || dbUrl === '') throw new Error();
    const u = new URL(dbUrl);
    if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:') throw new Error();
    if (u.hash !== '') throw new Error();
    let host = u.hostname;
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    if (host === '' || host.includes(',')) throw new Error();
    const env = { PGHOST: host };
    if (u.port !== '') env.PGPORT = u.port;
    if (u.username !== '') env.PGUSER = decodeURIComponent(u.username);
    if (u.password !== '') env.PGPASSWORD = decodeURIComponent(u.password);
    const db = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
    if (db !== '') env.PGDATABASE = decodeURIComponent(db);
    const q = dbUrl.indexOf('?');
    const query = q === -1 ? '' : dbUrl.slice(q + 1);
    if (query !== '') {
      const seen = new Set();
      for (const pair of query.split('&')) {
        const eq = pair.indexOf('=');
        if (eq === -1) throw new Error();
        const key = decodeURIComponent(pair.slice(0, eq));
        const value = decodeURIComponent(pair.slice(eq + 1));
        if (!Object.hasOwn(PG_QUERY_ENV, key) || seen.has(key) || value === '') throw new Error();
        seen.add(key);
        env[PG_QUERY_ENV[key]] = value;
      }
    }
    return env;
  } catch {
    throw codeError('db_url_invalid');
  }
}

/** psql's command, flags and `PG*` connection variables; the URL and password never go in an argument. */
export function buildPsqlInvocation({ dbUrl }) {
  return { command: 'psql', args: [...PSQL_ARGS], env: pgEnvFromUrl(dbUrl) };
}

/**
 * `sql(text, { dbUrl })` → `{ stdout, stderr }`. A non-zero exit rejects with `psql exited <code>` and
 * `exitCode`, `stdout`, `stderr`; psql writes NOTICE and ERROR lines to stderr.
 */
export function createSql({ run = runChild } = {}) {
  return async (text, { dbUrl }) => {
    const { command, args, env: pgEnv } = buildPsqlInvocation({ dbUrl });
    const env = childEnv(process.env);
    for (const k of Object.keys(env)) if (k.startsWith('PG')) delete env[k];
    Object.assign(env, pgEnv);
    const r = await run(command, args, { input: text, env });
    if (r.code === 0) return { stdout: r.stdout, stderr: r.stderr };
    throw Object.assign(new Error(`psql exited ${r.code}`), {
      exitCode: r.code,
      stdout: r.stdout,
      stderr: r.stderr,
    });
  };
}

/**
 * Prints one line `<0|1> <lock_timeout ms> <statement_timeout ms>`: whether tenant 1 exists (read only when the
 * table exists, since a missing table fails at parse time) and the server's timeouts on this connection.
 */
export const TENANT_CHECK_SQL = `select to_regclass('public.tenant') is not null as has_tenant \\gset
\\if :has_tenant
select (select count(*) from public.tenant where id = '00000000-0000-4000-8000-000000000001') || ' ' || (select setting from pg_catalog.pg_settings where name = 'lock_timeout') || ' ' || (select setting from pg_catalog.pg_settings where name = 'statement_timeout');
\\else
select '0 ' || (select setting from pg_catalog.pg_settings where name = 'lock_timeout') || ' ' || (select setting from pg_catalog.pg_settings where name = 'statement_timeout');
\\endif
`;

/** EZD-005b T18's pattern, anchored: no quote, space or line break can reach the SQL string. */
export const OWNER_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const BOOTSTRAP_PATH = 'supabase/bootstrap/tenant-1.sql';

const PLACEHOLDER = 'PASTE-YOUR-EMAIL-HERE';

/** The bootstrap file with its one placeholder replaced by the trimmed email. Errors never hold the email. */
export function renderBootstrap(fileText, email) {
  const trimmed = typeof email === 'string' ? email.trim() : '';
  if (!OWNER_EMAIL_RE.test(trimmed)) throw codeError('owner_email_missing');
  const text = String(fileText);
  if (text.split(PLACEHOLDER).length - 1 !== 1) throw codeError('bootstrap_file_invalid');
  return text.replace(PLACEHOLDER, () => trimmed);
}
