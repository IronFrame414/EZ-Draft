// EZD-023d Step 4 (vault/plans/EZD-023d.md; archived plan Step 9): the psql runner, the tenant 1 check and
// `renderBootstrap`. Node 22 built-ins only. SQL goes on psql's stdin, never in an argument or a file.
import { childEnv, runChild } from './dump.mjs';

/** The psql flags of scripts/db/sql.mjs, with the URL as `--dbname`. */
export function buildPsqlInvocation({ dbUrl }) {
  return { command: 'psql', args: ['--dbname', dbUrl, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'] };
}

/**
 * `sql(text, { dbUrl })` → `{ stdout, stderr }`. A non-zero exit rejects with `psql exited <code>` and
 * `exitCode`, `stdout`, `stderr`; psql writes NOTICE and ERROR lines to stderr.
 */
export function createSql({ run = runChild } = {}) {
  return async (text, { dbUrl }) => {
    const { command, args } = buildPsqlInvocation({ dbUrl });
    const r = await run(command, args, { input: text, env: childEnv(process.env) });
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

const codeError = (code) => Object.assign(new Error(code), { code });

/** The bootstrap file with its one placeholder replaced by the trimmed email. Errors never hold the email. */
export function renderBootstrap(fileText, email) {
  const trimmed = typeof email === 'string' ? email.trim() : '';
  if (!OWNER_EMAIL_RE.test(trimmed)) throw codeError('owner_email_missing');
  const text = String(fileText);
  if (text.split(PLACEHOLDER).length - 1 !== 1) throw codeError('bootstrap_file_invalid');
  return text.replace(PLACEHOLDER, () => trimmed);
}
