// EZD-146 (vault/plans/EZD-146.md section 1): the cloud dev migration push, run by
// .github/workflows/supabase-dev.yml. It goes through the release's createSupabaseCli().push with
// MIGRATION_TIMEOUTS, so the CLI gets `--db-url` without the password and the password only in PGPASSWORD
// (EZD-042). Node 22 built-ins only otherwise.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSupabaseCli, runChild } from '../release/dump.mjs';
import { MIGRATION_TIMEOUTS, parsePendingMigrations } from '../release/push.mjs';
import { safeLines } from '../release/redact.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The env name holding the dev project's Session pooler connection string. */
export const DEV_DB_URL_NAME = 'SUPABASE_DEV_DB_URL';

/** Pushes the pending migrations to the dev database; resolves 0 or 1, never rejects. */
export async function runDevPush({
  env = process.env,
  root = REPO_ROOT,
  workdir = root,
  run = runChild,
  out = (line) => process.stdout.write(line + '\n'),
  err = (line) => process.stderr.write(line + '\n'),
} = {}) {
  const dbUrl = env[DEV_DB_URL_NAME];
  if (dbUrl === undefined || dbUrl === '') {
    err('dev migration push failed: dev_db_url_missing');
    return 1;
  }
  const masked = [dbUrl];
  try {
    const raw = new URL(dbUrl).password;
    masked.push(raw);
    masked.push(decodeURIComponent(raw));
  } catch {
    // An invalid URL fails in push() below with db_url_invalid.
  }
  let last;
  const capture = async (command, args, opts) => {
    const childEnv = { ...opts.env };
    delete childEnv[DEV_DB_URL_NAME];
    last = await run(command, args, { ...opts, env: childEnv });
    return last;
  };
  try {
    const cli = createSupabaseCli({ root, run: capture });
    await cli.push({
      dbUrl,
      workdir,
      lockTimeout: MIGRATION_TIMEOUTS.lockTimeout,
      statementTimeout: MIGRATION_TIMEOUTS.statementTimeout,
    });
    const names = parsePendingMigrations(last.stdout + '\n' + last.stderr);
    for (const name of names) out(`applied migration: ${name}`);
    out(`dev migration push done: ${names.length} migration(s)`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined;
    if (message === 'db_url_invalid' || message === 'db_url_has_options') {
      err(`dev migration push failed: ${message}`);
      return 1;
    }
    if (error instanceof Error && typeof error.exitCode === 'number') {
      err(`dev migration push failed: ${message}`);
      const lines = (String(error.stderr ?? '') + '\n' + String(error.stdout ?? ''))
        .split(/\r?\n/)
        .filter((l) => l.trim() !== '');
      for (const line of safeLines(lines, masked)) err(`  | ${line}`);
      return 1;
    }
    err('dev migration push failed: internal_error');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runDevPush();
}
