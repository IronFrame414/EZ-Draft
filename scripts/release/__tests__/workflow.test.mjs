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
// EZD-148 D4, D13: a line the line scanner cannot read is refused, never skipped (L-006). A line holding a quote is
// readable only when it fits one of QUOTE_SHAPES: Q1 a plain key with one single-quoted scalar and at most a quote-free
// comment; Q2 a plain key with a plain scalar holding no '"' and no '#'; Q3 an indented '@scope/name': false entry.
// A line with a character outside tab and printable ASCII, or with an anchor, alias or tag at a node start, is unreadable.
const QUOTE_SHAPES = [
  /^\s*(?:- )?[A-Za-z][A-Za-z0-9_.-]*: '(?:[^'#]|'')*'\s*(?:#[^'"]*)?$/,
  /^\s*(?:- )?[A-Za-z][A-Za-z0-9_.-]*: [A-Za-z0-9$_(][^"#]*$/,
  /^\s+'@[a-z0-9-]+\/[a-z0-9._-]+': false\s*(?:#[^'"]*)?$/,
];
const ASCII_LINE_RE = /^[\t\x20-\x7E]*$/;
const NODE_START_RE = /(?:^\s*(?:-\s+)*|[{,\[]\s*|:\s+|\?\s+)[&*!]/;
function quoteReadable(l) {
  return !/['"]/.test(l) || QUOTE_SHAPES.some((re) => re.test(l));
}
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
          if (!sameSet(get(s2, 'with').kids, ['node-version: 22', 'package-manager-cache: false'])) bad('step 2 with');
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
      'package-manager-cache removed': sub(real, /^.*package-manager-cache: false.*\n/m, ''),
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

// EZD-176 (vault/plans/EZD-176.md sections 3 and 4; AC-EZD-176-1, AC-EZD-176-2). Node 22 built-ins only.
// The four workflows that EZD-023b, EZD-025, EZD-146 and EZD-004c wrote move from the v4.4.0 pins (Node 20, R-020,
// R-021) to the v7 pins of EZD-147 (CI_PINS), and each setup-node `with:` block gains `package-manager-cache: false`
// (EZD-147 section 1 Decided; EZD-148 rule (i) accepts only `false`).
const OLD_PIN_SHAS = ['11d5960a326750d5838078e36cf38b85af677262', '49933ea5288caeca8642d1e84afbd3f7d6820020'];
const NEW_PIN_LINES = [
  '- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  '- uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
];
const PIN_WORKFLOWS = ['release.yml', 'backup-files.yml', 'backup-db.yml', 'supabase-dev.yml'];
const WORKFLOWS_DIR = path.join(REPO_ROOT, '.github', 'workflows');

/** One entry `<sha> at line <n>` (n from 1) per line whose lower-cased text holds a lower-cased old pin SHA. */
function oldPinHits(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    const lower = line.toLowerCase();
    for (const sha of OLD_PIN_SHAS) {
      if (lower.includes(sha)) hits.push(`${sha} at line ${i + 1}`);
    }
  });
  return hits;
}

/** Trimmed text of the lines under the `with:` line at index i: deeper indent, blank lines skipped, stop at the first shallower line. */
function withKids(lines, i) {
  const indentOf = (s) => /^ */.exec(s)[0].length;
  const base = indentOf(lines[i]);
  const kids = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === '') continue;
    if (indentOf(lines[j]) <= base) break;
    kids.push(lines[j].trim());
  }
  return kids;
}

describe('EZD-176 workflow action pins', () => {
  // T1 ----------------------------------------------------------------------------------------------------------
  test('EZD-176 T1 no workflow names a v4.4.0 checkout or setup-node SHA (AC-EZD-176-1) done when', () => {
    // (a) the helper on in-memory samples (lesson L-006): one-line and two-line bad samples, an upper-cased SHA, a clean control.
    const s1 = '      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0\n';
    const s2 = '      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\n';
    const s4 = s1.replace(OLD_PIN_SHAS[0], OLD_PIN_SHAS[0].toUpperCase());
    const c1 = `      ${NEW_PIN_LINES[0]}\n      ${NEW_PIN_LINES[1]}\n`;
    assert.equal(oldPinHits(s1).length, 1, 's1 has one hit');
    assert.equal(oldPinHits(s2).length, 1, 's2 has one hit');
    assert.equal(oldPinHits(s1 + s2).length, 2, 's1 and s2 have two hits');
    assert.equal(oldPinHits(s4).length, 1, 'an upper-cased SHA still hits');
    assert.deepEqual(oldPinHits(c1), [], 'the clean control has no hit');

    // (b) the scan finds the real files; an empty scan fails.
    const names = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));
    assert.ok(names.length >= 5, `at least five workflow files, found ${names.length}`);
    assert.ok(names.includes('ci.yml'), 'ci.yml is scanned');
    for (const file of PIN_WORKFLOWS) assert.ok(names.includes(file), `${file} is scanned`);

    // (c) no real workflow file names an old SHA, comment lines included.
    for (const name of names) {
      const text = readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8');
      assert.deepEqual(oldPinHits(text), [], `${name} names no v4.4.0 pin`);
    }
  });

  // T2 ----------------------------------------------------------------------------------------------------------
  test('EZD-176 T2 the four workflows pin checkout v7.0.1 and setup-node v7.1.0 with no automatic cache (AC-EZD-176-2)', () => {
    for (const file of PIN_WORKFLOWS) {
      const lines = readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8').split('\n');
      // (a) the two uses lines, in order, and nothing else that names a uses.
      const uses = lines.map((l) => l.trim()).filter((l) => !l.startsWith('#') && l.includes('uses:'));
      assert.deepEqual(uses, NEW_PIN_LINES, `${file}: the two pins, checkout then setup-node`);
      // (b) the setup-node `with:` holds node-version 22 and package-manager-cache false, nothing else.
      const p2 = lines.findIndex((l) => l.trim() === NEW_PIN_LINES[1]);
      assert.ok(p2 >= 0, `${file}: the setup-node pin line is present`);
      assert.equal(lines[p2 + 1].trim(), 'with:', `${file}: the line after the setup-node pin is with:`);
      assert.deepEqual(
        withKids(lines, p2 + 1),
        ['node-version: 22', 'package-manager-cache: false'],
        `${file}: the setup-node with block`,
      );
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
  // EZD-148 R3: the pnpm `permissions` setting (pnpm 12.11) overrides allowBuilds, so the key is refused anywhere;
  // a line the scan cannot read (explicit `?` key, D4 quote shapes, D4 node starts, D13 non-ASCII) is refused too.
  let perm = false;
  let unreadable = false;
  for (const l of ls) {
    const ascii = ASCII_LINE_RE.test(l);
    if (ascii && l.trim().startsWith('#')) continue;
    const readable = ascii && !/^(-\s+)?\?(\s|$)/.test(l.trim()) && quoteReadable(l) && !NODE_START_RE.test(l.replace(/[ \t]+#.*$/, ''));
    const body = readable ? l.replace(/[ \t]+#.*$/, '') : l;
    if (/(^|[\s{,?\[])["']?permissions["']?\s*:/i.test(body)) perm = true;
    if (!readable) unreadable = true;
  }
  if (perm) problems.push('permissions setting');
  if (unreadable) problems.push('unreadable quoting');
  return problems;
}

// EZD-148 T3 (vault/plans/EZD-148.md section 4). The expected value comes from D8 (the pnpm `permissions` setting overrides
// `allowBuilds`, pnpm 12.14.0 CHANGELOG 12.11.0) and Q-0158 (a); the base is the real pnpm-workspace.yaml (same as T17).
describe('EZD-148 release build settings', () => {
  test('EZD-148 T3 release build-settings check refuses permissions (AC-EZD-148-1)', () => {
    const wsText = readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    const withNl = wsText.endsWith('\n') ? wsText : `${wsText}\n`;
    const samples = {
      r1: `${withNl}permissions:\n  esbuild:\n    build: true\n`,
      r2: `${withNl}"permissions": {}\n`,
      // r11: a key right after `[` (plan D13)
      r11: '{ packages: [permissions: {}] }\n',
    };
    for (const [name, sample] of Object.entries(samples)) {
      assert.ok(checkAllowBuilds(sample).includes('permissions setting'), `sample ${name} gives the problem "permissions setting"`);
    }
    // security review 2026-10-25 finding 1 and plan D4: quoting the line scanner cannot read is refused.
    const quoting = {
      // r3: the key is split by an escaped line break; the first text line `"permi\` ends with one backslash
      r3: `${withNl}"permi\\\n ssions": {}\n`,
      // r4: a ` #` inside a quoted scalar leaves an open quote in the comment-stripped line
      r4: `${withNl}{ x: 'a #', permissions: {} }\n`,
      // r5: a \ escape inside double quotes; the text line is `x: "a\tb"` with one backslash
      r5: `${withNl}x: "a\\tb"\n`,
      // r6, r7: a stray quote in a plain scalar must not pair with the opener of a real quoted scalar (round 2, plan D4)
      r6: "{ packages: [app], x: a'b, y: 'c #', permissions: { esbuild: { build: true } } }\n",
      r7: `${withNl}x: { a: a'b, b: 'c #', permissions: { esbuild: { build: true } } }\n`,
      // r8: the round-1 control c8 fits no quote shape (plan D4); the text line is `x: "ok" # it's`
      r8: `${withNl}x: "ok" # it's\n`,
      // r9: an explicit `?` key (plan D4)
      r9: `${withNl}? permissions\n: {}\n`,
      // r10: a no-break space (U+00A0) before `#` is not YAML white space (plan D13)
      r10: '{ packages: [app], x: a\u00A0#, permissions: { esbuild: { build: true } } }\n',
      // r12, r13: an anchored scalar reused as an alias key (round 4, plan D4 NODE_START_RE)
      r12: `${withNl}x: &k permissions\n*k : { esbuild: { build: true } }\n`,
      r13: '{ packages: [app], x: &k permissions, *k : { esbuild: { build: true } } }\n',
    };
    for (const [name, sample] of Object.entries(quoting)) {
      assert.ok(checkAllowBuilds(sample).includes('unreadable quoting'), `sample ${name} gives the problem "unreadable quoting"`);
    }
    assert.deepEqual(checkAllowBuilds(`${withNl}# permissions: x\n`), [], 'control: a commented permissions line is no problem');
    // c8: shape Q1, a single-quoted scalar then a quote-free comment (plan D4)
    assert.deepEqual(checkAllowBuilds(`${withNl}x: 'ok' # a comment\n`), [], 'c8: a single-quoted value then a quote-free comment is no problem');
  });
});
