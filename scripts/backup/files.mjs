// EZD-025 Step 4 (vault/plans/EZD-025.md; Interface contract): the nightly copy of new Storage objects to the
// off-site bucket (`pnpm backup:files`). Logs carry counts and codes only (Step 3).
//   node scripts/backup/files.mjs [--local] [--full] [--only-bucket <id>]...
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createGitHubApi } from '../release/github-api.mjs';
import { checkPresence, loadBackupConfig } from './config.mjs';
import { checkBackupEnvironment } from './environment.mjs';
import { createS3Store } from './s3-store.mjs';
import { createSource } from './source.mjs';

/** The versioning and Object Lock preflight (ticket "object versioning on"; Q-0111): null or a code. */
export async function preflight(store) {
  if ((await store.versioningStatus()) !== 'Enabled') return 'versioning_off';
  const lock = await store.objectLockStatus();
  if (!lock.enabled || lock.mode !== 'GOVERNANCE' || !(Number(lock.days) >= 91)) return 'object_lock_off';
  return null;
}

/** Runs `fn`, turning any error into one tagged with `code` (the run's error code). */
async function step(code, fn) {
  try {
    return await fn();
  } catch {
    throw Object.assign(new Error(code), { runCode: code });
  }
}

export async function runFileBackup(opts = {}, deps) {
  const { full = false, onlyBuckets = null, overlapSeconds = 3600, concurrency = 4 } = opts;
  const { store, source, tmpDir = os.tmpdir() } = deps;
  const buckets = onlyBuckets ? [...onlyBuckets].sort() : null;
  const scope = buckets ? `buckets:${buckets.join(',')}` : 'all';
  const counts = { copied: 0, skipped: 0, hidden: 0, bytes: 0 };
  const result = (code) => ({ ok: code === null, kind: 'files', ...(code === null ? {} : { code }), ...counts });

  const refused = await preflight(store);
  if (refused) {
    await source.insertRun({ kind: 'files', scope, status: 'failed', finished_at: new Date(), error: refused });
    return result(refused);
  }

  const runId = await source.startRun('files', scope);
  const tmp = mkdtempSync(path.join(tmpDir, 'ezd025-files-'));
  let cursorText = null;
  try {
    const last = full ? null : await step('source_unavailable', () => source.lastSucceeded('files', scope));
    cursorText = last?.files_cursor_text ?? null;
    let since = null;
    if (last?.files_cursor_text) {
      since =
        overlapSeconds > 0
          ? new Date(Date.parse(last.files_cursor_text) - overlapSeconds * 1000)
          : last.files_cursor_text;
    }

    let n = 0;
    const copyOne = async (o) => {
      const key = `files/${o.bucket}/${o.name}`;
      const offsite = await step('upload_failed', () => store.head(key));
      if (offsite && offsite.meta['source-etag'] === o.eTag && offsite.size === o.size) {
        counts.skipped += 1;
        return;
      }
      const file = path.join(tmp, `${(n += 1)}`);
      await step('download_failed', () => source.download(o.bucket, o.name, file));
      const bytes = readFileSync(file);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await step('upload_failed', () =>
        store.putFile(key, file, {
          contentType: o.mimetype ?? 'application/octet-stream',
          meta: { 'source-etag': o.eTag, 'source-updated-at': o.updatedAtText, sha256 },
        }),
      );
      rmSync(file, { force: true });
      counts.copied += 1;
      counts.bytes += bytes.length;
    };

    const changed = source.listChangedObjects({ since, buckets, pageSize: 500 });
    let batch = [];
    const flush = async () => {
      await Promise.all(batch.map(copyOne));
      batch = [];
    };
    for (;;) {
      const next = await step('source_unavailable', () => changed.next());
      if (next.done) break;
      const o = next.value;
      if (cursorText === null || o.updatedAtText > cursorText) cursorText = o.updatedAtText;
      batch.push(o);
      if (batch.length >= concurrency) await flush();
    }
    await flush();

    // Delete-marker pass (Q-0075): an off-site key whose source object is gone gets a delete marker.
    const sourceKeys = new Set();
    await step('source_unavailable', async () => {
      for await (const k of source.listAllObjectKeys({ buckets })) sourceKeys.add(`files/${k.bucket}/${k.name}`);
    });
    const offsiteKeys = await step('hide_failed', async () => {
      if (!buckets) return store.list('files/');
      const all = [];
      for (const b of buckets) all.push(...(await store.list(`files/${b}/`)));
      return all;
    });
    if (sourceKeys.size === 0 && offsiteKeys.length > 0) {
      throw Object.assign(new Error('source_empty'), { runCode: 'source_empty' });
    }
    for (const key of offsiteKeys) {
      if (sourceKeys.has(key)) continue;
      await step('hide_failed', () => store.hide(key));
      counts.hidden += 1;
    }

    await source.finishRun(runId, {
      status: 'succeeded',
      objects_copied: counts.copied,
      objects_skipped: counts.skipped,
      objects_hidden: counts.hidden,
      bytes_copied: counts.bytes,
      files_cursor: cursorText,
    });
    return result(null);
  } catch (err) {
    const code = err?.runCode ?? 'internal_error';
    await source.finishRun(runId, {
      status: 'failed',
      error: code,
      objects_copied: counts.copied,
      objects_skipped: counts.skipped,
      objects_hidden: counts.hidden,
      bytes_copied: counts.bytes,
    });
    return result(code);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const zero = (code) => ({ ok: false, kind: 'files', code, copied: 0, skipped: 0, hidden: 0, bytes: 0 });

export async function runFilesCli({ argv, processEnv }, deps = {}) {
  const {
    loadConfig = loadBackupConfig,
    makeStore = createS3Store,
    makeSource = createSource,
    stdout = (line) => process.stdout.write(`${line}\n`),
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
        full: { type: 'boolean', default: false },
        'only-bucket': { type: 'string', multiple: true },
      },
      strict: true,
    }).values;
  } catch {
    return finish(1, zero('usage'));
  }
  const local = flags.local === true;

  const presence = checkPresence(processEnv, 'files', { local });
  if (presence.code === 'not_configured') {
    stdout('backup not configured');
    return finish(0, zero('not_configured'));
  }
  if (!presence.ok) return finish(1, zero(presence.code));

  const github =
    deps.github ??
    createGitHubApi({ token: processEnv.GITHUB_TOKEN, repo: processEnv.GITHUB_REPOSITORY, fetch: globalThis.fetch });
  const env = await checkBackupEnvironment(processEnv, github);
  if (!env.ok) return finish(1, zero(env.code));

  const cfg = loadConfig(processEnv, { kind: 'files', local });
  const store = makeStore(cfg.s3);
  const source = makeSource({ dbUrl: cfg.sourceDbUrl, supabaseUrl: cfg.sourceSupabaseUrl, secretKey: cfg.sourceSecretKey });
  try {
    const onlyBuckets = flags['only-bucket']?.length ? flags['only-bucket'] : null;
    const result = await runFileBackup({ full: flags.full === true, onlyBuckets }, { store, source });
    return finish(result.ok ? 0 : 1, result);
  } finally {
    await source.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let exitCode = 1;
  try {
    ({ exitCode } = await runFilesCli({ argv: process.argv.slice(2), processEnv: process.env }));
  } catch {
    process.stdout.write(`${JSON.stringify(zero('internal_error'))}\n`);
    exitCode = 1;
  }
  process.exitCode = exitCode;
}
