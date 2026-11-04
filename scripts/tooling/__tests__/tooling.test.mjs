// EZD-001 · T4–T16: repo tooling (vault/plans/EZD-001.md section 4; interface contract section 3).
// Sources: 02 Stack / Named tools; 11 Rules 3, Where each output is produced; PROCESS.md section 14; PROCESS-EZDRAFT.md
// section 5; Q-0006, Q-0019 read as 4 (Q-0114), Q-0139 (a), Q-0140 (a); CLAUDE.md rule 7; scripts/gate.mjs lines 29–71.
// Run by the root `node --test "scripts/**/*.test.mjs"`. Temp files go under os.tmpdir(), except T9's probe (plan T9).
// Tests match exit codes, rule IDs, check IDs and paths, not message wording.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const appDir = path.join(root, 'app');
const geoDir = path.join(root, 'packages', 'geometry');
const gateScript = path.join(root, 'scripts', 'gate.mjs');
const checkScript = path.join(root, 'scripts', 'conventions', 'check.mjs');

const tmpRoots = [];
after(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});
function tmpDir(prefix) {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}

/** Child env: never inherit the gate's scope grep (scripts/gate.mjs line 71); each case sets its own. */
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!('EZD_TEST_GREP' in extra)) delete env.EZD_TEST_GREP;
  return env;
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', env: childEnv(opts.env || {}), cwd: opts.cwd || root, timeout: 300_000 });
}

/** JSON from `tsc --showConfig` run inside a package through pnpm. */
function showConfig(filter) {
  const r = run('pnpm', ['--filter', filter, 'exec', 'tsc', '-p', '.', '--showConfig']);
  assert.equal(r.status, 0, `tsc --showConfig for ${filter} failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout);
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** Import a root devDependency resolved from the repo root (not from this file's folder). */
function importFromRoot(name) {
  const req = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(req.resolve(name)).href).then((mod) => mod.default ?? mod);
}

const EXCLUDED = ['/vault/', '/spikes/', '/.claude/'];
/** True when the repo-relative form of `p` enters an excluded folder (the worktree itself lives under .claude/worktrees/). */
function entersExcluded(p) {
  const rel = '/' + path.relative(root, p).split(path.sep).join('/') + '/';
  return EXCLUDED.some((seg) => rel.includes(seg));
}

// ---------- pnpm build settings checker (EZD-001 T10; extended by EZD-148 T2, R2) ----------
// The text of pnpm-workspace.yaml is read as lines (no YAML package). Returns [{ rule, msg }], rule one of
// 'permissions', 'allow-all', 'allowBuilds-form', 'allowBuilds-entry', 'unreadable'. Each msg names the line.
// What cannot be read (explicit `?` keys and the lines D4 and D13 name) is refused, never skipped (L-006).
const stripYamlComment = (s) => s.replace(/[ \t]+#.*$/, '');
const KEY = (name) => new RegExp('(^|[\\s{,?\\[])["\']?' + name + '["\']?\\s*:', 'i');
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

function buildSettingProblems(text) {
  const lines = text.split(/\r?\n/);
  const problems = [];
  const add = (rule, msg) => problems.push({ rule, msg });
  const allowBuildsLines = [];
  const bodies = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    const ascii = ASCII_LINE_RE.test(l);
    if (ascii && (t === '' || t.startsWith('#'))) return;
    const n = i + 1;
    const readable = ascii && quoteReadable(l) && !NODE_START_RE.test(stripYamlComment(l));
    const body = readable ? stripYamlComment(l) : l;
    bodies[i] = body;
    if (/^(-\s+)?\?(\s|$)/.test(t) || !readable) add('unreadable', `line ${n}: a key form this check cannot read`);
    if (KEY('permissions').test(body)) add('permissions', `line ${n}: the pnpm permissions setting overrides allowBuilds (D8)`);
    if (KEY('dangerouslyAllowAllBuilds').test(body)) add('allow-all', `line ${n}: allow-all build setting (Q-0140 (a))`);
    if (KEY('allowBuilds').test(body)) allowBuildsLines.push(i);
  });
  if (allowBuildsLines.length > 1) add('allowBuilds-form', `line ${allowBuildsLines[1] + 1}: allowBuilds appears more than once`);
  if (allowBuildsLines.length >= 1) {
    const first = allowBuildsLines[0];
    if (bodies[first].trimEnd() !== 'allowBuilds:') {
      add('allowBuilds-form', `line ${first + 1}: allowBuilds must be a top-level block map`);
    } else {
      for (let i = first + 1; i < lines.length; i++) {
        const l = lines[i];
        if (l.trim() === '' || /^\s*#/.test(l)) continue;
        if (!/^\s/.test(l)) break;
        if (/^\s*-\s/.test(l)) {
          add('allowBuilds-form', `line ${i + 1}: allowBuilds is a map, not a list (EZD-000 T26)`);
          continue;
        }
        const m = /^\s+(['"]?)([^'":]+)\1:\s*(.+?)\s*$/.exec(l);
        if (!m) add('allowBuilds-entry', `line ${i + 1}: allowBuilds entry is "<package>: <value>"`);
        else if (m[3] !== 'false') add('allowBuilds-entry', `line ${i + 1}: allowBuilds entry ${m[2]} must be false (Q-0140 (a))`);
      }
    }
  }
  return problems;
}

// EZD-177 (vault/plans/EZD-177.md sections 1, 3): pnpm_config_ environment names in package scripts.
const PNPM_CONFIG_RE = /pnpm_config_/i;

// R2 (vault/plans/EZD-177.md section 3): problems of one package.json text, in this order.
function pnpmConfigScriptProblems(text) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return ['unreadable'];
  }
  if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) return ['unreadable'];
  if (pkg.scripts === undefined) return [];
  const scripts = pkg.scripts;
  if (scripts === null || typeof scripts !== 'object' || Array.isArray(scripts)) return ['scripts not an object'];
  const problems = [];
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd !== 'string') problems.push(`script ${name} not a string`);
    else if (PNPM_CONFIG_RE.test(cmd)) problems.push(`script ${name}`);
  }
  return problems;
}

// R3 (vault/plans/EZD-177.md section 3): repo-relative package.json paths of the workspace packages.
function workspacePackageFiles() {
  const found = ['package.json'];
  for (const f of ['app/package.json', 'worker/package.json']) {
    if (existsSync(path.join(root, f))) found.push(f);
  }
  for (const d of ['packages', 'spikes']) {
    const dir = path.join(root, d);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = `${d}/${entry.name}/package.json`;
      if (existsSync(path.join(root, rel))) found.push(rel);
    }
  }
  const rest = found.slice(1).sort();
  return [found[0], ...rest];
}

// EZD-182 (vault/plans/EZD-182.md sections 1, 3): pnpm flags that turn dependency build scripts on past allowBuilds (Q-0316 (a)).
const BUILD_FLAG_RE = /--(?:dangerously-allow-all-builds|config\.|allow-build)/i;

// R2 (vault/plans/EZD-182.md section 3): problems of one package.json text, in this order.
function buildFlagScriptProblems(text) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return ['unreadable'];
  }
  if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) return ['unreadable'];
  if (pkg.scripts === undefined) return [];
  const scripts = pkg.scripts;
  if (scripts === null || typeof scripts !== 'object' || Array.isArray(scripts)) return ['scripts not an object'];
  const problems = [];
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd !== 'string') problems.push(`script ${name} not a string`);
    else if (BUILD_FLAG_RE.test(cmd)) problems.push(`script ${name}`);
  }
  return problems;
}

describe('EZD-001 repo tooling', () => {
  // ---------- T4 ----------
  test('EZD-001 T4: geometry has no DOM or Node types', () => {
    const cfg = showConfig('@ezdraft/geometry');
    const lib = cfg.compilerOptions?.lib;
    assert.ok(Array.isArray(lib) && lib.length > 0, 'compilerOptions.lib must be present');
    assert.ok(!lib.some((l) => /dom/i.test(l)), `lib must have no DOM entry, got ${JSON.stringify(lib)}`);
    const types = cfg.compilerOptions?.types ?? [];
    assert.ok(!types.includes('node'), `types must not include node, got ${JSON.stringify(types)}`);

    const base = path.join(geoDir, 'tsconfig.json');
    const probeCase = (name, source) => {
      const d = tmpDir(`ezd001-t4-${name}-`);
      const probe = path.join(d, 'probe.ts');
      writeFileSync(probe, source);
      const cfgPath = path.join(d, 'tsconfig.json');
      writeFileSync(cfgPath, JSON.stringify({ extends: base, include: [], files: [probe] }));
      return run('pnpm', ['--filter', '@ezdraft/geometry', 'exec', 'tsc', '--noEmit', '-p', cfgPath]);
    };
    const a = probeCase('a', 'export const t = document.title;\n');
    assert.notEqual(a.status, 0, '(a) a DOM access must fail the geometry type check');
    assert.ok(/document/.test(a.stdout + a.stderr), '(a) the error names document');
    const b = probeCase('b', 'export const n: number = 1;\n');
    assert.equal(b.status, 0, `(b) plain TypeScript must pass: ${b.stdout}${b.stderr}`);
  });

  // ---------- T5 ----------
  test('EZD-001 T5: strict typing in app and geometry', () => {
    assert.equal(showConfig('@ezdraft/app').compilerOptions?.strict, true, 'app strict');
    assert.equal(showConfig('@ezdraft/geometry').compilerOptions?.strict, true, 'geometry strict');
  });

  // ---------- T6 ----------
  test('EZD-001 T6: TypeScript stays inside its package', () => {
    const appPkg = readJson(path.join(appDir, 'package.json'));
    if (/\bnext typegen\b/.test(appPkg.scripts?.typecheck || '')) {
      run('pnpm', ['--filter', '@ezdraft/app', 'exec', 'next', 'typegen']);
    }
    for (const [filter, dir] of [['@ezdraft/app', appDir], ['@ezdraft/geometry', geoDir]]) {
      const files = showConfig(filter).files;
      assert.ok(Array.isArray(files) && files.length > 0, `${filter}: showConfig files list present`);
      for (const f of files) {
        const abs = path.resolve(dir, f);
        assert.ok(abs.startsWith(dir + path.sep), `${filter}: ${f} is inside ${dir}`);
        assert.ok(!entersExcluded(abs), `${filter}: ${f} is not under vault/, spikes/ or .claude/`);
      }
    }
  });

  // ---------- T7 ----------
  test('EZD-001 T7: ESLint ignores vault/, spikes/ and .claude/ and lints app and geometry', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    for (const p of ['vault/tools/next_ticket.mjs', 'spikes/EZD-027-canvas/page.tsx', '.claude/worktrees/EZD-999/app/src/app/page.tsx']) {
      assert.equal(await eslint.isPathIgnored(p), true, `${p} must be ignored`);
    }
    for (const p of ['app/src/app/page.tsx', 'packages/geometry/src/index.ts']) {
      assert.equal(await eslint.isPathIgnored(p), false, `${p} must be linted`);
    }
  });

  // ---------- T8 ----------
  test('EZD-001 T8: ESLint configs per package', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    const appCfg = await eslint.calculateConfigForFile('app/src/app/page.tsx');
    const geoCfg = await eslint.calculateConfigForFile('packages/geometry/src/index.ts');
    assert.ok(Object.keys(appCfg.plugins || {}).includes('@next/next'), 'app config has the @next/next plugin');
    assert.ok(!Object.keys(geoCfg.plugins || {}).includes('@next/next'), 'geometry config has no @next/next plugin');
    const [result] = await eslint.lintText('const unused = 1;\n', { filePath: 'packages/geometry/src/probe.ts' });
    const hits = result.messages.filter((m) => m.ruleId === '@typescript-eslint/no-unused-vars' && m.severity === 2);
    assert.ok(hits.length >= 1, `expected an error from @typescript-eslint/no-unused-vars, got ${JSON.stringify(result.messages)}`);
  });

  // ---------- T9 ----------
  test('EZD-001 T9: Vitest discovery from the root never enters .claude/, vault/ or spikes/', () => {
    const probeDir = path.join(root, '.claude', 'worktrees', '__ezd001_probe__', 'packages', 'geometry', 'src');
    const probe = path.join(probeDir, 'probe.test.ts');
    try {
      mkdirSync(probeDir, { recursive: true });
      writeFileSync(probe, "import { test } from 'vitest';\ntest('probe', () => { throw new Error('probe'); });\n");
      const r = run('pnpm', ['exec', 'vitest', 'list', '--filesOnly', '--json']);
      assert.equal(r.status, 0, `vitest list failed: ${r.stderr}`);
      const start = r.stdout.indexOf('[');
      assert.ok(start >= 0, 'vitest list prints a JSON array');
      const files = JSON.parse(r.stdout.slice(start)).map((e) => (typeof e === 'string' ? e : e.file));
      const rels = files.map((f) => path.relative(root, f).split(path.sep).join('/'));
      assert.ok(rels.includes('packages/geometry/src/index.test.ts'), `lists the geometry test, got ${JSON.stringify(rels)}`);
      for (const f of files) assert.ok(!entersExcluded(f), `${f} is outside .claude/, vault/ and spikes/`);
    } finally {
      rmSync(path.join(root, '.claude', 'worktrees', '__ezd001_probe__'), { recursive: true, force: true });
    }
  });

  // ---------- T10 ----------
  test('EZD-001 T10: package wiring', () => {
    const app = readJson(path.join(appDir, 'package.json'));
    assert.equal(app.name, '@ezdraft/app');
    assert.equal(app.private, true);
    for (const s of ['dev', 'build', 'start', 'typecheck', 'lint', 'test']) assert.equal(typeof app.scripts?.[s], 'string', `app script ${s}`);
    assert.ok(app.scripts.build.startsWith('next build'), 'app build starts with next build');

    const geo = readJson(path.join(geoDir, 'package.json'));
    assert.equal(geo.name, '@ezdraft/geometry');
    assert.equal(geo.private, true);
    assert.equal(geo.type, 'module');
    assert.equal(geo.exports?.['.'], './src/index.ts');
    for (const s of ['typecheck', 'lint', 'test']) assert.equal(typeof geo.scripts?.[s], 'string', `geometry script ${s}`);
    assert.equal(geo.scripts.build, undefined, 'geometry has no build script');
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dep of ['react', 'react-dom', 'next']) {
        assert.ok(!(dep in (geo[field] || {})), `geometry ${field} must not contain ${dep}`);
      }
    }

    const rootPkg = readJson(path.join(root, 'package.json'));
    for (const s of ['typecheck', 'lint', 'test', 'build']) {
      const cmd = rootPkg.scripts?.[s];
      assert.equal(typeof cmd, 'string', `root script ${s}`);
      for (const token of ['pnpm -r', '--if-present', '"!./spikes/**"', `run ${s}`]) {
        assert.ok(cmd.includes(token), `root ${s} keeps "${token}" (EZD-000 fan-out): ${cmd}`);
      }
    }
    assert.ok(rootPkg.scripts.lint.includes('scripts/conventions/check.mjs'), 'root lint runs the conventions check');
    assert.ok(rootPkg.scripts.test.includes('scripts/**/*.test.mjs'), 'root test runs the repo node:test files');
    assert.ok(rootPkg.scripts.test.includes('--test-concurrency=4'), 'root test sets --test-concurrency=4 (Q-0019 read as 4, Q-0114)');
    assert.equal(typeof rootPkg.scripts.format, 'string', 'root format script');
    assert.equal(typeof rootPkg.scripts['format:check'], 'string', 'root format:check script');

    const ws = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    const lines = ws.split(/\r?\n/);
    assert.ok(lines.some((l) => /^workspaceConcurrency:\s*1\s*$/.test(l)), 'pnpm-workspace.yaml has top-level workspaceConcurrency: 1 (Q-0139 (a))');
    assert.deepEqual(buildSettingProblems(ws).map((p) => `${p.rule}: ${p.msg}`), [], 'pnpm-workspace.yaml build settings (Q-0140 (a), EZD-148)');
  });

  // ---------- T11 ----------
  test('EZD-001 T11: dependencies registered in docs/architecture.md and C1 passes', () => {
    const doc = readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
    const rows = new Map();
    for (const line of doc.split(/\r?\n/)) {
      const m = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*$/.exec(line);
      if (m) rows.set(m[1], { version: m[2], addedBy: m[5].trim() });
    }
    for (const name of ['eslint', '@eslint/js', 'typescript-eslint', 'eslint-config-next', 'prettier', '@types/node', '@types/react', '@types/react-dom']) {
      assert.ok(rows.has(name), `Dependencies row for ${name}`);
      assert.equal(rows.get(name).addedBy, 'EZD-001', `${name} Added by`);
    }
    for (const name of ['next', 'react', 'react-dom', 'typescript', 'vitest']) {
      assert.ok(rows.has(name), `Dependencies row for ${name}`);
      assert.equal(rows.get(name).addedBy, 'EZD-000', `${name} Added by stays EZD-000`);
    }
    const r = run('node', [checkScript, root]);
    assert.equal(r.status, 0, `conventions check must pass:\n${r.stdout}${r.stderr}`);
  });

  // ---------- T12 ----------
  test('EZD-001 T12: Prettier scope', async () => {
    const prettier = await importFromRoot('prettier');
    const opts = { ignorePath: [path.join(root, '.gitignore'), path.join(root, '.prettierignore')] };
    for (const p of ['vault/PROCESS.md', 'scripts/gate.mjs', '.github/workflows/ci.yml', 'docs/architecture.md', 'spikes/EZD-027-canvas/a.ts']) {
      const info = await prettier.getFileInfo(path.join(root, p), opts);
      assert.equal(info.ignored, true, `${p} must be ignored by Prettier`);
    }
    for (const p of ['app/src/app/page.tsx', 'packages/geometry/src/index.ts']) {
      const info = await prettier.getFileInfo(path.join(root, p), opts);
      assert.equal(info.ignored, false, `${p} must be formatted by Prettier`);
    }
  });

  // ---------- T13 ----------
  // Phase scope follows tickets.json `phase` since the re-cut (Q-0194, Q-0218; fix Q-0221), not floor(number / 100).
  test('EZD-001 T13: gate scope selection', () => {
    const base = tmpDir('ezd001-t13-');
    const scope = (name, extra = []) => {
      const d = path.join(base, name);
      mkdirSync(d, { recursive: true });
      const r = run('node', [gateScript, d, ...extra, '--print-scope']);
      return { r, json: r.status === 0 ? JSON.parse(r.stdout.trim().split(/\r?\n/).find((l) => l.startsWith('{'))) : null };
    };
    const tickets = readJson(path.join(root, 'vault', 'tickets', 'tickets.json')).tickets;
    const phaseOf = new Map(tickets.map((t) => [t.id, t.phase]));
    const cases = [
      ['EZD-001', []],
      ['EZD-133', []],
      ['EZD-1710', []],
      ['EZD-1401', []],
      ['EZD-026a', []],
    ];
    for (const [name, extra] of cases) {
      const { r, json } = scope(name, extra);
      assert.equal(r.status, 0, `${name} exits 0: ${r.stderr}`);
      assert.equal(json.mode, 'phase', `${name}: mode`);
      assert.equal(json.phase, phaseOf.get(name), `${name}: phase from tickets.json`);
    }
    const e = scope('develop');
    assert.equal(e.r.status, 0);
    assert.equal(e.json.mode, 'full', '(e) develop folder runs the full suite');
    const f = scope('EZD-133', ['--full']);
    assert.equal(f.r.status, 0);
    assert.equal(f.json.mode, 'full', '(f) --full overrides the folder name');
    const h = scope('develop', ['--phase', 'x']);
    assert.notEqual(h.r.status, 0, '(h) a bad --phase exits non-zero');
    assert.ok(!phaseOf.has('EZD-9999'));
    assert.notEqual(scope('EZD-9999').r.status, 0, '(i) a worktree ticket missing from tickets.json exits non-zero');
    const phases = [...new Set(tickets.map((t) => t.phase))].sort((a, b) => a - b);
    const empty = phases[phases.length - 1] + 1;
    assert.notEqual(scope('develop', ['--phase', String(empty)]).r.status, 0, '(j) a phase with no tickets exits non-zero');

    // (k) for every phase, the grep matches exactly that phase's tickets from tickets.json, plus @smoke.
    for (const n of phases) {
      const { r, json } = scope('develop', ['--phase', String(n)]);
      assert.equal(r.status, 0, `phase ${n} exits 0: ${r.stderr}`);
      assert.equal(json.mode, 'phase');
      assert.equal(json.phase, n);
      const re = new RegExp(json.grep);
      assert.ok(re.test('EZD-000 y @smoke'), `phase ${n} grep matches @smoke`);
      const mine = new Set(tickets.filter((t) => t.phase === n).map((t) => t.id));
      for (const t of tickets) {
        assert.equal(re.test(`describe ${t.id} x`), mine.has(t.id), `phase ${n} grep vs ${t.id} (phase ${t.phase})`);
        assert.equal(re.test(`${t.id}: done when`), mine.has(t.id), `phase ${n} grep vs "${t.id}:"`);
      }
      for (const id of mine) {
        for (const s of [`${id}9 x`, `${id}z x`]) {
          if (!mine.has(s.split(' ')[0])) assert.ok(!re.test(s), `phase ${n} grep does not match "${s}"`);
        }
      }
    }

    // (l) Phase 0 keeps its old selection: the same tickets.json IDs the number grep EZD-0\d{2} picked.
    const old0 = new RegExp('(?:EZD-0\\d{2}[a-z]?(?![0-9]))');
    const new0 = new RegExp(scope('EZD-001').json.grep);
    for (const t of tickets) assert.equal(new0.test(`${t.id} x`), old0.test(`${t.id} x`), `phase 0 selection unchanged for ${t.id}`);
  });

  // ---------- T14 ----------
  test('EZD-001 T14: Vitest honours the scope grep', () => {
    const T1 = 'EZD-001 geometry package done when: loads with no DOM @smoke';
    const runCase = (label, env) => {
      const out = path.join(tmpDir(`ezd001-t14-${label}-`), 'report.json');
      const r = run('pnpm', ['--filter', '@ezdraft/geometry', 'exec', 'vitest', 'run', '--reporter=json', `--outputFile=${out}`], { env });
      assert.ok(existsSync(out), `(${label}) JSON report written: ${r.stdout}${r.stderr}`);
      const report = readJson(out);
      const t1 = report.testResults.flatMap((f) => f.assertionResults).find((a) => a.fullName === T1);
      assert.ok(t1, `(${label}) T1 present in the report by full name`);
      return { r, report, t1 };
    };
    const a = runCase('a', { EZD_TEST_GREP: '(?:EZD-0\\d{2}[a-z]?(?![0-9]))|@smoke' });
    assert.equal(a.t1.status, 'passed', '(a) phase 0 grep runs T1');
    assert.equal(a.r.status, 0);
    const b = runCase('b', { EZD_TEST_GREP: 'EZD-1\\d{2}[a-z]?(?![0-9])' });
    assert.notEqual(b.t1.status, 'passed', '(b) phase 1 grep without @smoke skips T1');
    assert.equal(b.report.numFailedTests, 0, '(b) nothing fails');
    assert.equal(b.r.status, 0, '(b) exit 0');
    const c = runCase('c', { EZD_TEST_GREP: '(?:EZD-1\\d{2}[a-z]?(?![0-9]))|@smoke' });
    assert.equal(c.t1.status, 'passed', '(c) phase 1 grep with @smoke runs T1');
    const d = runCase('d', {});
    assert.equal(d.t1.status, 'passed', '(d) no grep runs T1');
    assert.equal(d.r.status, 0);
  });

  // ---------- T15 ----------
  test('EZD-001 T15: worker limits in the package Vitest configs', () => {
    for (const p of [path.join(appDir, 'vitest.config.mts'), path.join(geoDir, 'vitest.config.ts')]) {
      const text = readFileSync(p, 'utf8');
      assert.ok(/\bmaxWorkers\s*:\s*4\b/.test(text), `${p} sets maxWorkers to 4 (Q-0114)`);
      assert.ok(text.includes('EZD_TEST_GREP'), `${p} reads EZD_TEST_GREP`);
    }
  });

  // ---------- T16 ----------
  test('EZD-001 T16: C9 test files carry a ticket ID', () => {
    const PNPM = '9.1.0';
    const archDoc = [
      '# Architecture (fixture)', '', '## Dependencies', '',
      '| Package | Version | Used in | Why | Added by |', '| --- | --- | --- | --- | --- |',
      `| \`pnpm\` | \`${PNPM}\` | root | fixture | EZD-000 |`, '',
    ].join('\n');
    const fixture = (file, content) => {
      const d = tmpDir('ezd001-t16-');
      const files = {
        'docs/architecture.md': archDoc,
        'pnpm-workspace.yaml': 'packages:\n  - app\n  - packages/*\n  - worker\n  - spikes/*\n',
        'package.json': JSON.stringify({ name: 'ezdraft', private: true, packageManager: `pnpm@${PNPM}` }),
        'app/package.json': JSON.stringify({ name: '@ezdraft/app', private: true }),
        'packages/geometry/package.json': JSON.stringify({ name: '@ezdraft/geometry', private: true }),
        [file]: content,
      };
      for (const [rel, text] of Object.entries(files)) {
        const p = path.join(d, ...rel.split('/'));
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, text);
      }
      const r = run('node', [checkScript, d]);
      return { r, c9: (r.stdout + r.stderr).split(/\r?\n/).filter((l) => l.startsWith('[C9]')) };
    };
    const vitestHead = "import { describe, test } from 'vitest';\n";
    const pwHead = "import { test } from '@playwright/test';\n";

    const a = fixture('packages/geometry/src/a.test.ts', `${vitestHead}describe('EZD-201 parse', () => { test('x', () => {}); });\n`);
    assert.deepEqual(a.c9, [], '(a) a describe with a ticket ID passes');
    const b = fixture('packages/geometry/src/a.test.ts', `${vitestHead}describe('parse', () => { test('x', () => {}); });\n`);
    assert.ok(b.c9.some((l) => l.includes('packages/geometry/src/a.test.ts')), `(b) [C9] names the file: ${b.r.stdout}`);
    assert.equal(b.r.status, 1, '(b) exit 1');
    const c = fixture('app/e2e/s.spec.ts', `${pwHead}test.describe('EZD-016a sign-in', () => { test('x', async () => {}); });\n`);
    assert.deepEqual(c.c9, [], '(c) test.describe with a lettered ticket ID passes');
    const d = fixture('app/e2e/s.spec.ts', `${pwHead}test('signs in', async () => {});\n`);
    assert.ok(d.c9.some((l) => l.includes('app/e2e/s.spec.ts')), `(d) [C9] names the file: ${d.r.stdout}`);
    assert.equal(d.r.status, 1, '(d) exit 1');
    const e = fixture('spikes/EZD-027-canvas/x.test.ts', `${vitestHead}test('x', () => {});\n`);
    assert.deepEqual(e.c9, [], '(e) spikes are outside the scan');
    const f = fixture('app/src/test-utils/h.test.ts', `${vitestHead}test('x', () => {});\n`);
    assert.deepEqual(f.c9, [], '(f) test-utils is exempt');
  });
});

// EZD-161 · geometry test files are type-checked (vault/plans/EZD-161.md sections 3-4; AC-EZD-161-1; Q-0268 sweep item 35;
// Q-0292 (a)). Probes live in packages/geometry/src/__ezd161_probe__/, removed at the start and in a finally of each test.
// Each test runs the real tsc or pnpm through run(); expected values come from the plan's section 3 and 4 rows.
describe('EZD-161 geometry tests are type-checked', () => {
  const probeDir = path.join(geoDir, 'src', '__ezd161_probe__');
  const removeProbe = () => rmSync(probeDir, { recursive: true, force: true });
  const writeProbe = (name, source) => {
    mkdirSync(probeDir, { recursive: true });
    writeFileSync(path.join(probeDir, name), source);
  };
  /** JSON from `tsc -p <file> --showConfig` run inside the package through pnpm (the file's showConfig takes only `.`). */
  function showConfigOf(filter, file) {
    const r = run('pnpm', ['--filter', filter, 'exec', 'tsc', '-p', file, '--showConfig']);
    assert.equal(r.status, 0, `tsc -p ${file} --showConfig for ${filter} failed: ${r.stderr || r.stdout}`);
    return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  }
  const hasDomLib = (lib) => lib.some((l) => /dom/i.test(l));

  // ---------- T1 ----------
  test('EZD-161 T1: a type error in a geometry test file fails pnpm typecheck', { timeout: 300_000 }, () => {
    try {
      removeProbe();
      writeProbe('probe.test.ts', "export const probe: number = 'not a number';\n");
      const a = run('pnpm', ['typecheck']);
      const outA = a.stdout + a.stderr;
      assert.notEqual(a.status, 0, '(a) a string assigned to a number in a geometry test must fail pnpm typecheck');
      assert.ok(outA.includes('probe.test.ts'), `(a) the output names probe.test.ts: ${outA}`);
      assert.ok(outA.includes('TS2322'), `(a) the output holds TS2322: ${outA}`);
      writeProbe('probe.test.ts', 'export const probe: number = 1;\n');
      const b = run('pnpm', ['typecheck']);
      assert.equal(b.status, 0, `(b) control: the probe and the existing tests type-check: ${b.stdout}${b.stderr}`);
    } finally {
      removeProbe();
    }
  });

  // ---------- T2 ----------
  test('EZD-161 T2: geometry test files are type-checked with no DOM types', { timeout: 300_000 }, () => {
    try {
      removeProbe();
      const cfg = showConfigOf('@ezdraft/geometry', 'tsconfig.test.json');
      const lib = cfg.compilerOptions?.lib;
      assert.ok(Array.isArray(lib) && lib.length > 0, `(a) compilerOptions.lib is a non-empty array: ${JSON.stringify(lib)}`);
      assert.ok(!hasDomLib(lib), `(a) the test program lib has no DOM entry: ${JSON.stringify(lib)}`);
      const files = cfg.files;
      assert.ok(Array.isArray(files) && files.length > 0, `(a) showConfig files list present: ${JSON.stringify(files)}`);
      const resolved = files.map((f) => path.resolve(geoDir, f));
      assert.ok(resolved.includes(path.join(geoDir, 'src', 'index.test.ts')), `(a) files holds src/index.test.ts: ${JSON.stringify(files)}`);
      for (const abs of resolved) {
        assert.ok(abs.startsWith(geoDir + path.sep), `(a) ${abs} is inside ${geoDir}`);
        assert.ok(!entersExcluded(abs), `(a) ${abs} is not under vault/, spikes/ or .claude/`);
      }
      writeProbe('dom.test.ts', 'export const t = document.title;\n');
      const b = run('pnpm', ['--filter', '@ezdraft/geometry', 'run', 'typecheck']);
      const outB = b.stdout + b.stderr;
      assert.notEqual(b.status, 0, '(b) a DOM global in a geometry test must fail the geometry typecheck');
      assert.ok(outB.includes('dom.test.ts'), `(b) the output names dom.test.ts: ${outB}`);
      assert.ok(outB.includes('document'), `(b) the output names document: ${outB}`);
    } finally {
      removeProbe();
    }
  });

  // ---------- T3 ----------
  // A guard, not a red test: the source program already leaves tests out today; it fails once a change drops the exclude.
  test('EZD-161 T3: the source program still leaves test files out', { timeout: 300_000 }, () => {
    const cfg = showConfig('@ezdraft/geometry');
    assert.ok(Array.isArray(cfg.files) && cfg.files.length > 0, `source program files list present: ${JSON.stringify(cfg.files)}`);
    const tests = cfg.files.filter((f) => f.endsWith('.test.ts'));
    assert.deepEqual(tests, [], `the source program holds no test file: ${JSON.stringify(tests)}`);
  });

  // ---------- T5 ----------
  test('EZD-161 T5: geometry vitest.config.ts is type-checked by its own program', { timeout: 300_000 }, () => {
    const cfg = showConfigOf('@ezdraft/geometry', 'tsconfig.config.json');
    const files = cfg.files;
    assert.ok(Array.isArray(files) && files.length === 1, `(a) the config program has exactly 1 file: ${JSON.stringify(files)}`);
    assert.equal(path.resolve(geoDir, files[0]), path.join(geoDir, 'vitest.config.ts'), '(a) the one file is vitest.config.ts');
    const lib = cfg.compilerOptions?.lib;
    assert.ok(Array.isArray(lib) && lib.length > 0, `(a) compilerOptions.lib is a non-empty array: ${JSON.stringify(lib)}`);
    assert.ok(!hasDomLib(lib), `(a) the config program lib has no DOM entry: ${JSON.stringify(lib)}`);
    const b = run('pnpm', ['--filter', '@ezdraft/geometry', 'exec', 'tsc', '--noEmit', '-p', 'tsconfig.config.json']);
    assert.equal(b.status, 0, `(b) tsc -p tsconfig.config.json passes: ${b.stdout}${b.stderr}`);
    const pkg = readJson(path.join(geoDir, 'package.json'));
    assert.equal(
      pkg.scripts?.typecheck,
      'tsc --noEmit -p . && tsc --noEmit -p tsconfig.test.json && tsc --noEmit -p tsconfig.config.json',
      '(c) the geometry typecheck script runs the three programs in order',
    );
  });
});

// EZD-148 T2, T4 (vault/plans/EZD-148.md section 4). Expected rules come from the plan's decisions D4, D7, D8, D11 and
// Q-0140 (a); the real pnpm-workspace.yaml is the base of every sample (D11). Tests match rule names, never message text (D12).
describe('EZD-148 repo rule bypass forms', () => {
  // ---------- T2 ----------
  test('EZD-148 T2 pnpm build settings refuse permissions, allow-all and allowBuilds bypass forms (AC-EZD-148-1)', () => {
    const wsText = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    const base = wsText.endsWith('\n') ? wsText : `${wsText}\n`;
    assert.deepEqual(buildSettingProblems(base), [], 'base: the real pnpm-workspace.yaml has no problem');

    // W8 = EZD-023e T17's `block` regex, verbatim: on the real file it spans from `allowBuilds:` to the end of the file.
    const W8 = /^allowBuilds:\n(?:[ \t]+.*\n|\n)*/m;
    const w8 = base.replace(W8, 'allowBuilds: { esbuild: true }\n');
    assert.notEqual(w8, base, 'w8: the allowBuilds block was replaced');
    const w10 = base.replace('  esbuild: false', '  esbuild: true');
    assert.notEqual(w10, base, 'w10: the esbuild entry was changed');

    const samples = [
      ['w1', `${base}permissions:\n  esbuild:\n    build: true\n`, 'permissions'],
      ['w2', `${base}"permissions": {}\n`, 'permissions'],
      ['w3', '{ packages: [app], permissions: { esbuild: { build: true } } }\n', 'permissions'],
      // the text line is `"permi\u0073sions": {}` with one backslash
      ['w4', `${base}"permi\\u0073sions": {}\n`, 'unreadable'],
      ['w5', `${base}? permissions\n: {}\n`, 'unreadable'],
      ['w6', `${base}dangerouslyAllowAllBuilds: True\n`, 'allow-all'],
      ['w7', `${base}"dangerouslyAllowAllBuilds": true\n`, 'allow-all'],
      ['w8', w8, 'allowBuilds-form'],
      ['w9', `${base}allowBuilds:\n  esbuild: true\n`, 'allowBuilds-form'],
      ['w10', w10, 'allowBuilds-entry'],
      // w11: the key is split by an escaped line break; the first text line `"permi\` ends with one backslash
      ['w11', `${base}"permi\\\n ssions": {}\n`, 'unreadable'],
      // w12: a ` #` inside a quoted scalar leaves an open quote in the comment-stripped body (plan D4)
      ['w12', `${base}{ x: 'a #', permissions: {} }\n`, 'unreadable'],
      // w13: a \ escape inside double quotes; the text line is `x: "a\tb"` with one backslash
      ['w13', `${base}x: "a\\tb"\n`, 'unreadable'],
      // w14, w15: a stray quote in a plain scalar must not pair with the opener of a real quoted scalar (round 2, plan D4)
      ['w14', "{ packages: [app], x: a'b, y: 'c #', permissions: { esbuild: { build: true } } }\n", 'unreadable'],
      ['w15', `${base}x: { a: a'b, b: 'c #', permissions: { esbuild: { build: true } } }\n`, 'unreadable'],
      // w16: the round-1 control c7 fits no quote shape (plan D4); the text line is `x: "ok" # it's`
      ['w16', `${base}x: "ok" # it's\n`, 'unreadable'],
      // w17: a no-break space (U+00A0) before `#` is not YAML white space (plan D13)
      ['w17', '{ packages: [app], x: a\u00A0#, permissions: { esbuild: { build: true } } }\n', 'unreadable'],
      // w18: a key right after `[` (plan D13)
      ['w18', '{ packages: [permissions: {}] }\n', 'permissions'],
      // w19, w20: an anchored scalar reused as an alias key (round 4, plan D4 NODE_START_RE)
      ['w19', `${base}x: &k permissions\n*k : { esbuild: { build: true } }\n`, 'unreadable'],
      ['w20', '{ packages: [app], x: &k permissions, *k : { esbuild: { build: true } } }\n', 'unreadable'],
    ];
    const missed = [];
    for (const [id, sample, rule] of samples) {
      const got = buildSettingProblems(sample);
      if (!got.some((p) => p.rule === rule)) missed.push(`${id}: no problem with rule ${rule}, got [${got.map((p) => p.rule)}]`);
    }
    assert.deepEqual(missed, [], 'every bypass sample gets its rule');

    // c4: a comment that names the key is not a setting
    assert.deepEqual(buildSettingProblems(`${base}# permissions: x\n`), [], 'c4: a commented permissions line is no problem');
    // c7: shape Q1, a single-quoted scalar then a quote-free comment (plan D4)
    assert.deepEqual(buildSettingProblems(`${base}x: 'ok' # a comment\n`), [], 'c7: a single-quoted value then a quote-free comment is no problem');
  });

  // ---------- T4 ----------
  // D1 and D2 are written in the plan with \` for a backtick inside a code span; the docs hold plain backticks.
  test('EZD-148 T4 docs name the build-settings and cache rules (AC-EZD-148-1)', () => {
    const doc = readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
    const d1 = 'The pnpm `permissions` setting (pnpm 12.11; its `build` capability overrides `allowBuilds`) is never used (EZD-148).';
    assert.ok(doc.includes(d1), 'docs/architecture.md holds the D1 sentence');
    const lines = doc.split(/\r?\n/);
    const mc = lines.findIndex((l) => l.trim() === '## Machine checks');
    assert.ok(mc >= 0, '## Machine checks heading');
    let end = lines.length;
    for (let i = mc + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }
    const rows = lines.slice(mc, end).filter((l) => {
      const t = l.trim();
      if (!t.startsWith('|')) return false;
      const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      return cells[cells.length - 1] === 'EZD-148';
    });
    assert.ok(rows.length > 0, 'Machine checks table row whose last cell is EZD-148');
    assert.ok(
      rows.some((r) => ['EZD-148 T1', 'EZD-148 T2', 'EZD-148 T3'].every((s) => r.includes(s))),
      'the EZD-148 row names EZD-148 T1, EZD-148 T2 and EZD-148 T3',
    );
  });
});

describe('EZD-177 pnpm_config names', () => {
  test('EZD-177 T2 package scripts naming pnpm_config_ are refused and the real package files pass (AC-EZD-177-1, AC-EZD-177-2)', async (t) => {
    await t.test('T2 (a) a script that sets PNPM_CONFIG_ before pnpm (AC-EZD-177-1)', () => {
      const text = JSON.stringify({ scripts: { build: 'PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true pnpm install' } });
      assert.deepEqual(pnpmConfigScriptProblems(text), ['script build']);
    });

    await t.test('T2 (b) a cross-env wrapper with pnpm_config_ (AC-EZD-177-1)', () => {
      const text = JSON.stringify({ scripts: { setup: 'cross-env pnpm_config_ignore_scripts=false pnpm rebuild' } });
      assert.deepEqual(pnpmConfigScriptProblems(text), ['script setup']);
    });

    await t.test('T2 (c) mixed case, any script name reported (AC-EZD-177-1)', () => {
      const text = JSON.stringify({ scripts: { a: 'env Pnpm_Config_Dangerously_Allow_All_Builds=true pnpm i', b: 'echo ok' } });
      assert.deepEqual(pnpmConfigScriptProblems(text), ['script a']);
    });

    await t.test('T2 (d) two scripts, reported in script order (AC-EZD-177-1)', () => {
      const text = JSON.stringify({ scripts: { a: 'export PNPM_CONFIG_X=1 && pnpm i', b: 'PNPM_CONFIG_Y=1 pnpm i' } });
      assert.deepEqual(pnpmConfigScriptProblems(text), ['script a', 'script b']);
    });

    await t.test('T2 (e) text that is not JSON is unreadable (AC-EZD-177-1)', () => {
      assert.deepEqual(pnpmConfigScriptProblems('{'), ['unreadable']);
    });

    await t.test('T2 (f) JSON that is not an object is unreadable (AC-EZD-177-1)', () => {
      assert.deepEqual(pnpmConfigScriptProblems('"x"'), ['unreadable']);
    });

    await t.test('T2 (g) scripts as an array is refused (AC-EZD-177-1)', () => {
      assert.deepEqual(pnpmConfigScriptProblems(JSON.stringify({ scripts: ['PNPM_CONFIG_X=1 pnpm i'] })), ['scripts not an object']);
    });

    await t.test('T2 (h) scripts as null is refused (AC-EZD-177-1)', () => {
      assert.deepEqual(pnpmConfigScriptProblems(JSON.stringify({ scripts: null })), ['scripts not an object']);
    });

    await t.test('T2 (i) a script that is not a string is refused (AC-EZD-177-1)', () => {
      assert.deepEqual(pnpmConfigScriptProblems(JSON.stringify({ scripts: { a: ['PNPM_CONFIG_X=1'] } })), ['script a not a string']);
    });

    await t.test('T2 (j) control: no scripts key gives no problem (AC-EZD-177-2)', () => {
      assert.deepEqual(pnpmConfigScriptProblems(JSON.stringify({ name: 'x' })), []);
    });

    await t.test('T2 (k) control: npm_config_, PNPM_HOME and pnpm config get pass (AC-EZD-177-2)', () => {
      const text = JSON.stringify({
        scripts: { a: 'npm_config_loglevel=error pnpm i', b: 'PNPM_HOME=/tmp/pnpm pnpm i', c: 'pnpm config get store-dir' },
      });
      assert.deepEqual(pnpmConfigScriptProblems(text), []);
    });

    await t.test('T2 (l) the real package files pass (AC-EZD-177-2)', () => {
      const files = workspacePackageFiles();
      assert.equal(files[0], 'package.json');
      assert.ok(files.includes('app/package.json'), 'app/package.json is listed');
      assert.ok(files.includes('packages/geometry/package.json'), 'packages/geometry/package.json is listed');
      for (const f of files) {
        assert.deepEqual(pnpmConfigScriptProblems(readFileSync(path.join(root, f), 'utf8')), [], f);
      }
    });
  });

  test('EZD-177 T3 docs record the pnpm_config_ rule', () => {
    const doc = readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
    const D1 = 'Settings from environment names (Q-0283 (a); EZD-177): pnpm 12 also reads its settings from `PNPM_CONFIG_*` and `pnpm_config_*` environment names (pnpm 12.14.0 CHANGELOG, 12.8.2 and 12.3.0 entries), so `PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true` would run new build scripts past `allowBuilds`. No workflow file and no workspace `package.json` script names `pnpm_config_` in any letter case: `ci.test.mjs` rule (l) and `tooling.test.mjs` EZD-177 T2 refuse it. A name built at run time is checked by review.';
    const D2 = '| — | No workflow or workspace package script names a `pnpm_config_` environment name (any letter case) | `scripts/ci/__tests__/ci.test.mjs` (EZD-177 T1, rule (l)), `scripts/tooling/__tests__/tooling.test.mjs` (EZD-177 T2) | EZD-177 |';
    const lines = doc.split(/\r?\n/);
    assert.ok(lines.includes(D1), 'docs/architecture.md holds the D1 paragraph line in ## Adding a dependency');
    assert.ok(lines.includes(D2), 'docs/architecture.md holds the D2 row in ## Machine checks');
    const dep = lines.findIndex((l) => l.startsWith('Dependency build scripts (Q-0140 (a)):'));
    const folder = lines.indexOf('## Folder layout');
    const d1 = lines.indexOf(D1);
    assert.ok(dep >= 0 && folder > dep, 'the Dependency build scripts paragraph comes before ## Folder layout');
    assert.ok(d1 > dep && d1 < folder, 'D1 comes after the Dependency build scripts paragraph and before ## Folder layout');
  });
});

// ---------- EZD-182 pnpm build flags ----------
// Plan: vault/plans/EZD-182.md sections 3 and 4. Expected values are the plan's texts.
describe('EZD-182 pnpm build flags', () => {
  const J = (o) => JSON.stringify(o);

  test('EZD-182 T2 package scripts passing a pnpm build flag are refused and the real package files pass (AC-EZD-182-1, AC-EZD-182-2)', async (t) => {
    await t.test('T2 (a) a postinstall script with --allow-build is refused (AC-EZD-182-1)', () => {
      assert.deepEqual(buildFlagScriptProblems(J({ scripts: { postinstall: 'pnpm rebuild --allow-build=esbuild' } })), ['script postinstall']);
    });

    await t.test('T2 (b) --dangerously-allow-all-builds in a script is refused (AC-EZD-182-1)', () => {
      assert.deepEqual(buildFlagScriptProblems(J({ scripts: { setup: 'pnpm install --dangerously-allow-all-builds' } })), ['script setup']);
    });

    await t.test('T2 (c) mixed-case --CONFIG. form is refused, any script name reported (AC-EZD-182-1)', () => {
      assert.deepEqual(buildFlagScriptProblems(J({ scripts: { i: 'pnpm install --CONFIG.dangerously-allow-all-builds=true' } })), ['script i']);
    });

    await t.test('T2 (d) letter case and reported script only (AC-EZD-182-1)', () => {
      assert.deepEqual(buildFlagScriptProblems(J({ scripts: { a: 'pnpm i --Allow-Build esbuild', b: 'echo ok' } })), ['script a']);
    });

    await t.test('T2 (e) text that is not JSON is unreadable (AC-EZD-182-1)', () => {
      assert.deepEqual(buildFlagScriptProblems('{'), ['unreadable']);
    });

    await t.test('T2 (f) JSON that is an array is unreadable (AC-EZD-182-1)', () => {
      assert.deepEqual(buildFlagScriptProblems('[]'), ['unreadable']);
    });

    await t.test('T2 (g) scripts as an array is refused (AC-EZD-182-1)', () => {
      assert.deepEqual(buildFlagScriptProblems(J({ scripts: [] })), ['scripts not an object']);
    });

    await t.test('T2 (h) a script that is not a string is refused (AC-EZD-182-1)', () => {
      assert.deepEqual(buildFlagScriptProblems(J({ scripts: { a: 1 } })), ['script a not a string']);
    });

    await t.test('T2 (i) control: no scripts key gives no problem (AC-EZD-182-2)', () => {
      assert.deepEqual(buildFlagScriptProblems(J({})), []);
    });

    await t.test('T2 (j) control: a script with bare --config <file> passes (AC-EZD-182-2)', () => {
      assert.deepEqual(buildFlagScriptProblems(J({
        scripts: {
          test: 'vitest run --config vitest.config.ts',
          e2e: 'playwright test --config=playwright.config.ts',
        },
      })), []);
    });

    await t.test('T2 (k) the real package files pass (AC-EZD-182-2)', () => {
      const files = workspacePackageFiles();
      assert.equal(files[0], 'package.json');
      assert.ok(files.includes('app/package.json'), 'app/package.json is listed');
      for (const f of files) {
        assert.deepEqual(buildFlagScriptProblems(readFileSync(path.join(root, f), 'utf8')), [], f);
      }
    });
  });

  test('EZD-182 T4 docs record the build flag rule and the three checks share one pattern', () => {
    const D1 = 'Build flags (Q-0316 (a); EZD-182): pnpm 12 command-line flags also turn build scripts on past `allowBuilds`: `--dangerously-allow-all-builds`, `--config.<setting>` (the dot form, any setting) and `--allow-build <name>` (pnpm 12.14.0 `pnpm install --help`). No workflow line, workspace `package.json` script or `app/vercel.json` string value passes one, in any letter case: `ci.test.mjs` rule (m), `tooling.test.mjs` EZD-182 T2 and `hosting.test.mjs` EZD-182 T3 refuse them. The bare `--config <file>` of Vitest and Playwright stays allowed; a flag built at run time is checked by review.';
    const F = 'const BUILD_FLAG_RE = /--(?:dangerously-allow-all-builds|config\\.|allow-build)/i;';
    const docLines = readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8').split(/\r?\n/);
    assert.ok(docLines.includes(D1), 'docs/architecture.md holds the D1 paragraph line in ## Adding a dependency');
    for (const f of [
      path.join(root, 'scripts', 'ci', '__tests__', 'ci.test.mjs'),
      path.join(root, 'scripts', 'tooling', '__tests__', 'tooling.test.mjs'),
      path.join(root, 'scripts', 'hosting', '__tests__', 'hosting.test.mjs'),
    ]) {
      assert.ok(readFileSync(f, 'utf8').split(/\r?\n/).includes(F), `${path.relative(root, f)} holds line F`);
    }
  });
});
