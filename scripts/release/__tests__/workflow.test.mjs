// EZD-023e T16, T17 (vault/plans/EZD-023e.md section 4). node:test, Node 22 built-ins only, no YAML package.
// The workflow is read as lines and checked by `checkReleaseWorkflow` (defined here); the samples are the real
// file with one change each (lesson L-006), so a checker that accepts everything fails its own test.
// Expected values come from the plan's Step 2 (the whole file), Q-0106, Q-0158 (a), findings V3, V4 and the
// ticket's Done when (AC-EZD-023e-3).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './git-fixture.mjs';

const RELEASE_YML = path.join(REPO_ROOT, '.github', 'workflows', 'release.yml');
const SUPABASE_DEV_YML = path.join(REPO_ROOT, '.github', 'workflows', 'supabase-dev.yml');
const loadContext = () => import('../context.mjs');

// ---------------------------------------------------------------------------------------------------------------
// Line parser: blank lines and comment-only lines dropped, trailing ` # comment` stripped.
// ---------------------------------------------------------------------------------------------------------------
function parseLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    const stripped = raw.replace(/\s+#.*$/, '').trimEnd();
    out.push({ indent: raw.length - raw.trimStart().length, text: stripped.trim() });
  }
  return out;
}
/** The lines nested under `ls[i]` (indent greater than its own, up to the next line at or above it). */
function kidsOf(ls, i) {
  const kids = [];
  for (let j = i + 1; j < ls.length && ls[j].indent > ls[i].indent; j += 1) kids.push(ls[j]);
  return kids;
}
const KEY_RE = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** Splits a `steps:` block into items; each item is { keys: [{ k, v, kids: [text] }] }. */
function parseSteps(kids) {
  if (kids.length === 0) return [];
  const itemIndent = Math.min(...kids.map((l) => l.indent));
  const items = [];
  for (const l of kids) {
    if (l.indent === itemIndent) {
      if (!l.text.startsWith('- ')) return null;
      items.push({ keys: [] });
      const m = KEY_RE.exec(l.text.slice(2));
      if (!m) return null;
      items.at(-1).keys.push({ k: m[1], v: m[2], kids: [] });
    } else if (l.indent === itemIndent + 2) {
      const m = KEY_RE.exec(l.text);
      if (!m) return null;
      items.at(-1).keys.push({ k: m[1], v: m[2], kids: [] });
    } else {
      items.at(-1).keys.at(-1).kids.push(l.text);
    }
  }
  return items;
}

/** Returns the list of problems found in a release workflow text (empty = accepted). */
function checkReleaseWorkflow(text, { pins, pnpmVersion, secretNames }) {
  const problems = [];
  const bad = (m) => problems.push(m);
  const ls = parseLines(text);
  const at = (pred) => ls.findIndex(pred);

  // Top level.
  const top = ls.filter((l) => l.indent === 0).map((l) => l.text);
  if (!sameSet(top, ['name: Release', 'on:', 'permissions: {}', 'concurrency:', 'jobs:'])) {
    bad(`top-level lines: ${JSON.stringify(top)}`);
  }

  // on:
  const onAt = at((l) => l.indent === 0 && l.text === 'on:');
  if (onAt >= 0) {
    const kids = kidsOf(ls, onAt).map((l) => l.text);
    const ok =
      JSON.stringify(kids) === JSON.stringify(['push:', 'branches: [main]']) ||
      JSON.stringify(kids) === JSON.stringify(['push:', 'branches:', '- main']);
    if (!ok) bad(`on: holds ${JSON.stringify(kids)}`);
  }

  // concurrency:
  const cAt = at((l) => l.indent === 0 && l.text === 'concurrency:');
  if (cAt >= 0) {
    const kids = kidsOf(ls, cAt).map((l) => l.text);
    if (!sameSet(kids, ['group: release-production', 'cancel-in-progress: false'])) {
      bad(`concurrency holds ${JSON.stringify(kids)}`);
    }
  }

  // jobs: one job `release`.
  const jAt = at((l) => l.indent === 0 && l.text === 'jobs:');
  if (jAt >= 0) {
    const jobsKids = kidsOf(ls, jAt);
    const jobIndent = jobsKids.length ? Math.min(...jobsKids.map((l) => l.indent)) : 0;
    const jobNames = jobsKids.filter((l) => l.indent === jobIndent).map((l) => l.text);
    if (!sameSet(jobNames, ['release:'])) bad(`jobs: ${JSON.stringify(jobNames)}`);
    const relAt = ls.indexOf(jobsKids.find((l) => l.text === 'release:'));
    if (relAt >= 0) {
      const body = kidsOf(ls, relAt);
      const bodyIndent = body.length ? Math.min(...body.map((l) => l.indent)) : 0;
      const keyLines = body.filter((l) => l.indent === bodyIndent);
      const keyNames = keyLines.map((l) => (KEY_RE.exec(l.text) ?? [])[1]);
      if (!sameSet(keyNames, ['if', 'runs-on', 'timeout-minutes', 'environment', 'permissions', 'steps'])) {
        bad(`job keys: ${JSON.stringify(keyNames)}`);
      }
      const keyText = (name) => keyLines.find((l) => (KEY_RE.exec(l.text) ?? [])[1] === name)?.text;
      const ifText = keyText('if') ?? '';
      if (!ifText.includes('refs/heads/main') || !ifText.includes("github.event_name == 'push'")) {
        bad(`job if: ${ifText}`);
      }
      if (keyText('runs-on') !== 'runs-on: ubuntu-latest') bad(`runs-on: ${keyText('runs-on')}`);
      if (keyText('timeout-minutes') !== 'timeout-minutes: 45') bad(`timeout: ${keyText('timeout-minutes')}`);
      const blockKids = (name) => {
        const l = keyLines.find((x) => (KEY_RE.exec(x.text) ?? [])[1] === name);
        if (!l || l.text !== `${name}:`) return null;
        return kidsOf(ls, ls.indexOf(l)).map((x) => x.text);
      };
      const env = blockKids('environment');
      if (!env || !sameSet(env, ['name: release', 'url: https://ezdraft.ezcontractorbinder.com'])) {
        bad(`environment: ${JSON.stringify(env)}`);
      }
      const perms = blockKids('permissions');
      if (!perms || !sameSet(perms, ['contents: write', 'pull-requests: read', 'actions: read'])) {
        bad(`job permissions: ${JSON.stringify(perms)}`);
      }
      const stepsLine = keyLines.find((l) => l.text === 'steps:');
      const steps = stepsLine ? parseSteps(kidsOf(ls, ls.indexOf(stepsLine))) : null;
      if (!steps || steps.length !== 5) {
        bad(`steps: ${steps ? steps.length : 'unreadable'} items`);
      } else {
        const keysOf = (s) => s.keys.map((x) => x.k).filter((k) => k !== 'name');
        const get = (s, k) => s.keys.find((x) => x.k === k);
        const [s1, s2, s3, s4, s5] = steps;
        if (!sameSet(keysOf(s1), ['uses', 'with'])) bad('step 1 keys');
        else {
          if (get(s1, 'uses').v !== pins[0]) bad('step 1 uses is not the supabase-dev checkout pin');
          if (!sameSet(get(s1, 'with').kids, ['fetch-depth: 0', 'persist-credentials: false'])) bad('step 1 with');
        }
        if (!sameSet(keysOf(s2), ['uses', 'with'])) bad('step 2 keys');
        else {
          if (get(s2, 'uses').v !== pins[1]) bad('step 2 uses is not the supabase-dev setup-node pin');
          if (!sameSet(get(s2, 'with').kids, ['node-version: 22'])) bad('step 2 with');
        }
        if (!sameSet(keysOf(s3), ['run']) || get(s3, 'run').v !== `npm install -g pnpm@${pnpmVersion}`) {
          bad('step 3 is not the pnpm install line');
        }
        if (!sameSet(keysOf(s4), ['run']) || get(s4, 'run').v !== 'pnpm install --frozen-lockfile') {
          bad('step 4 is not exactly pnpm install --frozen-lockfile');
        }
        if (!sameSet(keysOf(s5), ['run', 'env']) || get(s5, 'run').v !== 'node scripts/release/release.mjs') {
          bad('step 5 is not the release script with an env');
        } else {
          const expected = ['GITHUB_TOKEN: ${{ github.token }}', ...secretNames.map((n) => `${n}: \${{ secrets.${n} }}`)];
          if (!sameSet(get(s5, 'env').kids, expected)) bad('step 5 env is not GITHUB_TOKEN plus the 10 secret names');
        }
      }
    }
  }

  // Everywhere.
  const secretsLines = ls.filter((l) => l.text.includes('secrets'));
  if (secretsLines.length !== secretNames.length) bad(`secrets named on ${secretsLines.length} lines`);
  for (const l of ls) {
    const m = /^(?:- )?uses:\s*(\S+)/.exec(l.text);
    if (m && !/@[0-9a-f]{40}$/.test(m[1])) bad(`uses not pinned to a full sha: ${m[1]}`);
    if (/^(?:- )?run:/.test(l.text) && l.text.includes('${{')) bad(`run line holds an expression: ${l.text}`);
    if (/set -x/.test(l.text)) bad('set -x');
    if (/upload-artifact|actions\/cache|continue-on-error/.test(l.text)) bad(`forbidden: ${l.text}`);
  }
  return problems;
}

/** `uses:` values of a workflow text, in order. */
function usesOf(text) {
  return parseLines(text)
    .map((l) => /^(?:- )?uses:\s*(\S+)/.exec(l.text))
    .filter(Boolean)
    .map((m) => m[1]);
}

const sub = (text, re, to) => {
  const out = text.replace(re, typeof to === 'function' ? to : () => to);
  assert.notEqual(out, text, `the sample change applies: ${re}`);
  return out;
};
const stepIndent = (text) => /^(\s*)- uses: actions\/checkout/m.exec(text)[1];

describe('EZD-023e release workflow', () => {
  // T16 --------------------------------------------------------------------------------------------------------
  test('EZD-023e done when: the release runs only from release.yml on a push to main in the release environment', async () => {
    assert.ok(existsSync(RELEASE_YML), '.github/workflows/release.yml exists');
    const { RELEASE_SECRET_NAMES } = await loadContext();
    const real = readFileSync(RELEASE_YML, 'utf8');
    const pins = usesOf(readFileSync(SUPABASE_DEV_YML, 'utf8'));
    assert.equal(pins.length, 2, 'supabase-dev.yml has the two pinned uses');
    const pnpmVersion = /"packageManager":\s*"pnpm@([^"]+)"/.exec(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))[1];
    const opts = { pins, pnpmVersion, secretNames: [...RELEASE_SECRET_NAMES] };

    assert.deepEqual(checkReleaseWorkflow(real, opts), [], 'the real file has no problems');
    assert.deepEqual(usesOf(real), pins, 'the real file uses exactly the supabase-dev pins');

    // (b) one change each; every sample gives at least one problem.
    const si = stepIndent(real);
    const samples = {
      'permissions: write-all': sub(real, /^permissions: \{\}\s*$/m, 'permissions: write-all'),
      'job permissions contents only': sub(
        sub(real, /^\s+pull-requests: read.*\n/m, ''),
        /^\s+actions: read.*\n/m,
        '',
      ),
      'id-token: write': sub(real, /^(\s+)contents: write.*$/m, (m, ind) => `${m}\n${ind}id-token: write`),
      'concurrency inline': sub(real, /^concurrency:\n(?:[ \t]+.*\n)+/m, 'concurrency: { group: release-production }\n'),
      'environment one line': sub(real, /^(\s+)environment:\n(?:\1[ \t]+.*\n)+/m, (m, ind) => `${ind}environment: release\n`),
      workflow_dispatch: sub(real, /^on:[ \t]*\n/m, 'on:\n  workflow_dispatch:\n'),
      'checkout@v4': sub(real, /(actions\/checkout)@[0-9a-f]{40}/, (m, a) => `${a}@v4`),
      'fetch-depth 1': sub(real, /fetch-depth: 0/, 'fetch-depth: 1'),
      'persist-credentials removed': sub(real, /^.*persist-credentials:.*\n/m, ''),
      'setup-node cache': sub(real, /^(\s+)node-version: 22.*$/m, (m, ind) => `${m}\n${ind}cache: pnpm`),
      'ignore-scripts': sub(real, /pnpm install --frozen-lockfile/, 'pnpm install --frozen-lockfile --ignore-scripts'),
      'pnpm rebuild step': `${real.trimEnd()}\n${si}- run: pnpm rebuild supabase\n`,
      'job-level env': sub(
        real,
        /^(\s+)runs-on: ubuntu-latest.*$/m,
        (m, ind) => `${m}\n${ind}env:\n${ind}  X: \${{ secrets.VERCEL_TOKEN }}`,
      ),
      'secret in a run line': sub(real, /run: pnpm install --frozen-lockfile/, 'run: pnpm install --frozen-lockfile ${{ secrets.VERCEL_TOKEN }}'),
      'BACKUP_S3_ACCESS_KEY_ID added': sub(
        real,
        /^(\s+)GITHUB_TOKEN:.*$/m,
        (m, ind) => `${m}\n${ind}BACKUP_S3_ACCESS_KEY_ID: \${{ secrets.BACKUP_S3_ACCESS_KEY_ID }}`,
      ),
      'RELEASE_S3_SECRET_ACCESS_KEY removed': sub(real, /^.*RELEASE_S3_SECRET_ACCESS_KEY:.*\n/m, ''),
      'set -x': sub(real, /run: node scripts\/release\/release\.mjs/, 'run: set -x; node scripts/release/release.mjs'),
      'upload-artifact step': `${real.trimEnd()}\n${si}- uses: actions/upload-artifact@${'0123456789abcdef'.repeat(2)}01234567\n`,
      'continue-on-error': sub(
        real,
        /^(\s+)run: node scripts\/release\/release\.mjs.*$/m,
        (m, ind) => `${m}\n${ind}continue-on-error: true`,
      ),
      'timeout 60': sub(real, /timeout-minutes: 45/, 'timeout-minutes: 60'),
    };
    for (const [name, sample] of Object.entries(samples)) {
      assert.ok(checkReleaseWorkflow(sample, opts).length > 0, `sample "${name}" gives at least one problem`);
    }
  });

  // T17 --------------------------------------------------------------------------------------------------------
  test('EZD-023e T17 nothing local, nothing in the gate, build scripts denied', () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
      assert.ok(!name.startsWith('release'), `no script named ${name}`);
      if (['typecheck', 'lint', 'test', 'build'].includes(name)) {
        assert.ok(!String(cmd).includes('release.mjs'), `${name} does not run release.mjs`);
      }
    }

    // Every non-test file under scripts/release; what cannot be inspected is counted and must be 0 (L-019).
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '__tests__') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else files.push(p);
      }
    };
    walk(path.join(REPO_ROOT, 'scripts', 'release'));
    assert.ok(files.length > 0, 'scripts/release holds files');
    let uninspectable = 0;
    const texts = new Map();
    for (const p of files) {
      const buf = readFileSync(p);
      if (buf.includes(0)) uninspectable += 1;
      else texts.set(p, buf.toString('utf8'));
    }
    assert.equal(uninspectable, 0, 'every file under scripts/release could be inspected');
    for (const needle of ['DeleteObject', '.env.release.local', 'setRawMode', 'not_built']) {
      const hit = [...texts.values()].filter((t) => t.includes(needle)).length;
      assert.equal(hit, 0, `no file under scripts/release holds ${needle}`);
    }

    // allowBuilds holds only `<name>: false`; no allow-all setting anywhere.
    const wsText = readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    assert.deepEqual(checkAllowBuilds(wsText), [], 'the real pnpm-workspace.yaml passes');
    const checked = [wsText, readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'), ...texts.values()];
    const npmrc = path.join(REPO_ROOT, '.npmrc');
    if (existsSync(npmrc)) checked.push(readFileSync(npmrc, 'utf8'));
    for (const needle of ['dangerouslyAllowAllBuilds', 'onlyBuiltDependencies']) {
      assert.equal(checked.filter((t) => t.includes(needle)).length, 0, `no checked file holds ${needle}`);
    }

    // (b) the checker on samples.
    const block = /^allowBuilds:\n(?:[ \t]+.*\n|\n)*/m;
    const withNl = wsText.endsWith('\n') ? wsText : `${wsText}\n`;
    const samples = {
      'allowBuilds: true': sub(withNl, block, 'allowBuilds: true\n'),
      'allowBuilds inline map': sub(withNl, block, 'allowBuilds: { supabase: true }\n'),
      'supabase: true': sub(withNl, block, 'allowBuilds:\n  supabase: true\n'),
      dangerouslyAllowAllBuilds: `${withNl}dangerouslyAllowAllBuilds: true\n`,
      onlyBuiltDependencies: `${withNl}onlyBuiltDependencies:\n  - supabase\n`,
    };
    for (const [name, sample] of Object.entries(samples)) {
      assert.ok(checkAllowBuilds(sample).length > 0, `sample "${name}" gives at least one problem`);
    }
  });
});

/** Problems in a pnpm-workspace.yaml text: allowBuilds must be a block of `<name>: false` lines only. */
function checkAllowBuilds(text) {
  const problems = [];
  const ls = text.split(/\r?\n/);
  const idx = ls.findIndex((l) => /^allowBuilds:/.test(l));
  if (idx < 0) problems.push('no allowBuilds key');
  else {
    if (ls[idx].replace(/\s+#.*$/, '').trim() !== 'allowBuilds:') problems.push('allowBuilds has an inline value');
    for (let j = idx + 1; j < ls.length; j += 1) {
      const l = ls[j];
      if (l.trim() === '' || l.trim().startsWith('#')) continue;
      if (!/^\s/.test(l)) break;
      if (!/^\s+(?:'[^']+'|"[^"]+"|[A-Za-z0-9_.-]+): false\s*(?:#.*)?$/.test(l)) problems.push(`not a false entry: ${l.trim()}`);
    }
  }
  if (/dangerouslyAllowAllBuilds|onlyBuiltDependencies/.test(text)) problems.push('allow-all or only-built setting');
  return problems;
}
