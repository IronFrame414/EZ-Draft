// EZD-025 Step 4 (vault/plans/EZD-025.md; Interface contract): the weekly database dump to the off-site bucket
// (`pnpm backup:db`), under `db/<yyyyMMdd'T'HHmmss'Z'>/` with `manifest.json` written last. The dump itself is
// EZD-023d's `dumpDatabase` (no auth session tables, no role passwords). Logs carry counts and codes only; a
// failed dump's child lines pass only through `safeLines` over every configured value (Step 3).
//   node scripts/backup/db.mjs [--local]
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { dumpDatabase } from '../release/dump.mjs';
import { supabaseRefFromDbUrl } from '../release/env-check.mjs';
import { createGitHubApi } from '../release/github-api.mjs';
import { safeLines } from '../release/redact.mjs';
import { checkPresence, configValues, loadBackupConfig } from './config.mjs';
import { checkBackupEnvironment } from './environment.mjs';
import { preflight } from './files.mjs';
import { createS3Store } from './s3-store.mjs';
import { createSource } from './source.mjs';

/** `2026-11-01T08:00:00.000Z` → `db/20261101T080000Z/`. */
export function dumpPrefix(now) {
  const iso = now.toISOString();
  return `db/${iso.slice(0, 19).replace(/[-:]/g, '')}Z/`;
}

export async function runDbDump(opts = {}, deps) {
  const { now = new Date(), local = false } = opts;
  const { store, source, dump = dumpDatabase, dbUrl, tmpDir = os.tmpdir(), onDumpError } = deps;
  let bytes = 0;
  const result = (code, location) => ({
    ok: code === null,
    kind: 'db_dump',
    ...(code === null ? {} : { code }),
    ...(location ? { location } : {}),
    bytes,
  });

  const refused = await preflight(store);
  if (refused) {
    await source.insertRun({ kind: 'db_dump', scope: 'all', status: 'failed', finished_at: new Date(), error: refused });
    return result(refused);
  }

  const runId = await source.startRun('db_dump', 'all');
  const tmp = mkdtempSync(path.join(tmpDir, 'ezd025-db-'));
  const fail = async (code) => {
    await source.finishRun(runId, { status: 'failed', error: code });
    return result(code);
  };
  try {
    const outDir = path.join(tmp, 'dump');
    let files;
    try {
      ({ files } = await dump({ dbUrl, local, outDir }));
    } catch (err) {
      onDumpError?.(err);
      return await fail('dump_failed');
    }
    const sizeOf = (f) => {
      try {
        return statSync(f.path).size;
      } catch {
        return 0;
      }
    };
    if (!Array.isArray(files) || files.length !== 3 || files.some((f) => !(f.size > 0) || sizeOf(f) <= 0)) {
      return await fail('dump_failed');
    }

    let newest;
    try {
      newest = await source.newestMigration();
    } catch {
      return await fail('source_unavailable');
    }

    const prefix = dumpPrefix(now);
    const manifest = {
      format: 1,
      created_at: now.toISOString(),
      source_ref: local ? 'local' : supabaseRefFromDbUrl(dbUrl),
      newest_migration: newest,
      files: files.map((f) => ({ name: f.name, size: f.size, sha256: f.sha256 })),
    };
    const manifestPath = path.join(tmp, 'manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
      for (const f of files) await store.putFile(`${prefix}${f.name}`, f.path, { contentType: 'application/sql' });
      await store.putFile(`${prefix}manifest.json`, manifestPath, { contentType: 'application/json' });
    } catch {
      return await fail('upload_failed');
    }
    bytes = files.reduce((sum, f) => sum + f.size, 0);
    await source.finishRun(runId, { status: 'succeeded', location: prefix, bytes_copied: bytes });
    return result(null, prefix);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const refusal = (code) => ({ ok: false, kind: 'db_dump', code, bytes: 0 });

export async function runDbCli({ argv, processEnv }, deps = {}) {
  const {
    loadConfig = loadBackupConfig,
    makeStore = createS3Store,
    makeSource = createSource,
    dump = dumpDatabase,
    stdout = (line) => process.stdout.write(`${line}\n`),
  } = deps;
  const finish = (exitCode, result) => {
    stdout(JSON.stringify(result));
    return { exitCode, result };
  };

  let flags;
  try {
    flags = parseArgs({ args: argv, options: { local: { type: 'boolean', default: false } }, strict: true }).values;
  } catch {
    return finish(1, refusal('usage'));
  }
  const local = flags.local === true;

  const presence = checkPresence(processEnv, 'db', { local });
  if (presence.code === 'not_configured') {
    stdout('backup not configured');
    return finish(0, refusal('not_configured'));
  }
  if (!presence.ok) return finish(1, refusal(presence.code));

  const github =
    deps.github ??
    createGitHubApi({ token: processEnv.GITHUB_TOKEN, repo: processEnv.GITHUB_REPOSITORY, fetch: globalThis.fetch });
  const env = await checkBackupEnvironment(processEnv, github);
  if (!env.ok) return finish(1, refusal(env.code));

  const cfg = loadConfig(processEnv, { kind: 'db', local });
  const store = makeStore(cfg.s3);
  const source = makeSource({ dbUrl: cfg.sourceDbUrl });
  const masked = configValues(cfg);
  const onDumpError = (err) => {
    const text = typeof err?.stderr === 'string' ? err.stderr.replace(/\r?\n$/, '') : '';
    if (text === '') return;
    for (const line of safeLines(text.split(/\r?\n/), masked)) stdout(`  | ${line}`);
  };
  try {
    const result = await runDbDump({ local }, { store, source, dump, dbUrl: cfg.sourceDbUrl, onDumpError });
    return finish(result.ok ? 0 : 1, result);
  } finally {
    await source.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let exitCode = 1;
  try {
    ({ exitCode } = await runDbCli({ argv: process.argv.slice(2), processEnv: process.env }));
  } catch {
    process.stdout.write(`${JSON.stringify(refusal('internal_error'))}\n`);
    exitCode = 1;
  }
  process.exitCode = exitCode;
}
