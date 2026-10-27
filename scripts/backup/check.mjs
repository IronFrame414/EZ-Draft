// EZD-1704 (vault/plans/EZD-1704.md; Q-0232; Q-0301 (b)): `pnpm backup:check` reads the newest succeeded `files` and
// `db_dump` rows of `backup_run` and fails unless the file copy is under 26 hours old and the dump under 8 days.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGitHubApi } from '../release/github-api.mjs';
import { loadBackupConfig } from './config.mjs';
import { checkBackupEnvironment } from './environment.mjs';
import { loadEnvFile } from './local-env.mjs';
import { checkLocalGuards } from './local-guards.mjs';
import { createSource } from './source.mjs';

export const FILES_MAX_AGE_MS = 93_600_000;
export const DB_DUMP_MAX_AGE_MS = 691_200_000;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Stale when the time is missing or `now - t >= max`; a future time is current. */
export function evaluateBackupCurrency({ filesSucceededAt, dbDumpSucceededAt, now }) {
  const stale = [];
  if (!filesSucceededAt || now.getTime() - filesSucceededAt.getTime() >= FILES_MAX_AGE_MS) stale.push('files_stale');
  if (!dbDumpSucceededAt || now.getTime() - dbDumpSucceededAt.getTime() >= DB_DUMP_MAX_AGE_MS) {
    stale.push('db_dump_stale');
  }
  return { ok: stale.length === 0, stale };
}

const refusal = (code) => ({
  ok: false,
  kind: 'backup_check',
  code,
  stale: [],
  files_succeeded_at: null,
  db_dump_succeeded_at: null,
});

export async function runCheckCli({ argv, processEnv, isTTY }, deps = {}) {
  const {
    loadEnvFile: loadEnv = loadEnvFile,
    loadConfig = loadBackupConfig,
    makeSource = createSource,
    now = () => new Date(),
    stdout = (line) => process.stdout.write(`${line}\n`),
    repoRoot = REPO_ROOT,
  } = deps;
  const finish = (exitCode, result) => {
    stdout(JSON.stringify(result));
    return { exitCode, result };
  };

  let flags;
  try {
    flags = parseArgs({
      args: argv,
      options: {
        local: { type: 'boolean', default: false },
        'env-file': { type: 'string' },
        'only-bucket': { type: 'string', multiple: true },
      },
      strict: true,
    }).values;
  } catch {
    return finish(1, refusal('usage'));
  }
  const local = flags.local === true;
  const envFile = flags['env-file'];
  if (local && envFile !== undefined) return finish(1, refusal('usage'));

  const guards = checkLocalGuards({ processEnv, isTTY, envFile, repoRoot });
  if (!guards.ok) return finish(1, refusal(guards.code));

  let source;
  try {
    let env = processEnv;
    if (envFile !== undefined) {
      try {
        env = loadEnv(envFile);
      } catch {
        return finish(1, refusal('env_file_unreadable'));
      }
    }

    if (!local) {
      const url = env.BACKUP_SOURCE_DB_URL;
      if (url === undefined || url === null || String(url).trim() === '') {
        if (processEnv.GITHUB_ACTIONS === 'true') return finish(0, refusal('not_configured'));
        return finish(1, refusal('env_missing'));
      }
    }

    const github =
      deps.github ??
      createGitHubApi({ token: processEnv.GITHUB_TOKEN, repo: processEnv.GITHUB_REPOSITORY, fetch: globalThis.fetch });
    const rule = await checkBackupEnvironment(processEnv, github);
    if (!rule.ok) return finish(1, refusal('environment_unprotected'));

    const cfg = loadConfig(env, { kind: 'db', local });
    source = makeSource({ dbUrl: cfg.sourceDbUrl });

    const ids = flags['only-bucket'] ?? [];
    const filesScope = ids.length === 0 ? 'all' : `buckets:${[...ids].sort().join(',')}`;
    let filesAt;
    let dumpAt;
    try {
      filesAt = await source.lastSucceededAt('files', filesScope);
      dumpAt = await source.lastSucceededAt('db_dump', 'all');
    } catch {
      return finish(1, refusal('source_unavailable'));
    }

    const verdict = evaluateBackupCurrency({ filesSucceededAt: filesAt, dbDumpSucceededAt: dumpAt, now: now() });
    const result = {
      ok: verdict.ok,
      kind: 'backup_check',
      ...(verdict.ok ? {} : { code: 'backup_stale' }),
      stale: verdict.stale,
      files_succeeded_at: filesAt ? filesAt.toISOString() : null,
      db_dump_succeeded_at: dumpAt ? dumpAt.toISOString() : null,
    };
    return finish(verdict.ok ? 0 : 1, result);
  } catch {
    return finish(1, refusal('internal_error'));
  } finally {
    if (source) {
      try {
        await source.close();
      } catch {
        // the read is complete; the decided result stands
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let exitCode = 1;
  try {
    ({ exitCode } = await runCheckCli({
      argv: process.argv.slice(2),
      processEnv: process.env,
      isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    }));
  } catch {
    process.stdout.write(`${JSON.stringify(refusal('internal_error'))}\n`);
  }
  process.exitCode = exitCode;
}
