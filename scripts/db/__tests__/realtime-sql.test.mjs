// EZD-018 T19, T20 (vault/plans/EZD-018.md Tests; Steps 1-3b, 5, 8): event names in SQL are typed, and the
// migration, docs and dependency checks. node:test, Node 22 built-ins only. T20 spawns gen-types.mjs
// --check, which needs the local stack the root `test` script starts with `pnpm run db:up`. Pattern:
// scripts/db/__tests__/tenancy-migrations.test.mjs (EZD-005a). Every scan counts what it could not read or
// parse and asserts that count is 0 (L-019); keys are matched with bounds on both sides (L-008).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migrationsDir = path.join(repo, 'supabase', 'migrations');
const eventsFile = path.join(repo, 'app', 'src', 'lib', 'realtime', 'events.ts');
const archFile = path.join(repo, 'docs', 'architecture.md');
const EVENT_RE = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;

// Step 1, 2, 3, 3b file name suffixes (plan Files) and the functions each creates or replaces (plan Data).
const FILES = {
  helpers: '_create_realtime_topic_helpers.sql',
  policies: '_create_realtime_message_policies.sql',
  broadcast: '_create_realtime_broadcast_functions.sql',
  endSessions: '_end_sessions_broadcast.sql',
};
const FUNCTIONS = {
  helpers: ['realtime_can_receive', 'realtime_can_track', 'realtime_topic_id'],
  broadcast: ['broadcast_project', 'broadcast_user'],
  endSessions: ['end_user_sessions'],
};

function childEnv() {
  const env = { ...process.env };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runNode(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: childEnv(),
  });
  return { status: r.status, out: `${r.stdout || ''}\n${r.stderr || ''}` };
}

// SQL with -- comments and /* */ blocks removed, case kept (T19 reads event names from it).
const stripSqlComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

// Comments removed, lower-cased, whitespace collapsed (T20 keyword checks).
const normalizeSql = (text) => stripSqlComments(text).toLowerCase().replace(/\s+/g, ' ');

// A variable or column (p_event, new.event, t.col): the only non-literal event argument excused in T19.
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)?$/;

function migrationFiles() {
  assert.ok(existsSync(migrationsDir), `${migrationsDir} exists`);
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function theFile(suffix) {
  const hits = migrationFiles().filter((f) => f.endsWith(suffix));
  assert.equal(hits.length, 1, `exactly one migration ending ${suffix}, found ${JSON.stringify(hits)}`);
  return path.join(migrationsDir, hits[0]);
}

// Top-level arguments of the call whose "(" is at `open`; null when the closing ")" is not found.
function callArgs(text, open) {
  const args = [];
  let depth = 0;
  let quote = false;
  let cur = '';
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      cur += ch;
      if (ch === "'") {
        if (text[i + 1] === "'") {
          cur += text[++i];
        } else quote = false;
      }
      continue;
    }
    if (ch === "'") {
      quote = true;
      cur += ch;
    } else if (ch === '(') {
      depth++;
      if (depth > 1) cur += ch;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        args.push(cur.trim());
        return args;
      }
      cur += ch;
    } else if (ch === ',' && depth === 1) {
      args.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  return null;
}

// The quoted keys of `export interface <name> { ... }` in events.ts; null when the block is missing.
function interfaceKeys(text, name) {
  const start = text.search(new RegExp(`interface\\s+${name}\\s*\\{`));
  if (start < 0) return null;
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        const body = text.slice(open + 1, i);
        // Top-level entries only: nested braces (payload types) are removed first.
        let flat = body;
        while (/\{[^{}]*\}/.test(flat)) flat = flat.replace(/\{[^{}]*\}/g, '');
        return [...flat.matchAll(/(?:^|[;,\s])'([^']+)'\s*:/g)].map((m) => m[1]);
      }
    }
  }
  return null;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const importsOf = (text, pkg) => {
  const p = pkg.replace(/[/.]/g, (c) => `\\${c}`);
  return new RegExp(
    `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*|import\\s+)['"]${p}(?:/[^'"]*)?['"]`,
  ).test(text);
};

// The text of a `##` section (up to the next `## `), or null.
function section(md, heading) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => l.trim() === heading);
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && !/^## /.test(lines[j])) j++;
  return lines.slice(i + 1, j).join('\n');
}

describe('EZD-018 realtime SQL, docs and dependency', () => {
  test('EZD-018 T19 event names used in migrations are keys of the typed maps', () => {
    assert.ok(existsSync(eventsFile), `${eventsFile} exists`);
    const events = readFileSync(eventsFile, 'utf8');
    const projectKeys = interfaceKeys(events, 'ProjectChannelEvents');
    const userKeys = interfaceKeys(events, 'UserChannelEvents');
    assert.ok(projectKeys, 'ProjectChannelEvents found in events.ts');
    assert.ok(userKeys, 'UserChannelEvents found in events.ts');
    assert.ok(projectKeys.includes('dev.ping'), 'ProjectChannelEvents has dev.ping');
    assert.ok(userKeys.includes('dev.ping'), 'UserChannelEvents has dev.ping');
    assert.ok(userKeys.includes('session.ended'), 'UserChannelEvents has session.ended');
    for (const k of [...projectKeys, ...userKeys]) assert.match(k, EVENT_RE, k);

    const definer = path.basename(theFile(FILES.broadcast));
    const maps = { project: new Set(projectKeys), user: new Set(userKeys) };
    const literals = [];
    const notLiteral = [];
    let unparsed = 0;
    for (const f of migrationFiles()) {
      if (f === definer) continue;
      const text = stripSqlComments(readFileSync(path.join(migrationsDir, f), 'utf8'));
      // private.broadcast_project / _user (event = 2nd of 3 args) and realtime.send (event = 2nd of 3-4).
      for (const m of text.matchAll(
        /(?<![A-Za-z0-9_])(?:broadcast_(project|user)|realtime\s*\.\s*send)\s*\(/gi,
      )) {
        const kind = m[1] ? m[1].toLowerCase() : 'send';
        const args = callArgs(text, m.index + m[0].length - 1);
        const arity = kind === 'send' ? [3, 4] : [3];
        if (!args || !arity.includes(args.length)) {
          unparsed++;
          continue;
        }
        const ev = args[1].trim();
        const lit = /^'([^']*)'$/.exec(ev);
        if (lit) literals.push({ file: f, kind, event: lit[1] });
        else if (!IDENT_RE.test(ev)) notLiteral.push({ file: f, kind, event: ev });
      }
    }
    assert.equal(unparsed, 0, 'every broadcast and realtime.send call in the migrations was parsed');
    assert.deepEqual(notLiteral, [], 'every event argument is a plain literal, a variable or a column');
    assert.ok(
      literals.some((l) => l.kind === 'user' && l.event === 'session.ended'),
      `session.ended literal found (${JSON.stringify(literals)})`,
    );
    for (const l of literals) {
      const ok =
        l.kind === 'send'
          ? maps.project.has(l.event) || maps.user.has(l.event)
          : maps[l.kind].has(l.event);
      assert.ok(ok, `${l.file}: ${l.event} is a key of the ${l.kind} map`);
    }
  });

  test('EZD-018 T20 migrations: definer, search_path, revoke per function; policies; no table; no grant', () => {
    for (const key of ['helpers', 'broadcast', 'endSessions']) {
      const file = theFile(FILES[key]);
      const sql = normalizeSql(readFileSync(file, 'utf8'));
      assert.ok(sql.includes('security definer'), `${file}: security definer`);
      assert.ok(sql.includes("set search_path = ''"), `${file}: set search_path = ''`);
      const created = [
        ...sql.matchAll(/create (?:or replace )?function private\.([a-z0-9_]+)\s*\(/g),
      ].map((m) => m[1]);
      assert.deepEqual([...new Set(created)].sort(), FUNCTIONS[key], `${file}: functions`);
      for (const fn of FUNCTIONS[key]) {
        const re = new RegExp(`revoke all on function private\\.${fn}\\s*\\([^)]*\\) from public;`, 'g');
        assert.equal((sql.match(re) || []).length, 1, `${file}: one revoke from public for ${fn}`);
      }
    }
    const policies = normalizeSql(readFileSync(theFile(FILES.policies), 'utf8'));
    assert.ok(policies.includes('create policy realtime_messages_select'), 'select policy');
    assert.ok(policies.includes('create policy realtime_messages_insert'), 'insert policy');
    for (const key of Object.keys(FILES)) {
      const sql = normalizeSql(readFileSync(theFile(FILES[key]), 'utf8'));
      assert.ok(!/create (?:unlogged )?table/.test(sql), `${FILES[key]}: no create table`);
    }
    const broadcast = normalizeSql(readFileSync(theFile(FILES.broadcast), 'utf8'));
    assert.ok(!/\bgrant\b/.test(broadcast), 'the broadcast file grants nothing');
  });

  test('EZD-018 T20 docs: Realtime subsection, dependency row, machine checks rows', () => {
    const md = readFileSync(archFile, 'utf8');
    const server = section(md, '## Server-only data access and can()');
    assert.ok(server !== null, '## Server-only data access and can() exists');
    const lines = server.split('\n');
    const i = lines.findIndex((l) => l.trim() === '### Realtime (EZD-018)');
    assert.ok(i >= 0, '### Realtime (EZD-018) under ## Server-only data access and can()');
    let j = i + 1;
    while (j < lines.length && !/^#{2,3} /.test(lines[j])) j++;
    const sub = lines.slice(i + 1, j).join('\n');
    for (const term of [
      'project:',
      'user:',
      'private.broadcast_project',
      'private.broadcast_user',
      '/api/realtime/token',
    ]) {
      assert.ok(sub.includes(term), `Realtime subsection names ${term}`);
    }

    const deps = section(md, '## Dependencies');
    assert.ok(deps !== null, '## Dependencies exists');
    const rows = deps
      .split('\n')
      .filter((l) => /^\|\s*`@supabase\/realtime-js`\s*\|/.test(l))
      .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
    assert.equal(rows.length, 1, 'one @supabase/realtime-js row');
    const [row] = rows;
    assert.equal(row[row.length - 1], 'EZD-018', 'Added by EZD-018');
    const docVersion = /^`([^`]+)`$/.exec(row[1])?.[1];
    assert.ok(docVersion, 'version cell is one backticked version');

    const pkg = JSON.parse(readFileSync(path.join(repo, 'app', 'package.json'), 'utf8'));
    const pkgVersion =
      pkg.dependencies?.['@supabase/realtime-js'] ?? pkg.devDependencies?.['@supabase/realtime-js'];
    assert.equal(pkgVersion, docVersion, 'app/package.json version equals the docs row');
    const lock = readFileSync(path.join(repo, 'pnpm-lock.yaml'), 'utf8');
    const lockVersions = new Set(
      [...lock.matchAll(/(?<![\w/-])@supabase\/realtime-js@([0-9][^\s:'"()]*)(?=[:'"(])/g)].map(
        (m) => m[1],
      ),
    );
    assert.deepEqual([...lockVersions], [docVersion], 'one @supabase/realtime-js version in the lockfile');

    const checks = section(md, '## Machine checks');
    assert.ok(checks !== null, '## Machine checks exists');
    const checkRows = checks.split('\n').filter((l) => l.startsWith('|') && l.includes('EZD-018'));
    assert.ok(
      checkRows.some((l) => l.includes('setInterval') && l.includes('eslint.config.mjs')),
      'machine checks row: no polling (setInterval, eslint.config.mjs, EZD-018)',
    );
    assert.ok(
      checkRows.some((l) => l.includes('events.ts') && l.includes('T19')),
      'machine checks row: Realtime event names in events.ts (EZD-018, T19)',
    );
  });

  test('EZD-018 T20 browser folders import no supabase-js, only adapter.ts imports realtime-js, no console', () => {
    const dirs = [
      path.join(repo, 'app', 'src', 'lib', 'realtime'),
      path.join(repo, 'app', 'src', 'app', 'dev', 'realtime'),
    ];
    const expected = [
      'app/src/lib/realtime/topics.ts',
      'app/src/lib/realtime/events.ts',
      'app/src/lib/realtime/hub.ts',
      'app/src/lib/realtime/adapter.ts',
      'app/src/lib/realtime/index.ts',
      'app/src/lib/realtime/react.ts',
      'app/src/app/dev/realtime/page.tsx',
      'app/src/app/dev/realtime/RealtimeProbe.tsx',
    ];
    for (const f of expected) assert.ok(existsSync(path.join(repo, f)), `${f} exists`);
    const files = dirs.flatMap((d) => (existsSync(d) ? walk(d) : []));
    let unread = 0;
    const realtimeImporters = [];
    for (const file of files) {
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        unread++;
        continue;
      }
      const rel = path.relative(repo, file).split(path.sep).join('/');
      assert.ok(!importsOf(text, '@supabase/supabase-js'), `${rel} imports @supabase/supabase-js`);
      assert.ok(!text.includes('console.'), `${rel} contains console.`);
      if (importsOf(text, '@supabase/realtime-js')) realtimeImporters.push(rel);
    }
    assert.equal(unread, 0, 'every file was read');
    assert.deepEqual(realtimeImporters, ['app/src/lib/realtime/adapter.ts']);
  });

  test('EZD-018 T20 convention checks and generated types pass', () => {
    const c = runNode(path.join(repo, 'scripts', 'conventions', 'check.mjs'), ['.']);
    assert.equal(c.status, 0, c.out.slice(-4000));
    const g = runNode(path.join(repo, 'scripts', 'db', 'gen-types.mjs'), ['--check']);
    assert.equal(g.status, 0, g.out.slice(-4000));
  });
});
