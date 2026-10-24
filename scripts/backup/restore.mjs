// EZD-025 Step 6 (vault/plans/EZD-025.md; Interface contract): the restore drill (`pnpm backup:restore`). Loads a
// dump and the copied files into a scratch local Supabase and checks that the named projects, their files and the
// migration version are back. Run by Josh in his own terminal; it never prints keys or passwords.
//   node scripts/backup/restore.mjs [--project <uuid>]... [--dump <prefix> | --from-dir <dir>] [--keep] [--record]
//                                   [--local] [--env-file <absolute path outside the repo>]
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runChild } from '../release/dump.mjs';
import { redactUrl, safeLines } from '../release/redact.mjs';
import { RELEASE_TAG_RE } from '../release/tags.mjs';
import { configValues, loadBackupConfig } from './config.mjs';
import { loadEnvFile } from './local-env.mjs';
import { checkLocalGuards } from './local-guards.mjs';
import { pickLatestDump } from './pick.mjs';
import { createS3Store } from './s3-store.mjs';
import * as scratchModule from './scratch.mjs';
import { createSource } from './source.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUMP_PREFIX_RE = /^(?:db|releases)\/[^/]+\/$/;
const MIGRATION_VERSION_RE = /^(\d{14})_/;
const DUMP_FILE_NAMES = ['roles.sql', 'schema.sql', 'data.sql'];

const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** `{ manifestFiles, newestMigration }` from a folder on disk: `manifest.json`, else EZD-023b's `release.json`. */
async function readDumpDir(dir, git) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return { files: m.files, newestMigration: m.newest_migration };
  }
  const releasePath = path.join(dir, 'release.json');
  if (!existsSync(releasePath)) return null;
  const r = JSON.parse(readFileSync(releasePath, 'utf8'));
  if (typeof r.tag !== 'string' || !RELEASE_TAG_RE.test(r.tag)) return { files: null, newestMigration: null };
  const versions = (await git.migrationsAt(r.tag))
    .map((p) => MIGRATION_VERSION_RE.exec(path.posix.basename(p))?.[1])
    .filter(Boolean)
    .sort();
  return { files: r.dump_files, newestMigration: versions.at(-1) ?? null };
}

export async function runRestore(opts = {}, deps) {
  const {
    projects = [],
    dump,
    fromDir,
    keep = false,
    record = false,
    local = false,
    envFile,
    processEnv = process.env,
    isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY),
    repoRoot = REPO_ROOT,
  } = opts;
  const { scratch: sc, git, tmpDir = os.tmpdir() } = deps;
  const result = {
    ok: false,
    dump: null,
    newest_migration: null,
    projects_found: [],
    files_restored: 0,
    files_checked: 0,
    orphan_rows: 0,
    problems: [],
  };
  const refuse = (code) => ({ exitCode: 1, result: { ...result, code } });

  // 1. usage
  if (!Array.isArray(projects) || projects.some((p) => typeof p !== 'string' || !UUID_RE.test(p))) {
    return refuse('usage');
  }
  if (dump !== undefined && fromDir !== undefined) return refuse('usage');
  const dumpPrefix = dump === undefined ? undefined : dump.endsWith('/') ? dump : `${dump}/`;
  if (dumpPrefix !== undefined && !DUMP_PREFIX_RE.test(dumpPrefix)) return refuse('usage');

  // Guards, only with --env-file, before the file is read (Step 6).
  const guard = checkLocalGuards({ processEnv, isTTY, envFile, repoRoot });
  if (!guard.ok) return refuse(guard.code);
  const env = envFile === undefined || envFile === null ? processEnv : deps.loadEnvFile(envFile);
  const cfg = loadBackupConfig(env, { kind: 'restore', local });
  const store = deps.makeStore(cfg.s3);

  const tmp = mkdtempSync(path.join(tmpDir, 'ezd025-restore-'));
  let workdir = null;
  try {
    // 2. find the dump; 3. its files, checked against the manifest.
    let files;
    let dataPath;
    if (fromDir !== undefined) {
      const found = await readDumpDir(fromDir, git);
      if (!found) return refuse('no_dump');
      if (!Array.isArray(found.files)) return refuse('dump_corrupt');
      result.dump = fromDir;
      result.newest_migration = found.newestMigration;
      files = found.files;
      for (const name of DUMP_FILE_NAMES) {
        const entry = files.find((f) => f?.name === name);
        const p = path.join(fromDir, name);
        if (!entry || !existsSync(p) || sha256File(p) !== entry.sha256) return refuse('dump_corrupt');
      }
      dataPath = path.join(fromDir, 'data.sql');
    } else {
      const prefix = dumpPrefix ?? pickLatestDump(await store.list('db/'));
      if (!prefix) return refuse('no_dump');
      const manifestPath = path.join(tmp, 'manifest.json');
      try {
        await store.getToFile(`${prefix}manifest.json`, manifestPath);
      } catch {
        return refuse('no_dump');
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      result.dump = prefix;
      result.newest_migration = manifest.newest_migration ?? null;
      files = Array.isArray(manifest.files) ? manifest.files : [];
      for (const name of DUMP_FILE_NAMES) {
        const entry = files.find((f) => f?.name === name);
        if (!entry) return refuse('dump_corrupt');
        const p = path.join(tmp, name);
        await store.getToFile(`${prefix}${name}`, p);
        if (sha256File(p) !== entry.sha256) return refuse('dump_corrupt');
      }
      dataPath = path.join(tmp, 'data.sql');
    }

    // 4. the workdir
    try {
      workdir = await sc.prepareWorkdir({ newestMigration: result.newest_migration, repoRoot });
    } catch (err) {
      if (err?.code === 'repo_older_than_dump') return refuse('repo_older_than_dump');
      throw err;
    }

    // 5. the scratch stack, the data and the files
    const scratch = await sc.startScratch(workdir);
    await sc.loadData(scratch, dataPath);
    if (fromDir === undefined) {
      const { filesRestored } = await sc.uploadFiles(scratch, store, tmp);
      result.files_restored = filesRestored;
    }

    // 6. checks
    const q = sc.queries(scratch, store);
    if ((await q.maxMigration()) !== result.newest_migration) {
      result.problems.push({ code: 'migrations_mismatch', ref: result.newest_migration });
    }
    if (!(await q.triggerEnabled())) result.problems.push({ code: 'trigger_disabled', ref: 'sent_files_soft_delete' });
    for (const P of projects) {
      if (!(await q.projectExists(P))) {
        result.problems.push({ code: 'project_missing', ref: P });
        continue;
      }
      result.projects_found.push(P);
      for (const o of await q.objectsFor(P)) {
        result.files_checked += 1;
        const offsite = await q.offsiteSha256(o.bucket, o.name);
        if (offsite === null) {
          result.orphan_rows += 1;
          continue;
        }
        const got = await q.sha256Of(o.bucket, o.name);
        if (got === null) result.problems.push({ code: 'file_missing', ref: P });
        else if (got !== offsite) result.problems.push({ code: 'file_mismatch', ref: P });
      }
    }
    result.ok = result.problems.length === 0;
    if (keep) result.scratch = { apiUrl: scratch.apiUrl, dbUrl: redactUrl(scratch.dbUrl ?? ''), workdir };

    // 8. --record, in the source database
    if (record) {
      const source = deps.makeSource({
        dbUrl: cfg.sourceDbUrl,
        supabaseUrl: cfg.sourceSupabaseUrl,
        secretKey: cfg.sourceSecretKey,
      });
      try {
        await source.insertRun({
          kind: 'restore_drill',
          scope: 'all',
          status: result.ok ? 'succeeded' : 'failed',
          finished_at: new Date(),
          location: fromDir === undefined ? result.dump : null,
          error: result.problems[0]?.code ?? null,
        });
      } finally {
        await source.close();
      }
    }
    return { exitCode: result.ok ? 0 : 1, result };
  } catch (err) {
    // The CLI prints a failed step's child lines only through safeLines over every configured value.
    if (err && typeof err === 'object') err.masked = configValues(cfg);
    throw err;
  } finally {
    // 9.
    if (workdir !== null && !keep) {
      await sc.stopScratch(workdir);
      rmSync(workdir, { recursive: true, force: true });
    }
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Migration file paths at a release tag (`git ls-tree`), for a release folder without a manifest. */
export function createGit(repoRoot) {
  return {
    async migrationsAt(tag) {
      if (!RELEASE_TAG_RE.test(tag)) return [];
      const r = await runChild('git', ['-C', repoRoot, 'ls-tree', '-r', '--name-only', tag, '--', 'supabase/migrations']);
      if (r.code !== 0) return [];
      return r.stdout.split('\n').filter(Boolean);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const out = (line) => process.stdout.write(`${line}\n`);
  let exitCode = 1;
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        project: { type: 'string', multiple: true },
        dump: { type: 'string' },
        'from-dir': { type: 'string' },
        keep: { type: 'boolean', default: false },
        record: { type: 'boolean', default: false },
        local: { type: 'boolean', default: false },
        'env-file': { type: 'string' },
      },
      strict: true,
    }));
  } catch {
    values = null;
  }
  if (values === null) {
    out(JSON.stringify({ ok: false, code: 'usage' }));
  } else {
    try {
      const r = await runRestore(
        {
          projects: values.project ?? [],
          dump: values.dump,
          fromDir: values['from-dir'] === undefined ? undefined : path.resolve(values['from-dir']),
          keep: values.keep,
          record: values.record,
          local: values.local,
          envFile: values['env-file'],
          repoRoot: REPO_ROOT,
        },
        {
          loadEnvFile,
          makeStore: createS3Store,
          makeSource: createSource,
          scratch: {
            prepareWorkdir: scratchModule.prepareWorkdir,
            startScratch: scratchModule.startScratch,
            loadData: scratchModule.loadData,
            uploadFiles: scratchModule.uploadFiles,
            stopScratch: scratchModule.stopScratch,
            queries: scratchModule.scratchQueries,
          },
          git: createGit(REPO_ROOT),
          tmpDir: os.tmpdir(),
        },
      );
      exitCode = r.exitCode;
      out(JSON.stringify(r.result));
    } catch (err) {
      // A step failed outside the checks: its code, and the child's lines only through safeLines.
      const code = typeof err?.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(err.code) ? err.code : 'internal_error';
      const text = typeof err?.stderr === 'string' ? err.stderr.replace(/\r?\n$/, '') : '';
      const masked = Array.isArray(err?.masked) ? err.masked : null;
      if (text !== '' && masked !== null) for (const line of safeLines(text.split(/\r?\n/), masked)) out(`  | ${line}`);
      out(JSON.stringify({ ok: false, code }));
    }
  }
  process.exitCode = exitCode;
}
