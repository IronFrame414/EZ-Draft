#!/usr/bin/env node
// EZD-023b Step 4 (vault/plans/EZD-023b.md): the release runner, steps 1–8 (context, presence and masking, tip,
// merged pull request, environment rule, release name, EZD-023a's migration check) and its CLI. Node 22
// built-ins only. Parts EZD-023c–e add the steps after the migration check: the Vercel checks (c), the dump,
// migrations and tenant 1 (d), then tag, go live, verify, rollback and record (e). Started only by
// .github/workflows/release.yml (EZD-023e; Q-0157).
//
// `runRelease(opts, deps)` reads `deps.processEnv` one name at a time, never enumerating it, and reads no
// release name and not GITHUB_TOKEN before the context guards pass (AC-EZD-023b-2). No log line is written
// before step 2's masking except the refusal lines of steps 1–2 (archived plan Step 4 "Masking").
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BOOTSTRAP_PATH, createSql, renderBootstrap, TENANT_CHECK_SQL } from './bootstrap.mjs';
import {
  checkPresence,
  checkReleaseContext,
  maskCommands,
  RELEASE_SECRET_NAMES,
  valuesToMask,
} from './context.mjs';
import { createSupabaseCli, dumpDatabase, runChild } from './dump.mjs';
import { DECRYPTED_ENTRIES, envExampleNames, evaluateVercelEnv, supabaseRefFromDbUrl } from './env-check.mjs';
import { createGitHubApi, evaluateEnvironmentRule } from './github-api.mjs';
import { main as checkMigrations } from './check-migrations.mjs';
import { createOffsiteUploader } from './offsite-upload.mjs';
import { MIGRATION_TIMEOUTS, parsePendingMigrations, withTimeouts } from './push.mjs';
import { safeLines } from './redact.mjs';
import { releaseTagFor } from './release-name.mjs';
import { listReleaseTags, parseReleaseTag, previousReleaseTag } from './tags.mjs';
import { createVercelApi, evaluateVercelProject } from './vercel-api.mjs';
import { evaluate, HOST, observe } from '../hosting/check-live.mjs';

// EZD-023e Step 1 H: the checks after going live.
export const VERIFY_INTERVAL_MS = 5000;
export const VERIFY_LIMIT_MS = 120000;
export const HEALTH_REQUEST_TIMEOUT_MS = 4000;
export const HEALTH_URL = 'https://' + HOST + '/api/health';

// Section 6 wording (job summary lines).
const NOT_CONFIGURED_LINE = 'production not configured — nothing released';
const stoppedLine = (code) => `release stopped: ${code} — nothing changed`;
const missingLine = (names) => `missing in the release environment: ${names.join(', ')}`;
const problemLine = ({ code, name, target }) =>
  `Vercel value problem: ${code} ${name}${target ? ` (${target})` : ''}`;
// EZD-023d section 6: lines for the codes after which something outside the runner may have changed.
const DUMP_SAVED_LINE = (prefix) => `database dump saved: ${prefix}`;
const UPLOAD_FAILED_LINE = (prefix) =>
  `release stopped: dump_upload_failed — the database and the live site are unchanged; an incomplete dump may be in ${prefix}`;
const PARTLY_UPDATED_LINE = (code, prefix) =>
  `release stopped: ${code} — the live site is unchanged; the database may be partly updated; the dump from before this release is in ${prefix}`;
// EZD-023e section 6: lines from step G on.
const RELEASED_LINE = (tag, n) => `released ${tag} from pull request #${n}`;
const TAG_FAILED_LINE = (prefix) =>
  `release stopped: tag_failed — the live site is unchanged; the database has this release's migrations; the dump from before this release is in ${prefix}`;
const PROMOTE_FAILED_LINE = (tag) =>
  `release stopped: promote_failed — the live site is unchanged; the database has this release's migrations and the tag ${tag} was made; press Re-run jobs to try again`;
const VERIFY_ROLLED_BACK_LINE =
  "release failed: verify_failed — the checks after going live failed, so the previous build was put back; the database keeps this release's migrations; to go back further, use Instant Rollback (docs/runbook.md, Rollback)";
const VERIFY_NO_EARLIER_LINE =
  'release failed: verify_failed — the checks after going live failed and there was no earlier build to put back, so this build stays live; see docs/runbook.md, Rollback';
const VERIFY_ROLLBACK_FAILED_LINE =
  'release failed: verify_failed — the checks after going live failed and putting the previous build back also failed; use Instant Rollback in Vercel now (docs/runbook.md, Rollback)';
const NOTICE_LINES = {
  previous_deployment_unknown: () =>
    'notice previous_deployment_unknown: Vercel did not report the build that was live before this release, so an automatic rollback would have nothing to put back; tell the orchestrator, and use Instant Rollback by hand if this release has a problem',
  vercel_token_expiring: (date) =>
    `notice vercel_token_expiring: the Vercel token expires on ${date}; make a new one and replace VERCEL_TOKEN in the release environment`,
  vercel_token_no_expiry: () =>
    'notice vercel_token_no_expiry: the Vercel token never expires; make one that expires in 90 days',
  vercel_token_expiry_unknown: () =>
    'notice vercel_token_expiry_unknown: could not read when the Vercel token expires',
  owner_email_secret_unused: () =>
    'notice owner_email_secret_unused: tenant 1 already exists; delete TENANT1_OWNER_EMAIL from the release environment',
};
const TOKEN_WARN_MS = 14 * 86_400_000;
const BUILD_WAIT_MS = 900_000;
const BUILD_POLL_MS = 10_000;
const TENANT_CHECK_RE = /^([01]) (\d+) (\d+)$/;
const MIGRATION_FILE_RE = /^(\d{14})_[a-z0-9_]+\.sql$/;
const CHILD_LINES_MAX = 20;
const BUILD_STATE_RE = /^[A-Z_]{1,20}$/;

/** `yyyyMMddTHHmmssZ` of a clock value (the off-site prefix). */
const stampOf = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** The largest 14-digit prefix among the worktree's migration files (C5's pattern), or null. */
function newestMigrationIn(worktree) {
  let names;
  try {
    names = readdirSync(path.join(worktree, 'supabase', 'migrations'));
  } catch {
    return null;
  }
  let newest = null;
  for (const name of names) {
    const m = MIGRATION_FILE_RE.exec(name);
    if (m && (newest === null || m[1] > newest)) newest = m[1];
  }
  return newest;
}

const FETCH_ARGS = [
  'fetch',
  '--no-tags',
  'origin',
  '+refs/heads/main:refs/remotes/origin/main',
  '+refs/tags/phase-*:refs/tags/phase-*',
];

/** The HTTP status in a client error message (`GET /x failed: 502`), or null: the log carries the status only. */
function httpStatusOf(err) {
  const m = /\b([1-5]\d{2})\b\s*$/.exec(err instanceof Error ? err.message : String(err));
  return m ? m[1] : null;
}

/** Runs `git -C <root> …` synchronously with no terminal prompt; returns stdout, throws on a non-zero exit. */
export function createGit(root) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  return (args) => {
    const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env, timeout: 30_000 });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} exited ${r.status}`);
    return r.stdout ?? '';
  };
}

const VERCEL_METHODS = [
  'getProject',
  'tokenInfo',
  'findProductionDeployment',
  'currentProductionDeployment',
  'listEnv',
  'readEnvValue',
  'promote',
];

/** Builds the Vercel client on first use, so no VERCEL_* name is read before step 9. */
function lazyVercel() {
  let api = null;
  const get = () =>
    (api ??= createVercelApi({
      token: process.env.VERCEL_TOKEN,
      projectId: process.env.VERCEL_PROJECT_ID,
      teamId: process.env.VERCEL_TEAM_ID,
      fetch: globalThis.fetch,
    }));
  return Object.fromEntries(VERCEL_METHODS.map((m) => [m, (...args) => get()[m](...args)]));
}

export async function runRelease(opts, deps) {
  const { processEnv, git, github, vercel, supabase, sql, offsite, fetch, checkLive, sleep, now, log, summary, mask } =
    deps;
  const stop = (code, extra = {}) => {
    summary(stoppedLine(code));
    return { ok: false, code, notices: [], ...extra };
  };

  // 1. Context.
  const context = checkReleaseContext(processEnv);
  if (!context.ok) {
    log(`release refused: ${context.code}`);
    return stop(context.code);
  }

  // 2. Presence, then masking before any other output.
  const presence = checkPresence(processEnv);
  if (presence.state === 'not_configured') {
    summary(NOT_CONFIGURED_LINE);
    return { ok: true, code: 'not_configured', notices: [] };
  }
  if (presence.state === 'missing') {
    log(`env_missing: ${presence.missing.join(', ')}`);
    summary(stoppedLine('env_missing'));
    summary(missingLine(presence.missing));
    return { ok: false, code: 'env_missing', missing: presence.missing, notices: [] };
  }
  for (const value of valuesToMask(processEnv)) mask(value);

  // 3. The commit.
  const sha = processEnv.GITHUB_SHA;

  // 4. The commit must be the tip of origin/main; a git failure refuses too (fail closed).
  let tip;
  try {
    git(FETCH_ARGS);
    tip = git(['rev-parse', 'refs/remotes/origin/main']).trim();
  } catch {
    log('not_latest: git fetch failed');
    return stop('not_latest');
  }
  if (tip !== sha) {
    log(`not_latest: ${sha} is not the tip of origin/main (${tip})`);
    return stop('not_latest');
  }

  // 5. The commit must be the merge commit of a pull request merged into main (Q-0106).
  let pull = null;
  try {
    const pulls = await github.mergedPullsFor(sha);
    pull =
      (Array.isArray(pulls) ? pulls : []).find(
        (p) => p && p.merged_at && p.base?.ref === 'main' && p.merge_commit_sha === sha,
      ) ?? null;
  } catch (err) {
    const status = httpStatusOf(err);
    log(status ? `no_merged_pr: GitHub returned ${status}` : 'no_merged_pr: GitHub request failed');
    return stop('no_merged_pr');
  }
  if (pull === null) {
    log(`no_merged_pr: no merged pull request on main for ${sha}`);
    return stop('no_merged_pr');
  }
  const prNumber = pull.number;
  const prTitle = pull.title;

  // 6. The release environment must be main-only with no admin bypass (Q-0112 finding 2).
  let rule;
  try {
    rule = await github.environmentBranchRule('release');
  } catch (err) {
    const status = httpStatusOf(err);
    log(
      status
        ? `environment_unprotected: GitHub returned ${status}`
        : 'environment_unprotected: GitHub request failed',
    );
    return stop('environment_unprotected');
  }
  const verdict = evaluateEnvironmentRule(rule);
  if (!verdict.ok) {
    log(`environment_unprotected: ${verdict.reason}`);
    return stop('environment_unprotected');
  }

  // 7. The release name.
  const tags = listReleaseTags(git);
  const tagsOnSha = git(['tag', '--points-at', sha])
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => parseReleaseTag(l) !== null);
  const named = releaseTagFor({ sha, prTitle, tags, tagsOnSha });
  if (named.code) {
    log(`${named.code}: pull request #${prNumber} ${JSON.stringify(prTitle)} gives no release name`);
    return stop(named.code, { prNumber });
  }
  const { tag, resume } = named;

  // 8. EZD-023a's migration check with EZD-153's scratch database, in-process, against the previous release tag.
  const argv = ['--root', opts.root, '--head', sha];
  const base = previousReleaseTag(tags, tag);
  if (base !== null) argv.push('--base', base);
  let checkResult;
  try {
    checkResult = checkMigrations(argv, (line) => log(line), { scratch: deps.scratchCheck });
  } catch {
    log('migration_check_failed: the migration check could not run');
    return stop('migration_check_failed', { prNumber, tag, resume });
  }
  if (checkResult !== 0) {
    log('migration_check_failed');
    return stop('migration_check_failed', { prNumber, tag, resume });
  }

  // 9. The Vercel build of this commit.
  const notices = [];
  const stopV = (code, extra = {}) => stop(code, { prNumber, tag, resume, notices, ...extra });
  let project;
  try {
    project = await vercel.getProject();
  } catch (err) {
    log(`vercel_api_failed: ${err instanceof Error ? err.message : 'request failed'}`);
    return stopV('vercel_api_failed');
  }
  const projectVerdict = evaluateVercelProject(project);
  if (!projectVerdict.ok) {
    log(`${projectVerdict.code}: the Vercel project settings are not as the release needs`);
    return stopV(projectVerdict.code);
  }

  const notice = (code, date) => {
    notices.push(code);
    summary(NOTICE_LINES[code](date));
  };
  try {
    const { expiresAt } = await vercel.tokenInfo();
    if (expiresAt === null) notice('vercel_token_no_expiry');
    else if (expiresAt - Number(now()) < TOKEN_WARN_MS) {
      notice('vercel_token_expiring', new Date(expiresAt).toISOString().slice(0, 10));
    }
  } catch {
    notice('vercel_token_expiry_unknown');
  }

  const start = Number(now());
  let deploymentId = null;
  for (;;) {
    let found = null;
    try {
      found = await vercel.findProductionDeployment(sha);
    } catch (err) {
      log(`waiting for the build: ${err instanceof Error ? err.message : 'request failed'}`);
    }
    if (found && found.state === 'READY') {
      deploymentId = found.id;
      break;
    }
    if (found && !['BUILDING', 'QUEUED', 'INITIALIZING'].includes(found.state)) {
      const state = typeof found.state === 'string' && BUILD_STATE_RE.test(found.state) ? found.state : 'unknown';
      log(`build_failed: the build of ${sha} ended ${state}`);
      return stopV('build_failed');
    }
    if (Number(now()) - start >= BUILD_WAIT_MS) {
      log(`no_build: no READY production build of ${sha} within 900 seconds`);
      return stopV('no_build');
    }
    await sleep(BUILD_POLL_MS);
  }

  let previous;
  try {
    previous = await vercel.currentProductionDeployment();
  } catch (err) {
    log(`vercel_api_failed: ${err instanceof Error ? err.message : 'request failed'}`);
    return stopV('vercel_api_failed', { deploymentId });
  }
  const previousDeploymentId = previous?.id ?? null;
  const alreadyLive = previous?.id === deploymentId;
  const built = { deploymentId, previousDeploymentId, alreadyLive };

  // 10. Vercel values (skipped when this build is already live).
  if (!alreadyLive) {
    let requiredNames;
    try {
      requiredNames = envExampleNames(git(['show', `${sha}:.env.example`]));
    } catch {
      const problems = [{ code: 'env_example_invalid', name: '.env.example', target: null }];
      log('env_mismatch: env_example_invalid .env.example');
      summary(problemLine(problems[0]));
      return stopV('env_mismatch', { problems, ...built });
    }
    const prodRef = supabaseRefFromDbUrl(processEnv.BACKUP_SOURCE_DB_URL);
    let entries;
    try {
      entries = await vercel.listEnv();
    } catch (err) {
      log(`vercel_api_failed: ${err instanceof Error ? err.message : 'request failed'}`);
      return stopV('vercel_api_failed', built);
    }
    const envs = [];
    for (const entry of entries) {
      const item = { key: entry.key, target: entry.target };
      const targets = Array.isArray(entry.target) ? entry.target : [entry.target];
      const wanted = DECRYPTED_ENTRIES.some((d) => d.key === entry.key && targets.includes(d.target));
      if (wanted) {
        try {
          item.value = await vercel.readEnvValue(entry.id);
        } catch {
          item.value = null;
        }
      }
      envs.push(item);
    }
    const verdict = evaluateVercelEnv({ envs, requiredNames, prodRef });
    if (!verdict.ok) {
      log(`env_mismatch: ${verdict.problems.map((p) => `${p.code} ${p.name} ${p.target ?? ''}`.trim()).join('; ')}`);
      for (const p of verdict.problems) summary(problemLine(p));
      return stopV('env_mismatch', { problems: verdict.problems, ...built });
    }
  }

  // 11–15 (EZD-023d Step 5 A–F), skipped when this build is already live (archived step 9). Child output
  // reaches the log only through `safeLines` over the mask list; no error message of a child is printed.
  let dumpPrefix;
  let dumpFiles;
  let uploader = null;
  let startedAt = null;
  if (!alreadyLive) {
    const dbUrl = processEnv.BACKUP_SOURCE_DB_URL;
    const masked = [...valuesToMask(processEnv), ...rawSecrets(processEnv)];
    const childLines = (err) => {
      const text = typeof err?.stderr === 'string' ? err.stderr.replace(/\r?\n$/, '') : '';
      if (text === '') return;
      for (const line of safeLines(text.split(/\r?\n/), masked).slice(-CHILD_LINES_MAX)) log(`  | ${line}`);
    };
    const fail = (code, err) => {
      log(code);
      childLines(err);
      return stopV(code, built);
    };
    const partlyUpdated = (code, err) => {
      log(code);
      childLines(err);
      summary(PARTLY_UPDATED_LINE(code, dumpPrefix));
      return { ok: false, code, prNumber, tag, resume, notices, ...built, dumpPrefix, dumpFiles };
    };

    let tmp = null;
    const worktree = () => path.join(tmp, 'wt');
    try {
      // A. The commit's worktree: migrations and the bootstrap file come from the commit only.
      try {
        tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-release-'));
        git(['worktree', 'add', '--detach', worktree(), sha]);
      } catch {
        return fail('pending_check_failed');
      }

      // B. Tenant 1 and the timeout probe on the same URL the migrations use.
      let tenantPresent;
      try {
        const { stdout } = await sql(TENANT_CHECK_SQL, { dbUrl: withTimeouts(dbUrl) });
        const m = TENANT_CHECK_RE.exec(String(stdout).trim());
        if (!m) return fail('tenant_check_failed');
        tenantPresent = m[1] === '1';
        if (m[2] !== '5000' || m[3] !== '300000') return fail('migrate_timeouts_not_applied');
      } catch (err) {
        return fail('tenant_check_failed', err);
      }
      let bootstrapSql = null;
      const ownerEmail = processEnv.TENANT1_OWNER_EMAIL;
      if (!tenantPresent) {
        let fileText = '';
        try {
          fileText = readFileSync(path.join(worktree(), BOOTSTRAP_PATH), 'utf8');
        } catch {
          fileText = '';
        }
        try {
          bootstrapSql = renderBootstrap(fileText, ownerEmail);
        } catch (err) {
          return fail(err?.code === 'owner_email_missing' ? 'owner_email_missing' : 'bootstrap_file_invalid');
        }
      } else if (typeof ownerEmail === 'string' && ownerEmail.trim() !== '') {
        notice('owner_email_secret_unused');
      }

      // C. The pending migrations, file names only.
      try {
        const out = await supabase.pushDryRun({ dbUrl, workdir: worktree() });
        const pending = parsePendingMigrations(out);
        if (pending.length === 0) log('pending migrations: none');
        for (const name of pending) log(`pending migration: ${name}`);
      } catch (err) {
        return fail('pending_check_failed', err);
      }

      // D. The dump, off-site under releases/ with the release key, before any migration.
      startedAt = Number(now());
      dumpPrefix = `releases/${tag}-${stampOf(startedAt)}/`;
      let files;
      try {
        ({ files } = await dumpDatabase({ dbUrl, outDir: path.join(tmp, 'dump'), supabase }));
      } catch (err) {
        log(`dump_failed: ${err?.detail ?? 'unknown'}`);
        childLines(err);
        return stopV('dump_failed', built);
      }
      dumpFiles = files.map(({ name, size, sha256 }) => ({ name, size, sha256 }));
      try {
        uploader = offsite({
          endpoint: processEnv.BACKUP_S3_ENDPOINT,
          region: processEnv.BACKUP_S3_REGION,
          bucket: processEnv.BACKUP_S3_BUCKET,
          accessKeyId: processEnv.RELEASE_S3_ACCESS_KEY_ID,
          secretAccessKey: processEnv.RELEASE_S3_SECRET_ACCESS_KEY,
        });
        for (const f of files) {
          await uploader.putFile(dumpPrefix + f.name, f.path, { contentType: 'application/sql' });
        }
        await uploader.putJson(`${dumpPrefix}manifest.json`, {
          format: 1,
          created_at: new Date(startedAt).toISOString(),
          source_ref: supabaseRefFromDbUrl(dbUrl),
          newest_migration: newestMigrationIn(worktree()),
          files: dumpFiles,
        });
      } catch {
        log('dump_upload_failed');
        summary(UPLOAD_FAILED_LINE(dumpPrefix));
        return { ok: false, code: 'dump_upload_failed', prNumber, tag, resume, notices, ...built, dumpPrefix, dumpFiles };
      }
      summary(DUMP_SAVED_LINE(dumpPrefix));

      // E. The migrations, with the lock and statement timeouts.
      try {
        await supabase.push({ dbUrl, workdir: worktree(), ...MIGRATION_TIMEOUTS });
      } catch (err) {
        return partlyUpdated('migrate_failed', err);
      }

      // F. Tenant 1, on the first release only. The rendered SQL goes on stdin and nowhere else.
      if (bootstrapSql !== null) {
        let done = false;
        let err = null;
        let out = null;
        try {
          const r = await sql(bootstrapSql, { dbUrl });
          out = r;
          done = `${r?.stdout ?? ''}${r?.stderr ?? ''}`.includes('ezd_bootstrap_done');
        } catch (e) {
          err = e;
          done = `${e?.message ?? ''}${e?.stdout ?? ''}${e?.stderr ?? ''}`.includes('ezd_bootstrap_already_done');
        }
        if (!done) return partlyUpdated('bootstrap_failed', err ?? out);
      }
    } finally {
      if (tmp !== null) {
        try {
          git(['worktree', 'remove', '--force', worktree()]);
        } catch {
          // The worktree may not exist; the folder is removed below either way.
        }
        try {
          git(['worktree', 'prune']);
        } catch {
          // Ignored: cleanup never changes the outcome.
        }
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }

  // EZD-023e Step 1 G–I. No error text of github, vercel, fetch, checkLive or the uploader is printed.
  let rolledBack = false;
  const resultOf = (ok, code) => ({
    ok,
    code,
    tag,
    prNumber,
    resume,
    ...built,
    ...(dumpPrefix !== undefined ? { dumpPrefix, dumpFiles } : {}),
    rolledBack,
    notices,
  });
  const finish = async (ok, code) => {
    // I. Record, through D's uploader, only when this run made a dump.
    if (dumpPrefix !== undefined && uploader !== null) {
      const record = {
        tag,
        sha,
        previous_tag: base,
        pr_number: prNumber,
        deployment_id: deploymentId,
        previous_deployment_id: previousDeploymentId,
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date(Number(now())).toISOString(),
        result: code,
        rolled_back: rolledBack,
        dump_files: dumpFiles,
      };
      try {
        await uploader.putJson(`${dumpPrefix}release.json`, record);
      } catch {
        log('record_failed');
      }
    } else {
      log('record skipped: no dump in this run');
    }
    return resultOf(ok, code);
  };

  // G. Tag, then go live (skipped when this build is already live).
  if (!alreadyLive) {
    if (base !== null && previousDeploymentId === null) notice('previous_deployment_unknown');
    if (!resume) {
      try {
        await github.createTag(tag, sha, `Release ${tag} (#${prNumber})`);
      } catch {
        log('tag_failed');
        const result = await finish(false, 'tag_failed');
        summary(TAG_FAILED_LINE(dumpPrefix));
        return result;
      }
    }
    try {
      await vercel.promote(deploymentId);
    } catch {
      log('promote_failed');
      const result = await finish(false, 'promote_failed');
      summary(PROMOTE_FAILED_LINE(tag));
      return result;
    }
  }

  // H. Verify: health with this commit's newest migration, then EZD-003's live check.
  let expected = null;
  try {
    for (const line of git(['ls-tree', '--name-only', sha, 'supabase/migrations/']).split(/\r?\n/)) {
      const m = MIGRATION_FILE_RE.exec(path.posix.basename(line.trim()));
      if (m && (expected === null || m[1] > expected)) expected = m[1];
    }
  } catch {
    expected = null;
  }
  const pollHealth = async (passes) => {
    const start = Number(now());
    let tries = 0;
    for (;;) {
      tries += 1;
      let ok = false;
      try {
        const res = await fetch(HEALTH_URL, { method: 'GET', signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS) });
        ok = await passes(res);
      } catch {
        ok = false;
      }
      if (ok) return { ok: true, tries };
      if (Number(now()) - start >= VERIFY_LIMIT_MS) return { ok: false, tries };
      await sleep(VERIFY_INTERVAL_MS);
    }
  };
  const health = await pollHealth(async (res) => res.status === 200 && (await res.json()).schema_version === expected);
  let verified = health.ok;
  if (health.ok) {
    log('health ok');
    let live = null;
    try {
      live = await checkLive();
      verified = live.ok === true;
    } catch {
      verified = false;
    }
    if (!verified) {
      const results = Array.isArray(live?.results) ? live.results : [];
      const ids = results.filter((r) => r?.pass === false).map((r) => r.id);
      log(`live check failed: ${ids.join(', ')}`);
    }
  } else {
    log(`health not ok after ${health.tries} tries`);
  }

  if (!verified) {
    log('verify_failed');
    let line = VERIFY_NO_EARLIER_LINE;
    if (previousDeploymentId !== null && previousDeploymentId !== deploymentId) {
      try {
        await vercel.promote(previousDeploymentId);
        rolledBack = true;
      } catch {
        rolledBack = false;
      }
      if (rolledBack) {
        line = VERIFY_ROLLED_BACK_LINE;
        const back = await pollHealth(async (res) => res.status === 200);
        log(back.ok ? 'rollback health ok' : 'rollback health not ok');
      } else {
        line = VERIFY_ROLLBACK_FAILED_LINE;
      }
    }
    const result = await finish(false, 'verify_failed');
    summary(line);
    return result;
  }

  const result = await finish(true, 'released');
  summary(RELEASED_LINE(tag, prNumber));
  return result;
}

/** Every non-empty release secret and GITHUB_TOKEN, for the child-output mask list (Step 5). */
function rawSecrets(env) {
  const out = [];
  for (const name of [...RELEASE_SECRET_NAMES, 'GITHUB_TOKEN']) {
    const v = env[name];
    if (typeof v === 'string' && v !== '') out.push(v);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const out = (line) => process.stdout.write(`${line}\n`);
  const root = process.cwd();
  const deps = {
    processEnv: process.env,
    git: createGit(root),
    github: createGitHubApi({
      token: process.env.GITHUB_TOKEN,
      repo: process.env.GITHUB_REPOSITORY,
      fetch: globalThis.fetch,
    }),
    vercel: lazyVercel(),
    // None of these reads process.env until it is called (part c's lazy-dep rule).
    supabase: createSupabaseCli({ root: process.cwd() }),
    sql: createSql({ run: runChild }),
    offsite: createOffsiteUploader,
    fetch: globalThis.fetch,
    checkLive: async () => evaluate(await observe(HOST)),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: out,
    summary: (line) => {
      const file = process.env.GITHUB_STEP_SUMMARY;
      if (file) appendFileSync(file, `${line}\n`);
    },
    mask: (value) => {
      for (const line of maskCommands(value)) out(line);
    },
  };
  let code = 'internal_error';
  let ok = false;
  try {
    const result = await runRelease({ root }, deps);
    code = result.code;
    ok = result.ok === true;
  } catch {
    code = 'internal_error';
    ok = false;
  }
  out(`release ${code}`);
  process.exitCode = ok ? 0 : 1;
}
