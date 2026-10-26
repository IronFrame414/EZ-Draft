// EZD-002 T1-T6 (vault/plans/EZD-002.md sections 3 and 4). Offline; Node built-ins only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workflowsDir = path.join(repo, '.github', 'workflows');

const readLines = (file) => readFileSync(file, 'utf8').split(/\r?\n/);
const trimmed = (file) => readLines(file).map((l) => l.trim());
const indentOf = (l) => l.length - l.trimStart().length;
const isBlankOrComment = (l) => l.trim() === '' || l.trim().startsWith('#');
const stripQuotes = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');
const stripComment = (s) => s.replace(/\s+#.*$/, '');

// ---------- workflow checker (line based, no YAML package) ----------

// Lines nested under the line at index i (indent greater than line i's), blank/comment lines skipped.
function children(lines, i) {
  const base = indentOf(lines[i]);
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (isBlankOrComment(lines[j])) continue;
    if (indentOf(lines[j]) <= base) break;
    out.push({ idx: j, text: lines[j] });
  }
  return out;
}

// Triggers of a file: { name -> { form: 'block'|'scalar', lineIdx, rest } }; `brace` is true for `on: { ... }`.
function readTriggers(lines) {
  const triggers = {};
  let brace = false;
  const onIdx = lines.findIndex((l) => /^["']?on["']?\s*:/.test(l));
  if (onIdx < 0) return { triggers, brace };
  const rest = stripComment(lines[onIdx].replace(/^["']?on["']?\s*:/, '')).trim();
  if (rest.startsWith('{')) return { triggers, brace: true };
  if (rest) {
    const names = rest.replace(/^\[|\]$/g, '').split(',').map((s) => stripQuotes(s)).filter(Boolean);
    for (const n of names) triggers[n] = { form: 'scalar', lineIdx: onIdx };
    return { triggers, brace };
  }
  const kids = children(lines, onIdx);
  if (!kids.length) return { triggers, brace };
  const base = indentOf(kids[0].text);
  for (const k of kids) {
    if (indentOf(k.text) !== base) continue;
    const m = /^\s*["']?([A-Za-z_][\w-]*)["']?\s*:(.*)$/.exec(k.text);
    if (m) triggers[m[1]] = { form: 'block', lineIdx: k.idx, rest: stripComment(m[2]).trim() };
  }
  return { triggers, brace };
}

// Values of a key under a trigger: flow list, one scalar, or "- item" lines. Returns null if the key is absent.
function readKey(lines, triggerIdx, key) {
  const kids = children(lines, triggerIdx);
  const at = kids.findIndex((k) => new RegExp(`^\\s*${key}\\s*:`).test(k.text));
  if (at < 0) return null;
  const rest = stripComment(kids[at].text.replace(new RegExp(`^\\s*${key}\\s*:`), '')).trim();
  if (rest) {
    return rest.replace(/^\[|\]$/g, '').split(',').map((s) => stripQuotes(s)).filter(Boolean);
  }
  const keyIndent = indentOf(kids[at].text);
  const vals = [];
  for (let j = at + 1; j < kids.length; j++) {
    if (indentOf(kids[j].text) <= keyIndent) break;
    const m = /^\s*-\s*(.*)$/.exec(stripComment(kids[j].text));
    if (m) vals.push(stripQuotes(m[1]));
  }
  return vals;
}

// { values: [string], brace: boolean } for every `environment:` key.
function environmentsOf(lines) {
  const values = [];
  let brace = false;
  lines.forEach((l, i) => {
    const m = /^\s*environment\s*:(.*)$/.exec(l);
    if (!m || l.trim().startsWith('#')) return;
    const rest = stripComment(m[1]).trim();
    if (rest.startsWith('{')) { brace = true; return; }
    if (rest) { values.push(stripQuotes(rest)); return; }
    for (const k of children(lines, i)) {
      const n = /^\s*name\s*:(.*)$/.exec(k.text);
      if (n) values.push(stripQuotes(stripComment(n[1])));
    }
  });
  return { values, brace };
}

// Names read through `secrets.NAME` / `secrets["NAME"]` (upper-cased), plus the occurrences of the
// word `secrets` that are not followed by one of those two forms.
function secretsOf(lines) {
  const names = new Set();
  const bad = [];
  lines.forEach((l, i) => {
    if (l.trim().startsWith('#')) return;
    const text = l; // only full-line comments are skipped; a ' #' inside a line hides nothing
    for (const m of text.matchAll(/\bsecrets\b/gi)) {
      const after = text.slice(m.index + m[0].length);
      const dot = /^\.([A-Za-z0-9_]+)/.exec(after);
      const br = /^\[\s*(["'])([A-Za-z0-9_]+)\1\s*\]/.exec(after);
      if (dot) names.add(dot[1].toUpperCase());
      else if (br) names.add(br[2].toUpperCase());
      else bad.push(`line ${i + 1}: ${l.trim()}`);
    }
  });
  return { names: [...names].sort(), bad };
}

// Rule (i), R1 (vault/plans/EZD-148.md section 1): no cache in any form in the production workflows. Every line is scanned
// on its own (block, flow, any step or depth); what cannot be read is refused, never skipped (L-006, Q-0146 (a)).
const USES_KEY_RE = /(^|[\s{,\[])["']?uses["']?\s*:/gi;
const CACHE_KEY_RE = /(^|[\s{,?\[])["']?cache["']?\s*:/i;
const PM_CACHE_RE = /(^|[\s{,?\[])["']?package-manager-cache["']?\s*:\s*("[^"]*"|'[^']*'|[^\s,}\]#]*)/i;
// cacheUses's own comment strip: YAML white space is space and tab only (D13); stripComment stays for readTriggers.
const stripCacheComment = (s) => s.replace(/[ \t]+#.*$/, '');
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

function cacheUses(lines) {
  const found = [];
  lines.forEach((l, i) => {
    const n = i + 1;
    const t = l.trim();
    const ascii = ASCII_LINE_RE.test(l);
    if (ascii && t.startsWith('#')) return;
    const readable = ascii && quoteReadable(l) && !NODE_START_RE.test(stripCacheComment(l));
    const body = readable ? stripCacheComment(l) : l;
    if (/^(-\s+)?\?(\s|$)/.test(t)) found.push(`explicit key at line ${n}`);
    if (!readable) found.push(`unreadable quoting at line ${n}`);
    for (const m of body.matchAll(USES_KEY_RE)) {
      const raw = body.slice(m.index + m[0].length).split(/[,}\]]/)[0].trim();
      if (raw === '' || /^[>|*&!]/.test(raw)) {
        found.push(`unreadable uses value at line ${n}`);
        continue;
      }
      const value = raw.replace(/^["']/, '').replace(/["']$/, '').trim().toLowerCase();
      if (/^actions\/cache(\/|@|$)/.test(value)) found.push(`${value} at line ${n}`);
    }
    if (CACHE_KEY_RE.test(body)) found.push(`cache key at line ${n}`);
    const pm = PM_CACHE_RE.exec(body);
    if (pm && stripQuotes(pm[2]).toLowerCase() !== 'false') found.push(`package-manager-cache at line ${n}`);
  });
  return found;
}

const EXPECTED_SECRETS = {
  'release.yml': ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID', 'TENANT1_OWNER_EMAIL',
    'BACKUP_SOURCE_DB_URL', 'BACKUP_S3_ENDPOINT', 'BACKUP_S3_REGION', 'BACKUP_S3_BUCKET',
    'RELEASE_S3_ACCESS_KEY_ID', 'RELEASE_S3_SECRET_ACCESS_KEY'],
  'backup-files.yml': ['BACKUP_SOURCE_DB_URL', 'BACKUP_SOURCE_SUPABASE_URL', 'BACKUP_SOURCE_SECRET_KEY',
    'BACKUP_S3_ENDPOINT', 'BACKUP_S3_REGION', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID',
    'BACKUP_S3_SECRET_ACCESS_KEY'],
  'backup-db.yml': ['BACKUP_SOURCE_DB_URL', 'BACKUP_S3_ENDPOINT', 'BACKUP_S3_REGION', 'BACKUP_S3_BUCKET',
    'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY'],
  'supabase-dev.yml': ['SUPABASE_DEV_DB_URL'],
};
const sortedCopy = (a) => [...a].sort();

// EZD-177 rule (l): pnpm reads settings from `pnpm_config_` environment names in any letter case (vault/plans/EZD-177.md section 3).
const PNPM_CONFIG_RE = /pnpm_config_/i;

// EZD-147 rule (j): a `uses:` value must be owner/repo[/path]@<40 lower-case hex> (vault/plans/EZD-147.md section 3).
const PIN_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.\/-]+)?@[0-9a-f]{40}$/;

// Problems of rule (j), J1-J5 (Q-0329 (a)): the R1 line loop over EZD-148's constants; a line that can hide a `uses`
// key from USES_KEY_RE is refused, never skipped (L-006).
function unpinnedUses(lines) {
  const found = [];
  lines.forEach((l, i) => {
    const n = i + 1;
    const t = l.trim();
    const ascii = ASCII_LINE_RE.test(l);
    if (ascii && t.startsWith('#')) return;
    const readable = ascii && quoteReadable(l) && !NODE_START_RE.test(stripCacheComment(l));
    const body = readable ? stripCacheComment(l) : l;
    if (!ascii) found.push(`non-ASCII text at line ${n}`);
    if (/^(-\s+)?\?(\s|$)/.test(t)) found.push(`explicit key at line ${n}`);
    if (ascii && NODE_START_RE.test(body)) found.push(`anchor, alias or tag at line ${n}`);
    if (ascii && !quoteReadable(l) && l.includes('\\')) found.push(`escaped text at line ${n}`);
    for (const m of body.matchAll(USES_KEY_RE)) {
      const raw = body.slice(m.index + m[0].length).split(/[,}\]]/)[0].trim();
      const value = stripQuotes(raw);
      if (value === '' || !PIN_RE.test(value)) found.push(`uses not pinned to a full SHA at line ${n}: ${value}`);
    }
  });
  return found;
}

// EZD-147 rule (k): permissions form and coverage (vault/plans/EZD-147.md section 3).
const PERM_RE = /^(\s*)["']?permissions["']?\s*:(.*)$/;
const PERM_ENTRY_RE = /^\s*["']?[a-z-]+["']?\s*:\s*["']?(read|write|none)["']?\s*$/;

// Problems of rule (k).
function permissionProblems(lines) {
  const found = [];
  let topLevel = false;
  lines.forEach((l, i) => {
    if (l.trim().startsWith('#')) return;
    const m = PERM_RE.exec(l);
    if (!m) return;
    if (m[1].length === 0) topLevel = true;
    const rest = stripComment(m[2]).trim();
    if (rest === '{}') return;
    if (rest === '') {
      const kids = children(lines, i);
      if (kids.length === 0) found.push(`permissions block with no entry at line ${i + 1}`);
      for (const k of kids) {
        if (!PERM_ENTRY_RE.test(stripComment(k.text))) found.push(`permissions entry not read/write/none at line ${k.idx + 1}: ${k.text.trim()}`);
      }
      return;
    }
    found.push(`permissions value not allowed at line ${i + 1}: ${rest}`);
  });
  if (topLevel) return found;
  const jobsIdx = lines.findIndex((l) => /^["']?jobs["']?\s*:(.*)$/.test(l));
  if (jobsIdx < 0 || stripComment(/^["']?jobs["']?\s*:(.*)$/.exec(lines[jobsIdx])[1]).trim() !== '') {
    found.push('jobs not in block form');
    return found;
  }
  const jobs = children(lines, jobsIdx);
  if (!jobs.length) return found;
  const jobIndent = indentOf(jobs[0].text);
  for (const job of jobs) {
    if (indentOf(job.text) !== jobIndent) continue;
    const kids = children(lines, job.idx);
    const direct = kids.length ? indentOf(kids[0].text) : -1;
    const has = kids.some((k) => indentOf(k.text) === direct && PERM_RE.test(k.text));
    if (!has) found.push(`no top-level permissions and job ${job.text.trim()} sets none`);
  }
  return found;
}

// The one checker T2 runs on every real workflow file and T2b runs on in-memory samples.
// Returns [{ rule: 'a'..'k', msg }].
function checkWorkflow(fileName, text) {
  const lines = text.split(/\r?\n/);
  const problems = [];
  const add = (rule, msg) => problems.push({ rule, msg });

  // (a)-(e) triggers
  const { triggers, brace } = readTriggers(lines);
  if (brace) add('a', 'brace-form on: { ... }');
  for (const bad of ['pull_request_target', 'workflow_run']) {
    if (bad in triggers) add('a', `${bad} trigger`);
  }
  if ('push' in triggers) {
    const t = triggers.push;
    if (!['release.yml', 'supabase-dev.yml'].includes(fileName)) add('b', 'push trigger not allowed');
    if (t.form !== 'block' || t.rest !== '') add('c', 'push must use the block form');
    if (readKey(lines, t.lineIdx, 'branches-ignore') !== null) add('c', 'branches-ignore');
    const branches = readKey(lines, t.lineIdx, 'branches');
    if (branches === null) add('c', 'push has no branches key');
    if (fileName === 'release.yml') {
      if (JSON.stringify(branches) !== JSON.stringify(['main'])) add('d', 'push branches must be exactly main');
      for (const k of ['tags', 'tags-ignore', 'paths', 'paths-ignore']) {
        if (readKey(lines, t.lineIdx, k) !== null) add('d', `push has ${k}`);
      }
    }
    if (fileName === 'supabase-dev.yml') {
      if (JSON.stringify(branches) !== JSON.stringify(['develop'])) add('e', 'push branches must be exactly develop');
      if (JSON.stringify(readKey(lines, t.lineIdx, 'paths')) !== JSON.stringify(['supabase/migrations/**'])) {
        add('e', 'push paths must be exactly supabase/migrations/**');
      }
    }
  }

  // (g) environments
  const envs = environmentsOf(lines);
  if (envs.brace) add('g', 'brace-form environment: { ... }');
  for (const env of envs.values) {
    const e = env.toLowerCase();
    if (env.includes('${{')) add('g', 'environment chosen by an expression');
    if (e === 'production') add('g', 'production environment');
    if (e === 'release' && !['release.yml', 'backup-files.yml', 'backup-db.yml'].includes(fileName)) {
      add('g', 'release environment not allowed here');
    }
    if (e === 'dev' && fileName !== 'supabase-dev.yml') add('g', 'dev environment not allowed here');
  }

  // (h) secrets
  const secrets = secretsOf(lines);
  for (const b of secrets.bad) add('h', `unsupported use of secrets, ${b}`);
  const want = sortedCopy((EXPECTED_SECRETS[fileName] ?? []).map((s) => s.toUpperCase()));
  if (JSON.stringify(secrets.names) !== JSON.stringify(want)) {
    add('h', `secret names [${secrets.names}] differ from [${want}]`);
  }

  // (i) caches
  if (['release.yml', 'backup-files.yml', 'backup-db.yml'].includes(fileName)) {
    for (const c of cacheUses(lines)) add('i', c);
  }

  // (j) SHA pins and (k) permissions, every file (EZD-147)
  for (const u of unpinnedUses(lines)) add('j', u);
  for (const p of permissionProblems(lines)) add('k', p);
  // (l) pnpm settings from environment names (EZD-177; Q-0283 (a))
  lines.forEach((l, i) => {
    if (l.trim().startsWith('#')) return;
    if (PNPM_CONFIG_RE.test(l)) add('l', `pnpm_config_ name at line ${i + 1}`);
  });
  return problems;
}

const show = (problems) => problems.map((p) => `(${p.rule}) ${p.msg}`);

function workflowFiles() {
  if (!existsSync(workflowsDir)) return [];
  return readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)).sort();
}

// ---------- T1 ----------
test('EZD-002 T1 Workflow runs the gate (AC-EZD-002-1)', () => {
  const lines = trimmed(path.join(workflowsDir, 'ci.yml'));
  assert.ok(lines.includes('pull_request:'), 'pull_request: block');
  const pr = lines.indexOf('pull_request:');
  assert.ok(/^branches:\s*\[\s*main\s*\]$/.test(lines[pr + 1]), 'pull_request branches line is [main]');
  assert.ok(lines.includes('workflow_dispatch:'), 'workflow_dispatch: line');
  const jobs = lines.indexOf('jobs:');
  assert.ok(jobs >= 0, 'jobs: line');
  assert.ok(lines.indexOf('gate:', jobs) > jobs, 'job key gate: under jobs:');
  const next = lines.indexOf('run: node vault/tools/next_ticket.mjs --check');
  const gate = lines.indexOf('run: node scripts/gate.mjs .');
  assert.ok(next >= 0, 'next_ticket --check step');
  assert.ok(gate > next, 'gate step comes after the ledger check step');
  assert.ok(lines.some((l) => /^node-version:\s*["']?22["']?$/.test(l)), 'node-version: 22');
});


// ---------- T2 ----------
test('EZD-002 T2 Push triggers only where Josh allowed them (AC-EZD-002-1)', () => {
  const files = workflowFiles();
  assert.ok(files.includes('ci.yml'), 'ci.yml exists');
  for (const f of files) {
    const problems = checkWorkflow(f, readFileSync(path.join(workflowsDir, f), 'utf8'));
    assert.deepEqual(show(problems), [], `${f}: workflow rules`);
  }
});

// ---------- T2b ----------
test('EZD-002 T2b T2 rules catch the bypasses (AC-EZD-002-1)', () => {
  const on = (body) => `on:\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n${body}`;
  const samples = [
    ['s1', 'x.yml', 'on: { push: { branches: [main] } }\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n', 'a'],
    ['s2', 'x.yml', on('    steps:\n      - run: echo ok\n        env:\n          ALL: ${{ toJSON(secrets) }}\n'), 'h'],
    ['s3', 'x.yml', on('    uses: ./.github/workflows/other.yml\n    secrets: inherit\n'), 'h'],
    ['s4', 'x.yml', on('    steps:\n      - run: echo ok\n        env:\n          K: ${{ secrets[matrix.key] }}\n'), 'h'],
    ['s5', 'ci.yml', on('    steps:\n      - run: echo ok\n        env:\n          K: ${{ secrets["VERCEL_TOKEN"] }}\n'), 'h'],
    ['s6', 'release.yml', on("    steps:\n      - run: echo ok\n        env:\n          K: ${{ secrets['RESEND_API_KEY'] }}\n"), 'h'],
    ['s7', 'x.yml', on('    environment: { name: release }\n    steps:\n      - run: echo ok\n'), 'g'],
    ['s8', 'release.yml', on('    steps:\n      - uses: actions/cache/restore@v4\n'), 'i'],
    ['s9', 'release.yml', on('    steps:\n      - uses: actions/cache/save@v4\n'), 'i'],
    ['s10', 'release.yml', on('    steps:\n      - uses: "actions/cache@v4"\n'), 'i'],
    ['s11', 'backup-db.yml', on("    steps:\n      - uses: 'actions/setup-node@v4'\n        with:\n          cache: pnpm\n"), 'i'],
  ];
  for (const [id, file, text, rule] of samples) {
    const problems = checkWorkflow(file, text);
    assert.ok(problems.length > 0, `${id}: at least one problem`);
    assert.ok(problems.some((p) => p.rule === rule), `${id}: caught by rule (${rule}), got ${show(problems)}`);
  }
  // s5 and s6: the name is counted, not just flagged
  for (const [i, name] of [[4, 'VERCEL_TOKEN'], [5, 'RESEND_API_KEY']]) {
    const ps = checkWorkflow(samples[i][1], samples[i][2]);
    assert.ok(
      ps.some((p) => p.rule === 'h' && p.msg.startsWith('secret names') && p.msg.includes(name)),
      `${samples[i][0]}: ${name} counted against the file's list: ${show(ps)}`,
    );
    assert.ok(!ps.some((p) => p.msg.startsWith('unsupported use of secrets')), `${samples[i][0]}: bracket form is not flagged as unsupported`);
  }
  // c0: clean control (EZD-147: pinned() adds the top-level permissions rule (k) needs)
  const c0 = pinned('      - run: echo ok\n');
  assert.deepEqual(show(checkWorkflow('x.yml', c0)), [], 'c0: clean text has no problem');
});

// ---------- EZD-148 T1 ----------
// Sources: ticket EZD-148 Done when and Scope (inline flow maps, mixed-case action names); plan decisions D2-D5, D10;
// lesson L-006 (every form the checker cannot read is refused). Each sample runs for all three production workflow
// files, because rule (i) runs only for them. Messages name the sample id and the file.
test('EZD-148 T1 rule (i) catches inline, mixed-case and unreadable cache forms (AC-EZD-148-1) done when', () => {
  const on = (body) => `on:\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n${body}`;
  const files = ['release.yml', 'backup-files.yml', 'backup-db.yml'];
  const bad = [
    ['i1', '      - uses: actions/setup-node@v4\n        with: { cache: pnpm }\n'],
    ['i2', '      - uses: Actions/Cache@v4\n'],
    ['i3', '      - { uses: actions/setup-node@v4, with: { cache: pnpm } }\n'],
    ['i4', '      - uses: actions/setup-node@v4\n        with:\n          "cache": pnpm\n'],
    ['i5', '      - uses: actions/setup-node@v4\n        with:\n          Cache: pnpm\n'],
    ['i6', '      - with:\n          cache: pnpm\n        uses: actions/setup-node@v4\n'],
    ['i7', '      - "uses": actions/cache@v4\n'],
    ['i8', '      - uses: ACTIONS/CACHE/restore@v4\n'],
    ['i9', '      - uses: >-\n          actions/cache@v4\n'],
    ['i10', '      - uses: *c\n'],
    ['i11', '      - uses: actions/setup-node@v4\n        with:\n          package-manager-cache: true\n'],
    ['i12', '      - uses: actions/setup-node@v4\n        with:\n          ? cache\n          : pnpm\n'],
    // the text line is `          "c\x61che": pnpm` with one backslash
    ['i13', '      - uses: actions/setup-node@v4\n        with:\n          "c\\x61che": pnpm\n'],
    // security review 2026-10-25 finding 1 and plan D4: quoting the line scanner cannot read is refused (one backslash each)
    // i14, i15: the text line holds `"actions/c\x61che@v4"` (a \ escape inside double quotes)
    ['i14', '      - uses: "actions/c\\x61che@v4"\n'],
    ['i15', '      - { uses: "actions/c\\x61che@v4" }\n'],
    // i16: the key is split by an escaped line break; the third text line ends with one backslash
    ['i16', '      - uses: actions/setup-node@v4\n        with:\n          "ca\\\n          che": pnpm\n'],
    // i17: the value is split the same way; the first text line ends with one backslash
    ['i17', '      - uses: "actions/\\\n          cache@v4"\n'],
    // i18, i19: a ` #` inside a quoted scalar; the comment strip would cut the body and hide the uses key
    ['i18', "      - { name: 'a #', uses: actions/cache@v4 }\n"],
    ['i19', '      - { name: "a #", uses: actions/cache@v4 }\n'],
    // i20-i22: a stray quote in a plain scalar must not pair with the opener of a real quoted scalar (round 2, plan D4)
    ['i20', "      - { name: a'b, x: 'c #', uses: actions/cache@v4 }\n"],
    ['i21', '      - { name: a"b, x: "c #", uses: actions/cache@v4 }\n'],
    ['i22', "      - uses: actions/setup-node@v4\n        with: { x: a'b, y: 'c #', cache: pnpm }\n"],
    // i23, i24: the round-1 controls c5 and c6 fit no quote shape (plan D4); i23's text ends `a\b` with one backslash
    ['i23', `      - run: echo "ok" 'it"s' a\\b\n`],
    ['i24', `      - run: echo ok # it's "fine\n`],
    // i25-i27: a key right after `[` (a flow sequence of single-pair maps, plan D13)
    ['i25', '      [uses: actions/cache@v4]\n'],
    ['i26', '      [uses: actions/cache@v4,\n       run: echo ok]\n'],
    ['i27', '      - { uses: actions/setup-node@v4, with: [cache: pnpm] }\n'],
    // i28, i29: a no-break space (U+00A0) before `#` is not YAML white space, so the `#` starts no comment (plan D13)
    ['i28', '      - { name: a\u00A0#, uses: actions/cache@v4 }\n'],
    ['i29', '      - uses: actions/setup-node@v4\n        with: { x: a\u00A0#, cache: pnpm }\n'],
    // i30: an accented letter in a comment; refused by the ASCII-only rule alone (plan D13)
    ['i30', '      - run: echo ok # caf\u00E9\n'],
    // i31-i35: anchors, aliases and tags at a node start (round 4, plan D4 NODE_START_RE)
    ['i31', '      - uses: actions/setup-node@v4\n        name: &k cache\n        with:\n          *k : pnpm\n'],
    ['i32', '      - name: &k uses\n        *k : actions/cache@v4\n'],
    ['i33', '      - { uses: actions/setup-node@v4, name: &k cache, with: { *k : pnpm } }\n'],
    ['i34', '      - uses: actions/setup-node@v4\n        name: !!str &k cache\n        with:\n          *k : pnpm\n'],
    ['i35', '      - &s { uses: actions/cache@v4 }\n      - *s\n'],
  ];
  const controls = [
    ['c1', '      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          package-manager-cache: false\n'],
    ['c2', '      - uses: actions/checkout@v4\n      - run: echo ok\n'],
    ['c3', '      - uses: actions/setup-node@v4\n        with:\n          cache-dependency-path: pnpm-lock.yaml\n'],
    // c5: the real-file shapes Q1 (a single-quoted scalar) and Q2 (an `if:` expression holding `'`), plan D4
    ['c5', "      - name: 'Off-site backup: files'\n        if: github.ref == 'refs/heads/main' && github.event_name == 'push'\n        run: echo ok\n"],
    // c6: Q1 with a quote-free comment; a comment on a quote-free line
    ['c6', "      - name: 'build' # the step name\n        run: echo ok # a plain comment\n"],
    // c9: a key after `[` that is not a cache key (plan D13)
    ['c9', '      - uses: actions/checkout@v4\n        with: [fetch-depth: 0]\n'],
    // c10: `&&` and `!=` after a started scalar; the indicators `* & !` only inside a comment (plan D4 node starts)
    ['c10', "      - run: cat a && b # *note &x !y\n        if: github.ref == 'refs/heads/main' && x != ''\n"],
  ];
  let cases = 0;
  const missed = [];
  for (const file of files) {
    for (const [id, body] of bad) {
      cases += 1;
      const P = checkWorkflow(file, on(body));
      if (!P.some((p) => p.rule === 'i')) missed.push(`${id} in ${file}: no problem with rule (i), got [${show(P)}]`);
    }
  }
  assert.equal(cases, 105, '35 samples x 3 files');
  assert.deepEqual(missed, [], 'every bad cache form is caught by rule (i)');
  const falsePositives = [];
  for (const file of files) {
    for (const [id, body] of controls) {
      const P = checkWorkflow(file, on(body));
      if (P.some((p) => p.rule === 'i')) falsePositives.push(`${id} in ${file}: ${show(P.filter((p) => p.rule === 'i'))}`);
    }
  }
  assert.deepEqual(falsePositives, [], 'clean controls have no problem with rule (i)');
});

// ---------- T3 ----------
const FIXTURE_SCRIPTS = {
  typecheck: 'pnpm -r --if-present --filter "!./spikes/**" run typecheck',
  lint: 'node scripts/conventions/check.mjs && pnpm -r --if-present --filter "!./spikes/**" run lint',
  test: 'node --test --test-concurrency=4 "scripts/**/*.test.mjs" && pnpm -r --if-present --filter "!./spikes/**" run test',
  build: 'pnpm -r --if-present --filter "!./spikes/**" run build',
};

function childEnv(tmp) {
  const env = { ...process.env };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT; // set by the outer node --test; a nested node --test must start clean
  if (tmp) { env.TMP = tmp; env.TEMP = tmp; env.TMPDIR = tmp; }
  return env;
}

function writeProbe(fixture, failing = []) {
  const ok = 'node -e "process.exit(0)"';
  const bad = 'node -e "process.exit(1)"';
  const scripts = {};
  for (const n of ['typecheck', 'lint', 'test', 'build']) scripts[n] = failing.includes(n) ? bad : ok;
  writeFileSync(path.join(fixture, 'packages', 'probe', 'package.json'),
    JSON.stringify({ name: '@ezdraft/probe', version: '0.0.0', private: true, scripts }, null, 2));
}

function runGate(fixture) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd002-lock-'));
  try {
    const r = spawnSync('node', [path.join(repo, 'scripts', 'gate.mjs'), fixture], {
      encoding: 'utf8', env: childEnv(tmp), maxBuffer: 64 * 1024 * 1024,
    });
    return { status: r.status, out: r.stdout || '', err: r.stderr || '' };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const resultLine = (out, name, result) =>
  new RegExp(`^${name.replace(':', '\\:')}\\s+${result}$`, 'm').test(out);

test('EZD-002 T3 Gate fails on a failing check (AC-EZD-002-2) done when', { timeout: 180000 }, () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'ezd002-fixture-'));
  try {
    writeFileSync(path.join(fixture, 'package.json'),
      JSON.stringify({ name: 'ezd002-fixture', version: '0.0.0', private: true, scripts: FIXTURE_SCRIPTS }, null, 2));
    writeFileSync(path.join(fixture, 'pnpm-workspace.yaml'),
      'packages:\n  - app\n  - "packages/*"\n  - worker\n  - "spikes/*"\n');
    mkdirSync(path.join(fixture, 'scripts', 'conventions'), { recursive: true });
    writeFileSync(path.join(fixture, 'scripts', 'conventions', 'check.mjs'), 'process.exit(0);\n');
    writeFileSync(path.join(fixture, 'scripts', 'ok.test.mjs'),
      "import { test } from 'node:test';\ntest('ok', () => {});\n");
    mkdirSync(path.join(fixture, 'packages', 'probe'), { recursive: true });
    writeProbe(fixture);

    const inst = spawnSync('pnpm', ['install', '--no-frozen-lockfile'], {
      cwd: fixture, encoding: 'utf8', env: childEnv(), maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(inst.status, 0, `fixture install failed: ${inst.stdout}${inst.stderr}`);
    assert.ok(existsSync(path.join(fixture, 'pnpm-lock.yaml')), 'fixture has pnpm-lock.yaml');
    assert.ok(existsSync(path.join(fixture, 'node_modules')), 'fixture has node_modules');

    const lastLine = (out) => out.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '').pop();
    const required = ['typecheck', 'lint', 'test', 'build'];
    const expectOthersPass = (out, failed) => {
      for (const n of required.filter((r) => r !== failed)) {
        assert.ok(resultLine(out, n, 'pass'), `${n} still shows pass when ${failed} fails:\n${out}`);
      }
    };

    // green case
    const green = runGate(fixture);
    assert.equal(green.status, 0, `green case exit:\n${green.out}${green.err}`);
    for (const n of required) assert.ok(resultLine(green.out, n, 'pass'), `${n} pass:\n${green.out}`);
    assert.ok(resultLine(green.out, 'test:e2e', 'not yet'), 'test:e2e not yet');
    assert.ok(resultLine(green.out, 'perf', 'not yet'), 'perf not yet');
    assert.ok(green.out.includes('GATE PASS'), 'GATE PASS printed');

    // (test-pkg)
    writeProbe(fixture, ['test']);
    let r = runGate(fixture);
    assert.equal(r.status, 1, 'test-pkg exit code');
    assert.ok(resultLine(r.out, 'test', 'FAIL'), `test FAIL:\n${r.out}`);
    assert.equal(lastLine(r.out), 'GATE FAIL: test', 'last non-empty stdout line');
    expectOthersPass(r.out, 'test');

    // (test-root)
    writeProbe(fixture);
    const bad = path.join(fixture, 'scripts', 'bad.test.mjs');
    writeFileSync(bad, "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('bad', () => { assert.equal(1, 2); });\n");
    r = runGate(fixture);
    assert.equal(r.status, 1, 'test-root exit code');
    assert.ok(resultLine(r.out, 'test', 'FAIL'), `test FAIL (root):\n${r.out}`);
    expectOthersPass(r.out, 'test');
    rmSync(bad);

    // (lint)
    writeProbe(fixture, ['lint']);
    r = runGate(fixture);
    assert.equal(r.status, 1, 'lint exit code');
    assert.ok(resultLine(r.out, 'lint', 'FAIL'), `lint FAIL:\n${r.out}`);
    expectOthersPass(r.out, 'lint');

    // (typecheck)
    writeProbe(fixture, ['typecheck']);
    r = runGate(fixture);
    assert.equal(r.status, 1, 'typecheck exit code');
    assert.ok(resultLine(r.out, 'typecheck', 'FAIL'), `typecheck FAIL:\n${r.out}`);
    expectOthersPass(r.out, 'typecheck');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ---------- T4 ----------
test('EZD-002 T4 A failing Vitest test exits non-zero (AC-EZD-002-2)', { timeout: 180000 }, () => {
  for (const p of ['app', path.join('packages', 'geometry')]) {
    const pkg = JSON.parse(readFileSync(path.join(repo, p, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.test.startsWith('vitest run'), `${p} test script starts with vitest run`);
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd002-vitest-'));
  try {
    writeFileSync(path.join(tmp, 'probe.test.ts'),
      "describe('EZD-002 probe', () => {\n  it('EZD-002 probe fails', () => { throw new Error('EZD-002 probe failure'); });\n});\n");
    writeFileSync(path.join(tmp, 'vitest.config.mjs'),
      "export default { test: { globals: true, include: ['probe.test.ts'], environment: 'node' } };\n");
    const r = spawnSync('pnpm', ['--filter', '@ezdraft/geometry', 'exec', 'vitest', 'run',
      '--root', tmp, '--config', path.join(tmp, 'vitest.config.mjs')], {
      cwd: repo, encoding: 'utf8', env: childEnv(), maxBuffer: 64 * 1024 * 1024,
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    assert.notEqual(r.status, 0, `vitest exit code must not be 0:\n${out}`);
    assert.ok(out.includes('probe.test.ts'), `output names probe.test.ts:\n${out}`);
    assert.ok(
      out.includes('EZD-002 probe failure') || out.includes('EZD-002 probe fails'),
      `a failing test actually ran:\n${out}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- T5 ----------
test('EZD-002 T5 pnpm pin honored (AC-EZD-002-2)', () => {
  const pin = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')).packageManager;
  assert.ok(pin.startsWith('pnpm@'), 'packageManager is pnpm@<version>');
  const r = spawnSync('pnpm', ['--version'], { cwd: repo, encoding: 'utf8', env: childEnv() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), pin.slice('pnpm@'.length));
});

// ---------- T6 ----------
test('EZD-002 T6 CI documented', () => {
  const lines = readLines(path.join(repo, 'docs', 'architecture.md'));
  const mc = lines.findIndex((l) => l.trim() === '## Machine checks');
  assert.ok(mc >= 0, '## Machine checks heading');
  let end = lines.length;
  for (let i = mc + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }
  const ci = lines.findIndex((l, i) => i > mc && i < end && l.trim() === '### CI');
  assert.ok(ci > mc, '### CI heading inside ## Machine checks');
  let ciEnd = end;
  for (let i = ci + 1; i < end; i++) if (/^#{2,3} /.test(lines[i])) { ciEnd = i; break; }
  const section = lines.slice(ci, ciEnd).join('\n');
  for (const s of ['.github/workflows/ci.yml', 'scripts/gate.mjs', 'next_ticket.mjs --check', 'workflow_dispatch', 'EZD-003']) {
    assert.ok(section.includes(s), `### CI mentions ${s}`);
  }
  const row = lines.slice(mc, end).some((l) => {
    const cells = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    return l.trim().startsWith('|') && cells.length >= 4 && cells[cells.length - 1] === 'EZD-002';
  });
  assert.ok(row, 'Machine checks table row whose last cell is EZD-002');
  const c = spawnSync('node', [path.join(repo, 'scripts', 'conventions', 'check.mjs'), repo], {
    encoding: 'utf8', env: childEnv(),
  });
  assert.equal(c.status, 0, `conventions check:\n${c.stdout}${c.stderr}`);
});

// ---------- EZD-147 T1-T5 (vault/plans/EZD-147.md sections 3 and 4) ----------
const CI_PINS = [
  '- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  '- uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
  'uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2',
  'uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2',
];

test('EZD-147 T1 ci.yml least rights and pins (AC-EZD-147-1) done when', () => {
  const lines = readLines(path.join(workflowsDir, 'ci.yml'));
  const jobsIdx = lines.findIndex((l) => l.trim() === 'jobs:');
  assert.ok(jobsIdx >= 0, 'jobs: line');
  // (a)
  const perm = lines.map((l, i) => (PERM_RE.test(l) ? i : -1)).filter((i) => i >= 0);
  assert.equal(perm.length, 1, `exactly one permissions line, got ${perm.length}`);
  assert.equal(indentOf(lines[perm[0]]), 0, 'permissions at indent 0');
  assert.ok(perm[0] < jobsIdx, 'permissions before jobs:');
  assert.deepEqual(children(lines, perm[0]).map((k) => k.text.trim()), ['contents: read']);
  // (b)
  const uses = lines.map((l) => l.trim()).filter((l) => !l.startsWith('#') && l.includes('uses:'));
  assert.deepEqual(uses, CI_PINS);
  // (c)
  const nodeAt = lines.findIndex((l) => l.trim() === CI_PINS[1]);
  assert.ok(nodeAt >= 0, 'setup-node pin line');
  assert.equal(lines[nodeAt + 1].trim(), 'with:', 'line after the setup-node pin is with:');
  assert.deepEqual(children(lines, nodeAt + 1).map((k) => k.text.trim()), ['node-version: 22', 'package-manager-cache: false']);
});

test('EZD-147 T2 every workflow passes rules (j) and (k) (AC-EZD-147-1)', () => {
  const files = workflowFiles();
  assert.ok(files.includes('ci.yml'), 'ci.yml exists');
  for (const f of files) {
    const problems = checkWorkflow(f, readFileSync(path.join(workflowsDir, f), 'utf8'))
      .filter((p) => p.rule === 'j' || p.rule === 'k');
    assert.deepEqual(show(problems), [], `${f}: rules (j) and (k)`);
  }
});

// Sample helpers (section 3). `pinned` is a function declaration so EZD-002 T2b can use it.
const S = '3d3c42e5aac5ba805825da76410c181273ba90b1';
function pinned(body) {
  return `on:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n${body}`;
}
const B = 'on:\n  workflow_dispatch:\n';
const JOB = 'jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n';

test('EZD-147 T3 rule (j) catches unpinned forms (AC-EZD-147-1)', () => {
  const bad = [
    ['j1', '      - uses: actions/checkout@v4\n'],
    ['j2', '      - uses: actions/checkout@3d3c42e\n'],
    ['j3', '      - uses: "actions/checkout@v4"\n'],
    ['j4', '      - { uses: actions/checkout@v4 }\n'],
    ['j5', '      - name: co\n        uses: actions/checkout@v4\n'],
    ['j6', `      - uses: actions/checkout@${S.toUpperCase()}\n`],
    ['j7', '      - uses: >-\n          actions/checkout@v4\n'],
    ['j8', '      - uses: *co\n'],
    ['j9', '      - uses: ${{ matrix.action }}\n'],
    ['j10', '      - uses: ./.github/actions/local\n'],
    ['j11', '      - uses: docker://alpine:3.20\n'],
    ['j12', '      - "uses": actions/checkout@v4\n'],
    ['j13', `      - uses: actions/checkout@${S}0\n`],
    ['j14', '      - uses: actions/checkout@main\n'],
    ['j15', '      - run: echo ok\n  b:\n    uses: o/r/.github/workflows/x.yml@v1\n'],
    // j16-j26: Q-0329 (a); EZD-148 D4, D13, R1 item 1 (vault/plans/EZD-147.md section 4 T3)
    ['j16', '      [uses: actions/checkout@v4]\n'],
    ['j17', '      [uses: actions/checkout@v4,\n       run: echo ok]\n'],
    ['j18', '      - { name: a\u00A0#, uses: actions/checkout@v4 }\n'],
    ['j19', `      - uses: actions/checkout@${S}\u00A0# v7.0.1\n`],
    ['j20', '      - run: echo ok # caf\u00E9\n'],
    ['j21', '      - ? uses\n        : actions/checkout@v4\n'],
    ['j22', '      - name: &k uses\n        *k : actions/checkout@v4\n'],
    ['j23', '      - { name: &k uses, x: "a #", *k : actions/checkout@v4 }\n'],
    ['j24', '      - "us\\x65s": actions/checkout@v4\n'],
    ['j25', '      - "us\\\n        es": actions/checkout@v4\n'],
    ['j26', '      - !!str uses: actions/checkout@v4\n'],
  ];
  for (const [id, body] of bad) {
    const problems = checkWorkflow('x.yml', pinned(body));
    assert.ok(problems.some((p) => p.rule === 'j'), `${id}: caught by rule (j), got ${show(problems)}`);
  }
  const good = [
    ['jc1', `      - uses: actions/checkout@${S} # v7.0.1\n`],
    ['jc2', `      - uses: 'actions/checkout@${S}'\n`],
    ['jc3', `      - { uses: actions/checkout@${S}, with: { fetch-depth: 1 } }\n`],
    // jc4-jc7: Q-0329 (a); EZD-148 D4 (jc7 = EZD-148 c10); Decided "Fail-closed lines" (jc6)
    ['jc4', `      - uses: actions/checkout@${S}\n        with: [fetch-depth: 1]\n`],
    ['jc5', `      [uses: actions/checkout@${S}]\n`],
    ['jc6', `      - { uses: actions/checkout@${S}, name: "co" }\n`],
    ['jc7', `      - run: cat a && b # *note &x !y\n        if: github.ref == 'refs/heads/main' && x != ''\n`],
  ];
  for (const [id, body] of good) {
    assert.deepEqual(show(checkWorkflow('x.yml', pinned(body))), [], `${id}: no problem`);
  }
});

test('EZD-147 T4 rule (k) catches missing and broad permissions (AC-EZD-147-1)', () => {
  const bad = [
    ['k1', B + JOB],
    ['k2', B + 'permissions: write-all\n' + JOB],
    ['k3', B + 'permissions: read-all\n' + JOB],
    ['k4', B + 'permissions: { contents: read }\n' + JOB],
    ['k5', B + 'jobs:\n  a:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n    steps:\n      - run: echo ok\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n'],
    ['k6', B + 'permissions: ${{ inputs.p }}\n' + JOB],
    ['k7', B + 'permissions:\n  contents: ${{ inputs.p }}\n' + JOB],
    ['k8', B + 'permissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n    permissions: write-all\n    steps:\n      - run: echo ok\n'],
    ['k9', B + "'permissions': write-all\n" + JOB],
    ['k10', B + 'permissions: *p\n' + JOB],
    ['k11', B + 'permissions:\n' + JOB],
    ['k12', B + 'jobs: { a: { runs-on: ubuntu-latest } }\n'],
  ];
  for (const [id, text] of bad) {
    const problems = checkWorkflow('x.yml', text);
    assert.ok(problems.some((p) => p.rule === 'k'), `${id}: caught by rule (k), got ${show(problems)}`);
  }
  const good = [
    ['kc1', B + 'permissions:\n  contents: read\n' + JOB],
    ['kc2', B + 'permissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n      pull-requests: read\n    steps:\n      - run: echo ok\n'],
    ['kc3', B + 'jobs:\n  a:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      actions: read\n    steps:\n      - run: echo ok\n'],
    ['kc4', B + 'permissions: {}\n' + JOB],
  ];
  for (const [id, text] of good) {
    assert.deepEqual(show(checkWorkflow('x.yml', text)), [], `${id}: no problem`);
  }
});

test('EZD-147 T5 CI rules documented (AC-EZD-147-1)', () => {
  const lines = readLines(path.join(repo, 'docs', 'architecture.md'));
  // The ### CI section and the Machine checks range, found as EZD-002 T6 finds them.
  const mc = lines.findIndex((l) => l.trim() === '## Machine checks');
  assert.ok(mc >= 0, '## Machine checks heading');
  let end = lines.length;
  for (let i = mc + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }
  const ci = lines.findIndex((l, i) => i > mc && i < end && l.trim() === '### CI');
  assert.ok(ci > mc, '### CI heading inside ## Machine checks');
  let ciEnd = end;
  for (let i = ci + 1; i < end; i++) if (/^#{2,3} /.test(lines[i])) { ciEnd = i; break; }
  const section = lines.slice(ci, ciEnd).join('\n');
  for (const s of ['EZD-147', 'rule (k)']) assert.ok(section.includes(s), `### CI mentions ${s}`);
  const row = lines.slice(mc, end).some((l) => {
    const cells = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    return l.trim().startsWith('|') && cells.length >= 4 && cells[cells.length - 1] === 'EZD-147';
  });
  assert.ok(row, 'Machine checks table row whose last cell is EZD-147');
  const named = lines.find((l) => /^\|\s*CI and repository\s*\|/.test(l.trim()));
  assert.ok(named, 'Named tools row CI and repository');
  for (const v of ['v7.0.1', 'v7.1.0', 'v7.0.2']) assert.ok(named.includes(v), `CI and repository row mentions ${v}`);
});

// ---------- EZD-177 T1 ----------
// Rule (l) through checkWorkflow (vault/plans/EZD-177.md sections 3 and 4). Expected values are the plan's R1 texts.
test('EZD-177 done when: T1 workflows naming pnpm_config_ are refused and the real workflows pass (AC-EZD-177-1, AC-EZD-177-2)', async (t) => {
  const wf = (body) => `on:\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n${body}`;
  const lOf = (problems) => problems.filter((p) => p.rule === 'l').map((p) => p.msg);

  await t.test('T1 (a) step env: names PNPM_CONFIG_ at line 9 (AC-EZD-177-1)', () => {
    const text = wf("      - run: pnpm install --frozen-lockfile\n        env:\n          PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS: 'true'\n");
    assert.deepEqual(lOf(checkWorkflow('x.yml', text)), ['pnpm_config_ name at line 9']);
  });

  await t.test('T1 (b) lower case in release.yml at line 9 (AC-EZD-177-1)', () => {
    const text = wf("      - run: echo ok\n        env:\n          pnpm_config_allow_builds: '{\"esbuild\":true}'\n");
    assert.deepEqual(lOf(checkWorkflow('release.yml', text)), ['pnpm_config_ name at line 9']);
  });

  await t.test('T1 (c) mixed case in a flow map in ci.yml at line 8 (AC-EZD-177-1)', () => {
    const text = wf('      - run: echo ok\n        env: { Pnpm_Config_Ignore_Scripts: false }\n');
    assert.deepEqual(lOf(checkWorkflow('ci.yml', text)), ['pnpm_config_ name at line 8']);
  });

  await t.test('T1 (d) prefix in a run: line at line 7 (AC-EZD-177-1)', () => {
    const text = wf('      - run: PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true pnpm install\n');
    assert.deepEqual(lOf(checkWorkflow('x.yml', text)), ['pnpm_config_ name at line 7']);
  });

  await t.test('T1 (e) write to $GITHUB_ENV at line 7 (AC-EZD-177-1)', () => {
    const text = wf('      - run: echo "PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true" >> "$GITHUB_ENV"\n');
    assert.deepEqual(lOf(checkWorkflow('x.yml', text)), ['pnpm_config_ name at line 7']);
  });

  await t.test('T1 (f) block scalar export at line 8 (AC-EZD-177-1)', () => {
    const text = wf('      - run: |\n          export pnpm_config_dangerously_allow_all_builds=true\n          pnpm install\n');
    assert.deepEqual(lOf(checkWorkflow('x.yml', text)), ['pnpm_config_ name at line 8']);
  });

  await t.test('T1 (g) quoted key in backup-db.yml at line 9 (AC-EZD-177-1)', () => {
    const text = wf('      - run: echo ok\n        env:\n          "PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS": "true"\n');
    assert.deepEqual(lOf(checkWorkflow('backup-db.yml', text)), ['pnpm_config_ name at line 9']);
  });

  await t.test('T1 (h) workflow-level env: at line 4 (AC-EZD-177-1)', () => {
    const text = 'on:\n  workflow_dispatch:\nenv:\n  PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS: \'true\'\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n';
    assert.deepEqual(lOf(checkWorkflow('x.yml', text)), ['pnpm_config_ name at line 4']);
  });

  await t.test('T1 (i) job-level env: at line 7 (AC-EZD-177-1)', () => {
    const text = 'on:\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    env:\n      PNPM_CONFIG_IGNORE_SCRIPTS: \'false\'\n    steps:\n      - run: echo ok\n';
    assert.deepEqual(lOf(checkWorkflow('x.yml', text)), ['pnpm_config_ name at line 7']);
  });

  await t.test('T1 (j) two names on two lines give two problems in line order (AC-EZD-177-1)', () => {
    const text = wf("      - run: echo ok\n        env:\n          PNPM_CONFIG_A: '1'\n          pnpm_config_b: '2'\n");
    assert.deepEqual(lOf(checkWorkflow('x.yml', text)), ['pnpm_config_ name at line 9', 'pnpm_config_ name at line 10']);
  });

  await t.test('T1 (k) control: a full-line comment is skipped (AC-EZD-177-2)', () => {
    const text = wf('      # PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS is refused\n      - run: echo ok\n');
    assert.deepEqual(lOf(checkWorkflow('x.yml', text)), []);
  });

  await t.test('T1 (l) control: npm_config_, PNPM_HOME and MY_PNPM_CONFIG are not pnpm_config_ names (AC-EZD-177-2)', () => {
    const text = wf('      - run: echo ok\n        env:\n          npm_config_loglevel: error\n          PNPM_HOME: /tmp/pnpm\n          MY_PNPM_CONFIG: x\n');
    assert.deepEqual(lOf(checkWorkflow('x.yml', text)), []);
  });

  await t.test('T1 (m) every real workflow file passes rule (l) (AC-EZD-177-2)', () => {
    const files = workflowFiles();
    assert.ok(files.includes('ci.yml'), 'workflowFiles() lists ci.yml');
    for (const f of files) {
      const text = readFileSync(path.join(workflowsDir, f), 'utf8');
      assert.deepEqual(lOf(checkWorkflow(f, text)), [], f);
    }
  });
});
