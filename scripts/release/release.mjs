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
import { createGitHubApi, evaluateEnvironmentRule } from './github-api.mjs';
import { main as checkMigrations } from './check-migrations.mjs';
import { releaseTagFor } from './release-name.mjs';
import { listReleaseTags, parseReleaseTag, previousReleaseTag } from './tags.mjs';

// Section 6 wording (job summary lines).
const NOT_CONFIGURED_LINE = 'production not configured — nothing released';
const stoppedLine = (code) => `release stopped: ${code} — nothing changed`;
const missingLine = (names) => `missing in the release environment: ${names.join(', ')}`;

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

export async function runRelease(opts, deps) {
  const { processEnv, git, github, log, summary, mask } = deps;
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

  // 9. Interim until EZD-023e (Q-0157): the steps after the migration check are not built yet.
  log('not_built: the release steps after the migration check are added by EZD-023c, EZD-023d and EZD-023e');
  return stop('not_built', { prNumber, tag, resume });
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
