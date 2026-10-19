#!/usr/bin/env node
// EZD-023b Step 4 (vault/plans/EZD-023b.md): the release runner, steps 1–8 (context, presence and masking, tip,
// merged pull request, environment rule, release name, EZD-023a's migration check) and its CLI. Node 22
// built-ins only. Parts EZD-023c–e add the steps after the migration check; until then every run that gets
// past step 8 ends `not_built`. Nothing runs this file before EZD-023e adds the workflow (Q-0157).
//
// `runRelease(opts, deps)` reads `deps.processEnv` one name at a time, never enumerating it, and reads no
// release name and not GITHUB_TOKEN before the context guards pass (AC-EZD-023b-2). No log line is written
// before step 2's masking except the refusal lines of steps 1–2 (archived plan Step 4 "Masking").
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkPresence, checkReleaseContext, maskCommands, valuesToMask } from './context.mjs';
import { DECRYPTED_ENTRIES, envExampleNames, evaluateVercelEnv, supabaseRefFromDbUrl } from './env-check.mjs';
import { createGitHubApi, evaluateEnvironmentRule } from './github-api.mjs';
import { main as checkMigrations } from './check-migrations.mjs';
import { releaseTagFor } from './release-name.mjs';
import { listReleaseTags, parseReleaseTag, previousReleaseTag } from './tags.mjs';
import { createVercelApi, evaluateVercelProject } from './vercel-api.mjs';

// Section 6 wording (job summary lines).
const NOT_CONFIGURED_LINE = 'production not configured — nothing released';
const stoppedLine = (code) => `release stopped: ${code} — nothing changed`;
const missingLine = (names) => `missing in the release environment: ${names.join(', ')}`;
const problemLine = ({ code, name, target }) =>
  `Vercel value problem: ${code} ${name}${target ? ` (${target})` : ''}`;
const NOTICE_LINES = {
  vercel_token_expiring: (date) =>
    `notice vercel_token_expiring: the Vercel token expires on ${date}; make a new one and replace VERCEL_TOKEN in the release environment`,
  vercel_token_no_expiry: () =>
    'notice vercel_token_no_expiry: the Vercel token never expires; make one that expires in 90 days',
  vercel_token_expiry_unknown: () =>
    'notice vercel_token_expiry_unknown: could not read when the Vercel token expires',
};
const TOKEN_WARN_MS = 14 * 86_400_000;
const BUILD_WAIT_MS = 900_000;
const BUILD_POLL_MS = 10_000;

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
  const { processEnv, git, github, vercel, sleep, now, log, summary, mask } = deps;
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
    log(`${named.code}: pull request #${prNumber} "${prTitle}" gives no release name`);
    return stop(named.code, { prNumber });
  }
  const { tag, resume } = named;

  // 8. EZD-023a's migration check, in-process, against the previous release tag.
  const argv = ['--root', opts.root, '--head', sha];
  const base = previousReleaseTag(tags, tag);
  if (base !== null) argv.push('--base', base);
  let checkResult;
  try {
    checkResult = checkMigrations(argv, (line) => log(line));
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
      log(`build_failed: the build of ${sha} ended ${found.state}`);
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

  // Interim until EZD-023e (Q-0157): the steps after this one are not built yet.
  log('not_built: the release steps after the migration check are added by EZD-023c, EZD-023d and EZD-023e');
  return stopV('not_built', built);
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
