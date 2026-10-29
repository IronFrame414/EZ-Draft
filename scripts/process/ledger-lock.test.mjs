// EZD-173 tests K1-K21, M1-M5, S1, S2, X1 (plan vault/plans/EZD-173.md section 4): the ledger lock, the merge lock, ledger writes
// that never collide, and each unit's commit holding only its own files. Node built-ins only; every case builds a throwaway
// git repo on develop. Expected values come from the plan's interface contract (section 3) and its Decided table.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER = path.join(REPO, 'scripts/ledger.mjs');
const UNIT_STEPS = path.join(REPO, 'scripts/unit-steps.mjs');
const ledger = () => import(pathToFileURL(LEDGER).href);

const ID = ['-c', 'user.name=EZ Draft Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false'];
const git = (dir, ...a) => {
  const r = spawnSync('git', ['-C', dir, ...ID, ...a], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const temps = [];
const tmp = (prefix) => { const d = mkdtempSync(path.join(os.tmpdir(), prefix)); temps.push(d); return d; };
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function spawnP(cmd, args, { env, input, cwd } = {}) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { env, cwd });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => { stdout += d; });
    c.stderr.on('data', (d) => { stderr += d; });
    c.on('close', (status) => resolve({ status, stdout, stderr }));
    c.stdin.end(input ?? '');
  });
}
const holder = () => spawn(process.execPath, ['-e', 'setTimeout(()=>{},90000)'], { stdio: 'ignore' });
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;

const HEAD = '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
const QHEAD = '# Questions ledger\n\n| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n';
const STATUS = 'vault/tickets/STATUS.md';
const rowCells = (dir, id) => readFileSync(path.join(dir, STATUS), 'utf8').split('\n').find((l) => l.startsWith(`| ${id} `))?.split('|').slice(1, -1).map((c) => c.trim());
const NAMES = { 3: 'Thing three' };
const originOf = new Map();
const inflightDirs = new Map();
const inflightFor = (dir) => { if (!inflightDirs.has(dir)) inflightDirs.set(dir, tmp('ezd173-inflight-')); return inflightDirs.get(dir); };

// The unit-steps fixture plus rows EZD-003..EZD-009, their tickets.json entries (phase 1), QUESTIONS, a lesson, DONE and CURRENT.
function fixture({ gateExit = 0, remote = false } = {}) {
  const dir = tmp('ezd173-');
  git(dir, 'init', '-q', '-b', 'develop');
  git(dir, 'config', 'user.name', 'EZ Draft Test');
  git(dir, 'config', 'user.email', 'test@example.test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  for (const d of ['vault/tickets', 'vault/tools', 'vault/handoff', 'vault/questions', 'vault/lessons', 'vault/plans']) mkdirSync(path.join(dir, d), { recursive: true });
  let rows = '| EZD-001 | 0 | Base | done | low |  | abc1234 | 3 |  |\n| EZD-002 | 0 | Thing two | ready | medium | EZD-001 |  |  | keep this note |\n';
  const tickets = [{ id: 'EZD-001', phase: 0, depends_on: [] }, { id: 'EZD-002', phase: 0, depends_on: ['EZD-001'] }];
  for (let n = 3; n <= 9; n++) {
    rows += `| EZD-00${n} | 1 | ${NAMES[n] || `Thing ${n}`} | ready | medium | EZD-001 |  |  |  |\n`;
    tickets.push({ id: `EZD-00${n}`, phase: 1, depends_on: ['EZD-001'] });
  }
  writeFileSync(path.join(dir, STATUS), `# Ledger\n\n${HEAD}${rows}`);
  writeFileSync(path.join(dir, 'vault/tickets/tickets.json'), JSON.stringify({ tickets }));
  writeFileSync(path.join(dir, 'vault/questions/QUESTIONS.md'), `${QHEAD}| Q-0001 | 0 / EZD-002 | setup | A first question? | open |  |  |  |\n`);
  writeFileSync(path.join(dir, 'vault/lessons/builder.md'), '# Builder lessons\n\n## L-007  areas: x  seen: 1  status: candidate\nRule: y.\n');
  writeFileSync(path.join(dir, 'vault/lessons/planner.md'), '# Planner lessons\n\n## L-009  areas: y  seen: 1  status: ratified\nRule: z.\n');
  writeFileSync(path.join(dir, 'vault/lessons/INDEX.md'), '# Lessons index\n\n| File | Role | Areas with entries |\n| --- | --- | --- |\n| builder.md | b | x (L-007, candidate) |\n| planner.md | p | y (L-009, ratified) |\n');
  writeFileSync(path.join(dir, 'vault/DONE.md'), '2026-10-01 · EZD-001 · base\n');
  writeFileSync(path.join(dir, 'vault/handoff/CURRENT.md'), '# Handoff\n\nold text\n');
  writeFileSync(path.join(dir, 'vault/tools/next_ticket.mjs'), 'process.exit(0);\n');
  cpSync(path.join(REPO, 'vault/tools/questions-files.mjs'), path.join(dir, 'vault/tools/questions-files.mjs'));
  writeFileSync(path.join(dir, 'gate-stub.mjs'), `console.log('ℹ pass 30');process.exit(${gateExit});\n`);
  writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  if (remote) {
    const origin = path.join(tmp('ezd173-origin-'), 'origin.git');
    git(dir, 'init', '--bare', '-q', origin);
    git(dir, 'remote', 'add', 'origin', origin);
    git(dir, 'push', '-q', 'origin', 'develop');
    originOf.set(dir, origin);
  }
  return dir;
}
// An env value of undefined removes the variable (M4 runs finish with EZD_NO_PUSH unset).
const envFor = (dir, extra = {}) => {
  const env = { ...process.env, EZD_ROOT: dir, EZD_INFLIGHT_DIR: inflightFor(dir), EZD_GATE_CMD: `node ${path.join(dir, 'gate-stub.mjs').replace(/\\/g, '/')}`, EZD_NO_PUSH: '1', ...extra };
  delete env.EZD_UNIT_ID;
  if ('EZD_UNIT_ID' in extra) env.EZD_UNIT_ID = extra.EZD_UNIT_ID;
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return env;
};
const cli = (dir, args, { input, env } = {}) => spawnSync(process.execPath, [LEDGER, ...args], { encoding: 'utf8', input: input ?? '', env: envFor(dir, env) });
const cliP = (dir, args, { input, env } = {}) => spawnP(process.execPath, [LEDGER, ...args], { input, env: envFor(dir, env) });
const us = (dir, args, env) => spawnSync(process.execPath, [UNIT_STEPS, ...args], { encoding: 'utf8', env: envFor(dir, env) });
const usP = (dir, args, env) => spawnP(process.execPath, [UNIT_STEPS, ...args], { env: envFor(dir, env) });
const lockPath = (dir, kind) => path.join(dir, '.git', `ezdraft-${kind}.lock`);
const writeLock = (dir, kind, rec) => writeFileSync(lockPath(dir, kind), `${JSON.stringify({ owner: 'test', at: new Date().toISOString(), base: null, ...rec })}\n`);
const commitIn = (dir, file, text, msg) => { writeFileSync(path.join(dir, file), text); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', msg); };
const filesOf = (dir, rev) => git(dir, 'show', '--name-only', '--format=', rev).split('\n').filter(Boolean);
const count = (dir) => Number(git(dir, 'rev-list', '--count', 'HEAD'));
const emptyRepo = () => { const d = tmp('ezd173-lock-'); git(d, 'init', '-q', '-b', 'develop'); return d; };

describe('EZD-173 K: ledger lock, ledger commands and commits', () => {
  test('K1: withLedgerLock writes the record while held, removes it after and returns fn\'s value', async () => {
    const L = await ledger();
    const dir = emptyRepo();
    assert.equal(L.LOCKS.ledger, 'ezdraft-ledger.lock');
    assert.equal(L.LOCKS.merge, 'ezdraft-merge.lock');
    const value = L.withLedgerLock(dir, { owner: 'k1' }, () => {
      const rec = JSON.parse(readFileSync(lockPath(dir, 'ledger'), 'utf8'));
      assert.equal(rec.pid, process.pid);
      assert.equal(rec.owner, 'k1');
      assert.equal(rec.base, null);
      assert.ok(Number.isFinite(Date.parse(rec.at)));
      assert.equal(L.holdsLock(dir, 'ledger'), true);
      assert.equal(L.readLock(dir, 'ledger').alive, true);
      return 42;
    });
    assert.equal(value, 42);
    assert.ok(!existsSync(lockPath(dir, 'ledger')));
    assert.equal(L.readLock(dir, 'ledger'), null);
  });

  test('K2: a stale lock (dead pid, unparsable text, or with an old takeover file) is taken over silently', async () => {
    const L = await ledger();
    const dir = emptyRepo();
    const attempts = [
      () => writeLock(dir, 'ledger', { pid: deadPid() }),
      () => writeFileSync(lockPath(dir, 'ledger'), 'not json'),
      () => {
        writeLock(dir, 'ledger', { pid: deadPid() });
        const take = `${lockPath(dir, 'ledger')}.takeover`;
        writeFileSync(take, '');
        const old = new Date(Date.now() - 11000);
        utimesSync(take, old, old);
      },
    ];
    for (const prepare of attempts) {
      prepare();
      let waited = 0;
      const h = L.acquireLock(dir, 'ledger', { owner: 'k2', timeoutMs: 2000, onWait: () => { waited++; } });
      assert.equal(JSON.parse(readFileSync(lockPath(dir, 'ledger'), 'utf8')).pid, process.pid);
      assert.equal(waited, 0, 'a stale lock is not a wait');
      h.release();
      assert.ok(!existsSync(`${lockPath(dir, 'ledger')}.takeover`));
      assert.ok(!existsSync(lockPath(dir, 'ledger')));
    }
  });

  test('K3: a live holder makes acquireLock time out with lock_timeout and call onWait once', async () => {
    const L = await ledger();
    const dir = emptyRepo();
    const child = holder();
    try {
      writeLock(dir, 'ledger', { pid: child.pid, owner: 'holder' });
      const before = readFileSync(lockPath(dir, 'ledger'), 'utf8');
      const seen = [];
      const t0 = Date.now();
      assert.throws(
        () => L.acquireLock(dir, 'ledger', { owner: 'k3', timeoutMs: 300, onWait: (r) => seen.push(r) }),
        (e) => e instanceof L.LockError && e.code === 'lock_timeout' && new RegExp(`^ledger lock held by pid ${child.pid} \\(holder\\) for over \\d+ s$`).test(e.message),
      );
      assert.ok(Date.now() - t0 >= 300);
      assert.equal(seen.length, 1);
      assert.equal(seen[0].pid, child.pid);
      assert.equal(seen[0].owner, 'holder');
      assert.equal(readFileSync(lockPath(dir, 'ledger'), 'utf8'), before);
      assert.equal(L.tryLock(dir, 'ledger', { owner: 'k3' }), null);
    } finally { child.kill(); }
  });

  test('K4: nesting and guards: lock_reentry, lock_order, ledger inside merge, lock_not_held, no_git_dir', async () => {
    const L = await ledger();
    const dir = emptyRepo();
    const code = (c) => (e) => e instanceof L.LockError && e.code === c;
    assert.throws(() => L.withLedgerLock(dir, { owner: 'a' }, () => L.withLedgerLock(dir, { owner: 'b' }, () => 1)), code('lock_reentry'));
    assert.throws(() => L.withLedgerLock(dir, { owner: 'a' }, () => L.withMergeLock(dir, { owner: 'b' }, () => 1)), code('lock_order'));
    assert.equal(L.withMergeLock(dir, { owner: 'a' }, () => L.withLedgerLock(dir, { owner: 'b' }, () => 'ok')), 'ok');
    assert.throws(() => L.commitPaths(dir, ['vault'], 'msg'), code('lock_not_held'));
    const nogit = tmp('ezd173-nogit-');
    writeFileSync(path.join(nogit, '.git'), 'gitdir: /nowhere\n');
    assert.throws(() => L.withLedgerLock(nogit, { owner: 'a' }, () => 1), code('no_git_dir'));
    assert.ok(!existsSync(lockPath(dir, 'ledger')) && !existsSync(lockPath(dir, 'merge')));
  });

  test('K5: eight status commands together all keep their change, one clean commit each', async () => {
    const dir = fixture();
    const before = count(dir);
    const results = await Promise.all([2, 3, 4, 5, 6, 7, 8, 9].map((n) => cliP(dir, ['status', `EZD-00${n}`, `notes=lane-${n}`])));
    results.forEach((r, i) => {
      const n = i + 2;
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`LEDGER OK EZD-00${n} status`));
      assert.equal(rowCells(dir, `EZD-00${n}`)[8], `lane-${n}`);
    });
    assert.equal(count(dir) - before, 8);
    for (const c of git(dir, 'rev-list', 'HEAD~8..HEAD').split('\n')) {
      assert.equal(git(dir, 'show', '--numstat', '--format=', c), `1\t1\t${STATUS}`);
    }
    assert.equal(git(dir, 'status', '--porcelain'), '');
  });

  test('K6: question, status and finish of two units together keep both rows and give each ticket its own Q-ID', async () => {
    const dir = fixture();
    const inflight = inflightFor(dir);
    for (const t of ['EZD-003', 'EZD-004']) writeFileSync(path.join(inflight, `build-${t}.json`), JSON.stringify({ id: `build-${t}`, pid: process.pid, unit: 'build', ticket: t }));
    const jobs = [];
    for (const t of ['EZD-003', 'EZD-004']) {
      jobs.push(cliP(dir, ['question', t, 'orchestrator', `${t} q`]));
      jobs.push(cliP(dir, ['status', t, 'status=blocked', `notes=${t}-n`]));
      jobs.push(usP(dir, ['finish', t, 'blocked'], { EZD_UNIT_ID: `build-${t}` }));
    }
    const res = await Promise.all(jobs);
    res.forEach((r) => assert.equal(r.status, 0, r.stdout + r.stderr));
    assert.match(res[2].stdout, /FINISH OK EZD-003 blocked/);
    assert.match(res[5].stdout, /FINISH OK EZD-004 blocked/);
    for (const t of ['EZD-003', 'EZD-004']) {
      const c = rowCells(dir, t);
      assert.equal(c[3], 'blocked');
      assert.equal(c[8], `${t}-n`);
    }
    const q = readFileSync(path.join(dir, 'vault/questions/QUESTIONS.md'), 'utf8');
    const ids = [];
    for (const t of ['EZD-003', 'EZD-004']) {
      const m = q.match(new RegExp(`^\\| (Q-000\\d) \\| 1 / ${t} \\| orchestrator \\((\\d{4}-\\d\\d-\\d\\d)\\) \\| ${t} q \\| open \\|  \\|  \\|  \\|$`, 'm'));
      assert.ok(m, `row for ${t} in\n${q}`);
      assert.equal(m[2], new Date().toISOString().slice(0, 10));
      ids.push(m[1]);
    }
    assert.deepEqual(ids.sort(), ['Q-0002', 'Q-0003']);
  });

  // EZD-266: K7 runs once with no open rows in QUESTIONS.md and once with one open row. Its expected max is taken over all three
  // question files (questionMax in questions-files.mjs, EZD-173 C16), not from QUESTIONS.md alone.
  for (const openRows of [false, true]) {
    const label = openRows ? 'open rows' : 'no open rows';
    test(`K7 (EZD-266 done when: ${label} in QUESTIONS.md): two plan recordings together get distinct Q-IDs, their own plan lines and their own handoff archives`, async () => {
      const root = tmp('ezd173-copy-');
      const vault = path.join(root, 'vault');
      cpSync(path.join(REPO, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
      // EZD-266 D2: the copy's question state. The seeded archive row holds the highest ID, so expected values never depend on the live ledger.
      const Q3 = ['questions/QUESTIONS.md', 'questions/QUESTIONS-answered.md', 'questions/QUESTIONS-archive.md'];
      const textOf = (rel) => (existsSync(path.join(vault, rel)) ? readFileSync(path.join(vault, rel), 'utf8') : '');
      const qNums = (text) => [...text.matchAll(/^\|\s*Q-(\d{4})\s*\|/gm)].map((m) => Number(m[1]));
      const insertAfterSeparator = (rel, row) => {
        const lines = textOf(rel).split('\n');
        const at = lines.findIndex((l) => /^\| -/.test(l));
        if (at < 0) assert.fail(`${rel} has no table separator`);
        lines.splice(at + 1, 0, row);
        writeFileSync(path.join(vault, rel), lines.join('\n'));
      };
      const archived = Math.max(0, ...Q3.flatMap((f) => qNums(textOf(f)))) + 1;
      insertAfterSeparator('questions/QUESTIONS-archive.md', `| Q-${String(archived).padStart(4, '0')} | 1 / EZD-266 | test (2026-10-29) | K7 seeded archived question? | answered-agent | test | a | EZD-266 |`);
      writeFileSync(path.join(vault, 'questions/QUESTIONS.md'), textOf('questions/QUESTIONS.md').split('\n').filter((l) => !/^\|\s*Q-\d{4}\s*\|/.test(l)).join('\n'));
      let seed;
      if (openRows) {
        seed = archived + 1;
        insertAfterSeparator('questions/QUESTIONS.md', `| Q-${String(seed).padStart(4, '0')} | 1 / EZD-266 | test (2026-10-29) | K7 seeded open question? | open |  |  |  |`);
      }
      git(root, 'init', '-q', '-b', 'develop');
      git(root, 'config', 'user.name', 'EZ Draft Test');
      git(root, 'config', 'user.email', 'test@example.test');
      git(root, 'config', 'commit.gpgsign', 'false');
      git(root, 'add', '-A');
      git(root, 'commit', '-qm', 'copy');
      const tickets = JSON.parse(readFileSync(path.join(vault, 'tickets/tickets.json'), 'utf8')).tickets;
      const phaseOf = (t) => tickets.find((x) => x.id === t).phase;
      for (const t of ['EZD-173', 'EZD-174']) {
        writeFileSync(path.join(vault, `plans/${t}.md`), `# ${t}\n\n- **Complexity:** medium\n\n## 10. Open questions\n- **QP-1:** Question for ${t}?\n`);
      }
      git(root, 'add', '-A');
      git(root, 'commit', '-qm', 'plans');
      const qPath = path.join(vault, 'questions/QUESTIONS.md');
      // EZD-266 D3: the expected max over the copy's three files, a missing file counts as empty.
      const max = Math.max(0, ...Q3.flatMap((f) => qNums(textOf(f))));
      // EZD-266 D4: state proofs before the drivers, so each variant provably ran in the state it names.
      const openCount = qNums(textOf('questions/QUESTIONS.md')).length;
      assert.equal(openCount, openRows ? 1 : 0, `${label}: QUESTIONS.md has ${openCount} Q rows, expected ${openRows ? 1 : 0}`);
      const wantMax = openRows ? seed : archived;
      assert.equal(max, wantMax, `${label}: max is ${max}, expected ${wantMax}`);
      assert.ok(max + 2 <= 9999, `${label}: max ${max} leaves no room for two 4-digit Q-IDs`);
      const logs = () => readdirSync(path.join(vault, 'handoff/log')).length;
      const logsBefore = logs();
      const driver = path.join(tmp('ezd173-driver-'), 'driver.mjs');
      writeFileSync(driver, `const [ledger, nt, root, ticket, calls] = process.argv.slice(2);
const L = await import(ledger); const NT = await import(nt);
const { appendFileSync } = await import('node:fs');
L.withLedgerLock(root, { owner: 'k7 ' + ticket }, () => {
  const r = L.recordPlan(root, { ticket, assignQuestionIds: NT.assignQuestionIds, setArchitecture: (id) => { appendFileSync(calls, id + '\\n'); return { ok: true, message: 'x' }; }, nextUnit: () => 'x' });
  L.commitPaths(root, r.paths, 'docs(vault): plan ' + ticket);
});
`);
      const nt = pathToFileURL(path.join(vault, 'tools/next_ticket.mjs')).href;
      const calls = path.join(tmp('ezd173-calls-'), 'arch-calls.txt');
      const rs = await Promise.all(['EZD-173', 'EZD-174'].map((t) => spawnP(process.execPath, [driver, pathToFileURL(LEDGER).href, nt, root, t, calls], { env: { ...process.env, EZD_INFLIGHT_DIR: inflightFor(root) } })));
      rs.forEach((r) => assert.equal(r.status, 0, r.stdout + r.stderr));
      assert.deepEqual(new Set((existsSync(calls) ? readFileSync(calls, 'utf8') : '').split('\n').filter(Boolean)), new Set(['EZD-173', 'EZD-174']));
      for (const t of ['EZD-173', 'EZD-174']) {
        const c = rowCells(root, t);
        assert.equal(c[3], 'questions');
        assert.equal(c[4], 'medium');
      }
      const q = readFileSync(qPath, 'utf8');
      const got = [];
      for (const t of ['EZD-173', 'EZD-174']) {
        const m = q.match(new RegExp(`^\\| (Q-\\d{4}) \\| ${phaseOf(t)} / ${t} \\(plan QP-1\\) \\|.*Question for ${t}\\?`, 'm'));
        assert.ok(m, `Q row for ${t}`);
        got.push(m[1]);
        assert.match(readFileSync(path.join(vault, `plans/${t}.md`), 'utf8'), new RegExp(`^- \\*\\*${m[1]} \\(was QP-1\\):\\*\\* Question for ${t}\\?$`, 'm'));
      }
      assert.deepEqual(new Set(got), new Set([`Q-${String(max + 1).padStart(4, '0')}`, `Q-${String(max + 2).padStart(4, '0')}`]));
      assert.equal(logs() - logsBefore, 2);
    });
  }

  test('K8: with another unit in flight, finish commits only this unit\'s own paths', () => {
    const dir = fixture();
    writeFileSync(path.join(inflightFor(dir), 'build-EZD-003.json'), JSON.stringify({ id: 'build-EZD-003', pid: process.pid }));
    writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), 'plan two\n');
    writeFileSync(path.join(dir, 'vault/plans/EZD-003.md'), 'plan three\n');
    writeFileSync(path.join(dir, 'vault/lessons/builder.md'), 'changed by another unit\n');
    const r = us(dir, ['finish', 'EZD-002', 'done'], { EZD_UNIT_ID: 'build-EZD-002' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): EZD-002 done');
    assert.deepEqual(filesOf(dir, 'HEAD'), ['vault/plans/EZD-002.md']);
    const left = spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map((l) => l.slice(3)).sort();
    assert.deepEqual(left, ['vault/lessons/builder.md', 'vault/plans/EZD-003.md']);
  });

  test('K9: with no other unit in flight, finish commits all of vault/', () => {
    const dir = fixture();
    writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), 'plan two\n');
    writeFileSync(path.join(dir, 'vault/plans/EZD-003.md'), 'plan three\n');
    writeFileSync(path.join(dir, 'vault/lessons/builder.md'), 'changed\n');
    const r = us(dir, ['finish', 'EZD-002', 'done'], { EZD_UNIT_ID: 'build-EZD-002' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(filesOf(dir, 'HEAD').sort(), ['vault/lessons/builder.md', 'vault/plans/EZD-002.md', 'vault/plans/EZD-003.md']);
  });

  test('K10: lesson, seen, append (lesson and DONE) and handoff write their files, number the lesson and archive twice in a minute', async () => {
    const dir = fixture();
    const E = '## L-next  areas: tooling  seen: 1  status: candidate\nRule: x.';
    const read = (rel) => readFileSync(path.join(dir, rel), 'utf8');
    // (a) lesson
    let c = count(dir);
    let r = cli(dir, ['lesson', 'EZD-002', 'vault/lessons/builder.md', 'vault/lessons/planner.md'], { input: E });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim(), /^LEDGER OK L-010$/);
    assert.ok(read('vault/lessons/builder.md').endsWith('Rule: y.\n\n## L-010  areas: tooling  seen: 1  status: candidate\nRule: x.\n'));
    assert.ok(read('vault/lessons/planner.md').endsWith('Rule: z.\n\n## L-010  areas: tooling  seen: 1  status: candidate\nRule: x.\n'));
    const idx = read('vault/lessons/INDEX.md');
    assert.ok(idx.includes('| builder.md | b | x (L-007, candidate); tooling (L-010, candidate) |'), idx);
    assert.ok(idx.includes('| planner.md | p | y (L-009, ratified); tooling (L-010, candidate) |'), idx);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): EZD-002 lesson L-010');
    assert.deepEqual(filesOf(dir, 'HEAD').sort(), ['vault/lessons/INDEX.md', 'vault/lessons/builder.md', 'vault/lessons/planner.md']);
    assert.equal(count(dir) - c, 1);
    // (b) seen
    c = count(dir);
    r = cli(dir, ['seen', 'EZD-002', 'L-010']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim(), /^LEDGER OK L-010 seen 2$/);
    assert.equal(read('vault/lessons/builder.md').split('\n').filter((l) => l.startsWith('## L-010  ')).join(), '## L-010  areas: tooling  seen: 2  status: candidate');
    assert.equal(read('vault/lessons/planner.md').split('\n').filter((l) => l.startsWith('## L-010  ')).join(), '## L-010  areas: tooling  seen: 2  status: candidate');
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): EZD-002 seen L-010');
    assert.deepEqual(filesOf(dir, 'HEAD').sort(), ['vault/lessons/builder.md', 'vault/lessons/planner.md']);
    assert.equal(count(dir) - c, 1);
    // (c) append to a lessons file
    c = count(dir);
    r = cli(dir, ['append', 'vault/lessons/planner.md', 'EZD-002'], { input: '- 2026-10-28 EZD-002: x.' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim(), /^LEDGER OK vault\/lessons\/planner\.md$/);
    assert.ok(read('vault/lessons/planner.md').endsWith('Rule: x.\n- 2026-10-28 EZD-002: x.\n'));
    assert.deepEqual(filesOf(dir, 'HEAD'), ['vault/lessons/planner.md']);
    assert.equal(count(dir) - c, 1);
    // (d) append to DONE.md
    c = count(dir);
    r = cli(dir, ['append', 'vault/DONE.md', 'EZD-002'], { input: '2026-10-24 · EZD-002 · x\n' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(read('vault/DONE.md'), '2026-10-01 · EZD-001 · base\n2026-10-24 · EZD-002 · x\n');
    assert.deepEqual(filesOf(dir, 'HEAD'), ['vault/DONE.md']);
    assert.equal(count(dir) - c, 1);
    // (e) handoff: the CLI, then writeHandoff twice with one fixed minute
    const logDir = path.join(dir, 'vault/handoff/log');
    c = count(dir);
    r = cli(dir, ['handoff', 'EZD-002'], { input: 'one' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim(), /^LEDGER OK vault\/handoff\/CURRENT\.md$/);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): handoff EZD-002');
    const made = readdirSync(logDir);
    assert.equal(made.length, 1);
    assert.equal(readFileSync(path.join(logDir, made[0]), 'utf8'), '# Handoff\n\nold text\n');
    assert.equal(read('vault/handoff/CURRENT.md'), 'one\n');
    assert.deepEqual(filesOf(dir, 'HEAD').sort(), ['vault/handoff/CURRENT.md', `vault/handoff/log/${made[0]}`]);
    assert.equal(count(dir) - c, 1);
    const L = await ledger();
    const now = new Date('2026-10-24T10:00:30Z');
    for (let i = 0; i < 2; i++) await L.withLedgerLock(dir, { owner: 'k10' }, async () => L.writeHandoff(dir, { label: 'k10', text: 'two', now }));
    assert.equal(readFileSync(path.join(logDir, '2026-10-24-10-00.md'), 'utf8'), 'one\n');
    assert.equal(readFileSync(path.join(logDir, '2026-10-24-10-00-2.md'), 'utf8'), 'two\n');
    assert.equal(read('vault/handoff/CURRENT.md'), 'two\n');
  });

  test('K11: answer replaces columns 5-8 and keeps columns 1-4', () => {
    const dir = fixture();
    const r = cli(dir, ['answer', 'Q-0001', 'answered-agent', 'orchestrator', 'a', 'Q-0125']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /LEDGER OK Q-0001/);
    const cells = readFileSync(path.join(dir, 'vault/questions/QUESTIONS.md'), 'utf8').split('\n').find((l) => l.startsWith('| Q-0001 ')).split('|').slice(1, -1).map((c) => c.trim());
    assert.deepEqual(cells, ['Q-0001', '0 / EZD-002', 'setup', 'A first question?', 'answered-agent', 'orchestrator', 'a', 'Q-0125']);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): answer Q-0001');
  });

  test('K12: bad commands exit 2 with LEDGER USAGE, unknown tickets, questions and lessons exit 1 with LEDGER FAIL; nothing changes', () => {
    const dir = fixture();
    commitIn(dir, 'vault/lessons/reviewer.md', '# r\n', 'add reviewer lessons');
    const head = git(dir, 'rev-parse', 'HEAD');
    const E = '## L-next  areas: tooling  seen: 1  status: candidate\nRule: x.';
    const usage = [
      [['status', 'EZD-002', 'colour=x'], ''],
      [['status', 'EZD-002', 'status=doing'], ''],
      [['status', 'EZD-002', 'notes=a|b'], ''],
      [['status', 'EZD-002'], ''],
      [['append', 'vault/STATUS.md', 'EZD-002'], 'x'],
      [['append', 'vault/DONE.md', 'EZD-002'], ''],
      [['answer', 'Q-0001', 'maybe', 'a', 'b', 'c'], ''],
      [['bogus'], ''],
      [['append', 'vault/lessons/INDEX.md', 'EZD-002'], 'x'],
      [['append', 'vault/lessons/builder.md', 'EZD-002'], E],
      [['lesson', 'EZD-002', 'vault/lessons/nobody.md'], E],
      [['lesson', 'EZD-002', 'vault/lessons/builder.md'], E.replace('status: candidate', 'status: ratified')],
      [['lesson', 'EZD-002', 'vault/lessons/builder.md', 'vault/lessons/builder.md'], E],
      [['seen', 'EZD-002', '7'], ''],
    ];
    assert.equal(usage.length, 14);
    for (const [args, input] of usage) {
      const r = cli(dir, args, { input });
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout + r.stderr, /LEDGER USAGE: /);
    }
    const fails = [
      [['status', 'EZD-099', 'notes=x'], '', 'LEDGER FAIL: EZD-099 has no STATUS row'],
      [['question', 'EZD-099', 'a', 'b'], '', 'LEDGER FAIL: EZD-099 not in tickets.json'],
      [['answer', 'Q-9999', 'open', 'a', 'b', 'c'], '', 'LEDGER FAIL: Q-9999 not in vault/questions'],
      [['seen', 'EZD-002', 'L-999'], '', 'LEDGER FAIL: L-999 not in vault/lessons'],
      [['lesson', 'EZD-002', 'vault/lessons/reviewer.md'], E, 'LEDGER FAIL: vault/lessons/reviewer.md has no INDEX.md row'],
    ];
    assert.equal(fails.length, 5);
    for (const [args, input, text] of fails) {
      const r = cli(dir, args, { input });
      assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.ok((r.stdout + r.stderr).includes(text), r.stdout + r.stderr);
    }
    assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
    assert.equal(git(dir, 'status', '--porcelain'), '');
  });

  const QROW = {
    first: '| Q-0001 | 0 / EZD-002 | setup | A first question? | answered-agent | orchestrator | x | Q-0125 |',
    moved: '| Q-0012 | 1 / EZD-003 | planner (2026-10-01) | Moved? | answered-agent | orchestrator | x | Q-0125 |',
    old: '| Q-0007 | 1 / EZD-002 | planner (2026-10-01) | Old? | answered-josh | Josh | y | Q-0125 |',
    older: '| Q-0030 | 1 / EZD-002 | planner (2026-10-01) | Older? | answered-josh | Josh | z | Q-0125 |',
  };
  const QDIR = 'vault/questions/';
  function threeFiles() {
    const dir = fixture();
    writeFileSync(path.join(dir, QDIR, 'QUESTIONS.md'), QHEAD);
    writeFileSync(path.join(dir, QDIR, 'QUESTIONS-answered.md'), `${QHEAD}${QROW.first}\n${QROW.moved}\n`);
    writeFileSync(path.join(dir, QDIR, 'QUESTIONS-archive.md'), `${QHEAD}${QROW.old}\n`);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'three questions files');
    return dir;
  }
  const afterSep = (dir, file) => { const l = readFileSync(path.join(dir, QDIR, file), 'utf8').split('\n'); return l[l.findIndex((x) => x.startsWith('| --- ')) + 1]; };

  test('K20: question numbers across the three files and writes only QUESTIONS.md', () => {
    const dir = threeFiles();
    const answered = readFileSync(path.join(dir, QDIR, 'QUESTIONS-answered.md'), 'utf8');
    const archive = readFileSync(path.join(dir, QDIR, 'QUESTIONS-archive.md'), 'utf8');
    const today = new Date().toISOString().slice(0, 10);
    let r = cli(dir, ['question', 'EZD-003', 'orchestrator', 'k20 a']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /LEDGER OK Q-0013/);
    assert.equal(afterSep(dir, 'QUESTIONS.md'), `| Q-0013 | 1 / EZD-003 | orchestrator (${today}) | k20 a | open |  |  |  |`);
    assert.equal(readFileSync(path.join(dir, QDIR, 'QUESTIONS-answered.md'), 'utf8'), answered);
    assert.equal(readFileSync(path.join(dir, QDIR, 'QUESTIONS-archive.md'), 'utf8'), archive);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): EZD-003 question Q-0013');
    assert.deepEqual(filesOf(dir, 'HEAD'), ['vault/questions/QUESTIONS.md']);
    commitIn(dir, `${QDIR}QUESTIONS-archive.md`, `${archive}${QROW.older}\n`, 'older archive row');
    r = cli(dir, ['question', 'EZD-004', 'orchestrator', 'k20 b']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /LEDGER OK Q-0031/);
    const lines = readFileSync(path.join(dir, QDIR, 'QUESTIONS.md'), 'utf8').split('\n');
    const i = lines.findIndex((l) => l.startsWith('| Q-0013 '));
    assert.equal(lines[i + 1], `| Q-0031 | 1 / EZD-004 | orchestrator (${today}) | k20 b | open |  |  |  |`);
  });

  test('K21: answer finds the row in any of the three files and moves a row to QUESTIONS.md when it is escalated', () => {
    const dir = threeFiles();
    const rd = (f) => readFileSync(path.join(dir, QDIR, f), 'utf8');
    const open0 = rd('QUESTIONS.md');
    const archive0 = rd('QUESTIONS-archive.md');
    let r = cli(dir, ['answer', 'Q-0012', 'confirmed-josh', 'josh', 'y', 'Q-0409']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /LEDGER OK Q-0012/);
    const row = rd('QUESTIONS-answered.md').split('\n').find((l) => l.startsWith('| Q-0012 ')).split('|').slice(1, -1).map((c) => c.trim());
    assert.deepEqual(row, ['Q-0012', '1 / EZD-003', 'planner (2026-10-01)', 'Moved?', 'confirmed-josh', 'josh', 'y', 'Q-0409']);
    assert.equal(rd('QUESTIONS.md'), open0);
    assert.equal(rd('QUESTIONS-archive.md'), archive0);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): answer Q-0012');
    assert.deepEqual(filesOf(dir, 'HEAD'), ['vault/questions/QUESTIONS-answered.md']);
    r = cli(dir, ['answer', 'Q-0007', 'escalated', 'orchestrator', 'z', 'Q-0409']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /LEDGER OK Q-0007/);
    assert.ok(!rd('QUESTIONS-archive.md').includes('| Q-0007 '), 'Q-0007 left the archive');
    assert.equal(afterSep(dir, 'QUESTIONS.md'), '| Q-0007 | 1 / EZD-002 | planner (2026-10-01) | Old? | escalated | orchestrator | z | Q-0409 |');
    assert.deepEqual(filesOf(dir, 'HEAD').sort(), ['vault/questions/QUESTIONS-archive.md', 'vault/questions/QUESTIONS.md']);
    const head = git(dir, 'rev-parse', 'HEAD');
    r = cli(dir, ['answer', 'Q-0099', 'open', 'a', 'b', 'c']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok((r.stdout + r.stderr).includes('LEDGER FAIL: Q-0099 not in vault/questions'), r.stdout + r.stderr);
    assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
    assert.equal(git(dir, 'status', '--porcelain'), '');
  });

  test('K13: a command waits for a live holder and then writes', async () => {
    const dir = fixture();
    const child = holder();
    try {
      writeLock(dir, 'ledger', { pid: child.pid, owner: 'holder' });
      const p = cliP(dir, ['status', 'EZD-002', 'notes=x']);
      let exited = false;
      p.then(() => { exited = true; });
      const head = git(dir, 'rev-parse', 'HEAD');
      await wait(1000);
      assert.equal(exited, false, 'the command is still waiting');
      assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
      assert.equal(rowCells(dir, 'EZD-002')[8], 'keep this note');
      rmSync(lockPath(dir, 'ledger'));
      const r = await p;
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.equal(rowCells(dir, 'EZD-002')[8], 'x');
    } finally { child.kill(); }
  });

  test('K14: in-flight records: unitId, listInflight, othersInFlight', async () => {
    const L = await ledger();
    assert.equal(L.unitId('plan', 'EZD-1/2 x'), 'plan-EZD-1_2_x');
    const dir = path.join(tmp('ezd173-fl-'), 'inflight');
    assert.deepEqual(L.listInflight(dir), []);
    assert.deepEqual(L.othersInFlight(dir, 'x'), []);
    L.writeInflight(dir, { id: 'a', pid: process.pid, unit: 'build', ticket: 'EZD-002' });
    L.writeInflight(dir, { id: 'plan-EZD-005', pid: process.pid, unit: 'plan', ticket: 'EZD-005' });
    writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ id: 'b', pid: deadPid() }));
    writeFileSync(path.join(dir, 'bad.json'), '{');
    const list = L.listInflight(dir);
    assert.deepEqual(list.map((r) => r.id), ['a', 'b', 'bad', 'plan-EZD-005']);
    assert.deepEqual(list.map((r) => r.alive), [true, false, false, true]);
    assert.equal(list[2].unreadable, true);
    assert.ok(list.every((r) => r.file));
    assert.deepEqual(L.othersInFlight(dir, 'plan-EZD-005').map((r) => r.id), ['a']);
    L.removeInflight(dir, 'a');
    assert.deepEqual(L.listInflight(dir).map((r) => r.id), ['b', 'bad', 'plan-EZD-005']);
  });

  test('K15: commitPaths on a branch other than develop commits nothing', async () => {
    const L = await ledger();
    const dir = fixture();
    git(dir, 'checkout', '-q', '-b', 'feature');
    writeFileSync(path.join(dir, 'vault/DONE.md'), 'changed\n');
    const head = git(dir, 'rev-parse', 'HEAD');
    const r = L.withLedgerLock(dir, { owner: 'k15' }, () => L.commitPaths(dir, ['vault'], 'docs(vault): x'));
    assert.deepEqual(r, { sha: null, skipped: 'not on develop' });
    assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  });

  test('K16: lessonsIndexText groups by (areas, status) and equals the real INDEX.md; lessons-index regenerates a stale row', async () => {
    const L = await ledger();
    // (a)
    const root = tmp('ezd173-k16-');
    mkdirSync(path.join(root, 'vault/lessons'), { recursive: true });
    writeFileSync(path.join(root, 'vault/lessons/a.md'), '# a\n\n## L-001  areas: p, q  seen: 1  status: ratified\nRule: one.\n\n## L-002  areas: r  seen: 1  status: candidate\nRule: two.\n\n## L-003  areas: p, q  seen: 2  status: ratified\nRule: three.\n');
    writeFileSync(path.join(root, 'vault/lessons/b.md'), '# b\n');
    const head = '# I\n\nnote line\n\n| File | Role | Areas with entries |\n| --- | --- | --- |\n';
    writeFileSync(path.join(root, 'vault/lessons/INDEX.md'), `${head}| a.md | ra | old |\n| b.md | rb | old |\n`);
    const text = await L.lessonsIndexText(root);
    assert.equal(text, `${head}| a.md | ra | p, q (L-001, L-003, ratified); r (L-002, candidate) |\n| b.md | rb | (none yet) |\n`);
    // (b)
    assert.equal(await L.lessonsIndexText(REPO), readFileSync(path.join(REPO, 'vault/lessons/INDEX.md'), 'utf8'));
    // (c)
    const dir = fixture();
    const stale = readFileSync(path.join(dir, 'vault/lessons/INDEX.md'), 'utf8').replace('| builder.md | b | x (L-007, candidate) |', '| builder.md | b | old |');
    commitIn(dir, 'vault/lessons/INDEX.md', stale, 'stale index');
    const r = cli(dir, ['lessons-index', 'EZD-002']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim(), /^LEDGER OK vault\/lessons\/INDEX\.md$/);
    assert.ok(readFileSync(path.join(dir, 'vault/lessons/INDEX.md'), 'utf8').includes('| builder.md | b | x (L-007, candidate) |'));
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): EZD-002 lessons index');
    assert.deepEqual(filesOf(dir, 'HEAD'), ['vault/lessons/INDEX.md']);
  });

  test('K17: ledger.mjs architecture writes tickets.json in one commit; a bad heading fails with no change', () => {
    const root = tmp('ezd173-k17-');
    cpSync(path.join(REPO, 'vault'), path.join(root, 'vault'), { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    cpSync(path.join(REPO, 'docs/architecture.md'), path.join(root, 'docs/architecture.md'));
    git(root, 'init', '-q', '-b', 'develop');
    git(root, 'config', 'user.name', 'EZ Draft Test');
    git(root, 'config', 'user.email', 'test@example.test');
    git(root, 'config', 'commit.gpgsign', 'false');
    const plan = (line) => `# EZD-173 · x\n\n## 2. Sources\n- x\n\n${line}\n\n## 3. Interface contract\nx\n`;
    writeFileSync(path.join(root, 'vault/plans/EZD-173.md'), plan('Architecture: Tests'));
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'copy');
    const a = cli(root, ['architecture', 'EZD-173']);
    assert.equal(a.status, 0, a.stdout + a.stderr);
    assert.equal(a.stdout.trim(), 'LEDGER OK EZD-173 architecture');
    const ticketsPath = path.join(root, 'vault/tickets/tickets.json');
    assert.deepEqual(JSON.parse(readFileSync(ticketsPath, 'utf8')).tickets.find((t) => t.id === 'EZD-173').architecture, ['Tests']);
    assert.equal(git(root, 'log', '-1', '--format=%s'), 'docs(vault): EZD-173 architecture');
    assert.deepEqual(filesOf(root, 'HEAD'), ['vault/tickets/tickets.json']);
    commitIn(root, 'vault/plans/EZD-173.md', plan('Architecture: No such heading'), 'bad heading');
    const before = readFileSync(ticketsPath, 'utf8');
    const head = git(root, 'rev-parse', 'HEAD');
    const b = cli(root, ['architecture', 'EZD-173']);
    assert.equal(b.status, 1, b.stdout + b.stderr);
    assert.equal(b.stdout.trim(), 'LEDGER FAIL: EZD-173: architecture section "No such heading" is not a heading in docs/architecture.md');
    assert.equal(readFileSync(ticketsPath, 'utf8'), before);
    assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  });

  test('K18: recordPlan with a problem writes nothing, calls no later step and leaves vault/ clean', async () => {
    const L = await ledger();
    const planText = '# EZD-099\n\n- **Complexity:** low\n\n## 1. What to build\nx\n';
    const run = (dir, ticket, arch) => L.withLedgerLock(dir, { owner: 'k18' }, () => L.recordPlan(dir, {
      ticket, assignQuestionIds: () => ({}), setArchitecture: arch, nextUnit: () => 'x',
    }));
    const logsOf = (dir) => (existsSync(path.join(dir, 'vault/handoff/log')) ? readdirSync(path.join(dir, 'vault/handoff/log')) : []);
    // (a)
    const a = fixture();
    commitIn(a, 'vault/plans/EZD-099.md', planText, 'plan 99');
    const calls = [];
    const ra = run(a, 'EZD-099', (id) => { calls.push(id); return { ok: true, message: 'x' }; });
    assert.equal(ra.problem, 'no STATUS.md row for EZD-099');
    assert.deepEqual(calls, [], 'setArchitecture is not called after an earlier problem');
    assert.equal(git(a, 'status', '--porcelain', '--', 'vault'), '');
    assert.deepEqual(logsOf(a), []);
    // (b)
    const b = fixture();
    commitIn(b, 'vault/plans/EZD-003.md', planText, 'plan 3');
    const rowBefore = rowCells(b, 'EZD-003');
    const seen = [];
    const rb = run(b, 'EZD-003', (id) => { seen.push(id); return { ok: false, message: 'arch bad' }; });
    assert.equal(rb.problem, 'arch bad');
    assert.deepEqual(rowCells(b, 'EZD-003'), rowBefore);
    assert.equal(git(b, 'status', '--porcelain', '--', 'vault'), '');
    assert.deepEqual(logsOf(b), []);
  });

  test('K19: unit-steps table commits only STATUS.md and leaves another unit\'s edit alone', () => {
    const dir = fixture();
    const status = readFileSync(path.join(dir, STATUS), 'utf8').replace(/^(\| EZD-002 \|.*?\|) ready \|/m, '$1 in-progress |');
    commitIn(dir, STATUS, status, 'EZD-002 in-progress');
    assert.equal(rowCells(dir, 'EZD-002')[3], 'in-progress');
    const builderPath = path.join(dir, 'vault/lessons/builder.md');
    writeFileSync(builderPath, `${readFileSync(builderPath, 'utf8')}Another unit's line.\n`);
    const r = us(dir, ['table', 'EZD-002']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.startsWith('TABLE OK EZD-002'), r.stdout);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): EZD-002 tabled by the launcher');
    assert.deepEqual(filesOf(dir, 'HEAD'), ['vault/tickets/STATUS.md']);
    assert.equal(rowCells(dir, 'EZD-002')[3], 'blocked');
    assert.equal(git(dir, 'status', '--porcelain', '--', 'vault/lessons/builder.md'), 'M vault/lessons/builder.md');
  });
});

function gateStub(body) {
  const f = path.join(tmp('ezd173-gate-'), 'gate.mjs');
  writeFileSync(f, body);
  return `node ${f.replace(/\\/g, '/')}`;
}
function addTicketWork(dir, t, n) {
  assert.equal(us(dir, ['worktree', t]).status, 0);
  const wt = path.join(dir, '.claude/worktrees', t);
  commitIn(wt, `feature${n}.mjs`, `export const x = ${n};\n`, `wip(${t}): feature`);
  return wt;
}

describe('EZD-173 M: merge lock, worktree base, push, preflight', () => {
  test('M1: two merges together queue; each gate run is alone, on its own feat commit, and both land', async () => {
    const dir = fixture();
    const busy = path.join(tmp('ezd173-state-'), 'gate.busy');
    const runs = path.join(path.dirname(busy), 'gate.runs');
    const cmd = gateStub(`import { openSync, closeSync, unlinkSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
try { closeSync(openSync(${JSON.stringify(busy)}, 'wx')); } catch { process.exit(1); }
const target = process.argv[2];
const subject = spawnSync('git', ['-C', target, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).stdout.trim();
const start = Date.now();
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
appendFileSync(${JSON.stringify(runs)}, JSON.stringify({ subject, target, start, end: Date.now() }) + '\\n');
unlinkSync(${JSON.stringify(busy)});
console.log('ℹ pass 1');
`);
    addTicketWork(dir, 'EZD-002', 2);
    addTicketWork(dir, 'EZD-003', 3);
    const res = await Promise.all([usP(dir, ['merge', 'EZD-002'], { EZD_GATE_CMD: cmd }), usP(dir, ['merge', 'EZD-003'], { EZD_GATE_CMD: cmd })]);
    res.forEach((r) => { assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /MERGE OK/); });
    const waits = res.filter((r) => /MERGE WAIT EZD-00\d: merge lock held by pid \d+ \(unit-steps merge EZD-00\d\)/.test(r.stdout));
    assert.equal(waits.length, 1, res.map((r) => r.stdout).join('\n'));
    const rec = readFileSync(runs, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).sort((a, b) => a.start - b.start);
    assert.equal(rec.length, 4);
    for (let i = 0; i < 3; i++) assert.ok(rec[i].end <= rec[i + 1].start);
    assert.equal(rec[1].target, '.');
    assert.equal(rec[3].target, '.');
    assert.deepEqual([rec[0].target, rec[2].target].sort(), ['.claude/worktrees/EZD-002', '.claude/worktrees/EZD-003']);
    const titles = { 'EZD-002': 'Thing two', 'EZD-003': 'Thing three' };
    for (const j of [0, 2]) {
      const t = rec[j].target.split('/').pop();
      assert.match(rec[j].subject, new RegExp(`^chore\\(${t}\\): update from develop [0-9a-f]{7,40}$`));
      assert.equal(rec[j + 1].subject, `feat(${t}): ${titles[t]}`);
    }
    assert.deepEqual(new Set([rec[1].subject, rec[3].subject]), new Set(['feat(EZD-002): Thing two', 'feat(EZD-003): Thing three']));
    for (const t of ['EZD-002', 'EZD-003']) {
      const hashes = git(dir, 'log', '-F', `--grep=feat(${t}): `, '--format=%h').split('\n').filter(Boolean);
      assert.equal(hashes.length, 1);
      const c = rowCells(dir, t);
      assert.equal(c[3], 'done');
      assert.ok(hashes[0].startsWith(c[6]) || c[6].startsWith(hashes[0]), `${t} commit ${c[6]} vs ${hashes[0]}`);
    }
  });

  test('M2: a red develop gate that committed on top is undone by a revert; the gate\'s commit stays and the worktree is kept', () => {
    const dir = fixture();
    const cmd = gateStub(`import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (process.argv[2] !== '.') { console.log('ℹ pass 1'); process.exit(0); }
writeFileSync('vault/handoff/x.md', 'x');
spawnSync('git', ['add', 'vault/handoff/x.md']);
spawnSync('git', ['commit', '-qm', 'docs(vault): gate artefact']);
process.exit(1);
`);
    const wt = addTicketWork(dir, 'EZD-002', 2);
    const r = us(dir, ['merge', 'EZD-002'], { EZD_GATE_CMD: cmd });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /MERGE RED EZD-002: develop gate failed; develop restored, worktree kept\. Treat as a review FAIL\./);
    assert.match(r.stdout, /MERGE UPDATE EZD-002 pass 1: merged develop [0-9a-f]{7,40} into t\/EZD-002; ticket gate green/);
    assert.equal(git(dir, 'log', '-1', '--format=%s'), 'Revert "feat(EZD-002): Thing two"');
    assert.ok(git(dir, 'log', '--format=%s').includes('docs(vault): gate artefact'));
    assert.ok(existsSync(path.join(dir, 'vault/handoff/x.md')));
    assert.ok(!existsSync(path.join(dir, 'feature2.mjs')));
    assert.ok(existsSync(wt));
  });

  test('M3: with a merge in progress a new worktree branches from the merge base, else from develop', () => {
    const dir = fixture();
    const base = git(dir, 'rev-parse', 'HEAD');
    commitIn(dir, 'other.txt', 'x', 'chore: other');
    writeLock(dir, 'merge', { pid: process.pid, owner: 'test', base });
    const r = us(dir, ['worktree', 'EZD-002']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /WORKTREE NEW .*\(merge in progress\)/);
    assert.equal(git(dir, 'rev-parse', 't/EZD-002'), base);
    rmSync(lockPath(dir, 'merge'));
    const develop = git(dir, 'rev-parse', 'develop');
    const r2 = us(dir, ['worktree', 'EZD-003']);
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    assert.ok(!/merge in progress/.test(r2.stdout));
    assert.equal(git(dir, 'rev-parse', 't/EZD-003'), develop);
  });

  test('M4: finish pushes develop only when no merge is in progress', () => {
    const dir = fixture({ remote: true });
    const origin = originOf.get(dir);
    const originHead = () => git(origin, 'rev-parse', 'develop');
    const start = originHead();
    writeLock(dir, 'merge', { pid: process.pid, owner: 'test', base: null });
    writeFileSync(path.join(dir, 'vault/handoff/CURRENT.md'), 'change a\n');
    let r = us(dir, ['finish', 'EZD-002', 'done'], { EZD_NO_PUSH: undefined });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim(), /FINISH OK EZD-002 done \(\w+\).* push deferred: merge in progress$/);
    assert.equal(originHead(), start);
    rmSync(lockPath(dir, 'merge'));
    writeFileSync(path.join(dir, 'vault/handoff/CURRENT.md'), 'change b\n');
    r = us(dir, ['finish', 'EZD-002', 'done'], { EZD_NO_PUSH: undefined });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!/push deferred/.test(r.stdout));
    assert.equal(originHead(), git(dir, 'rev-parse', 'HEAD'));
  });

  test('M5: preflight ignores uncommitted vault/ changes but stops on any other', () => {
    const dir = fixture();
    writeFileSync(path.join(dir, STATUS), `${readFileSync(path.join(dir, STATUS), 'utf8')}\n`);
    let r = us(dir, ['preflight', 'EZD-002']);
    assert.match(r.stdout, /^PREFLIGHT OK/);
    writeFileSync(path.join(dir, 'gate-stub.mjs'), `${readFileSync(path.join(dir, 'gate-stub.mjs'), 'utf8')}\n`);
    r = us(dir, ['preflight', 'EZD-002']);
    assert.equal(r.status, 3);
    assert.match(r.stdout, /PREFLIGHT STOP: develop has uncommitted changes/);
  });
});

describe('EZD-173 S: static checks', () => {
  const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
  test('S1: run.mjs, next_ticket.mjs and ledger.mjs write only through the ledger or temp-and-rename', () => {
    const run = read('scripts/run.mjs');
    assert.match(run, /from ['"]\.\/ledger\.mjs['"]|import\(['"]\.\/ledger\.mjs['"]\)/);
    const dry = run.indexOf('if (dryRun) return');
    assert.ok(dry >= 0);
    assert.ok(run.indexOf('writeInflight(') > dry, 'writeInflight( first appears after the dry-run return');
    for (const bad of ["git('add'", 'writeFileSync(statusPath', 'writeFileSync(inflightFile']) assert.ok(!run.includes(bad), bad);
    assert.match(run, /\blauncherHandoffText\b/);
    assert.ok(!run.includes('# Handoff ·'), 'run.mjs has no # Handoff · text');
    assert.ok(!run.includes('function handoffText'), 'run.mjs has no function handoffText');
    assert.ok(!run.includes('keeps inflight.json'), 'run.mjs has no stale "keeps inflight.json" text');
    assert.ok(!run.includes('setArchitecture('), 'run.mjs makes no setArchitecture( call of its own');
    const nt = read('vault/tools/next_ticket.mjs');
    assert.match(nt, /import\s*\{[^}]*\bQ_FILES\b[^}]*\}\s*from\s*['"]\.\/questions-files\.mjs['"]/);
    assert.match(nt, /import\s*\{[^}]*\bquestionMax\b[^}]*\}\s*from\s*['"]\.\/questions-files\.mjs['"]/);
    assert.ok(!nt.includes('const Q_FILES'), 'next_ticket.mjs has no const Q_FILES');
    assert.equal(nt.split('writeFileSync(').length - 1, 1);
    const fn = /function writeAtomic\b[^{]*\{|writeAtomic\s*=\s*(?:async\s*)?(?:function\s*)?\([^)]*\)\s*(?:=>)?\s*\{/.exec(nt);
    assert.ok(fn, 'next_ticket.mjs defines writeAtomic');
    let depth = 0;
    let end = fn.index + fn[0].length;
    for (depth = 1; end < nt.length && depth > 0; end++) depth += nt[end] === '{' ? 1 : nt[end] === '}' ? -1 : 0;
    const body = nt.slice(fn.index, end);
    assert.ok(body.includes('writeFileSync('), 'the one writeFileSync( is inside writeAtomic');
    assert.ok(body.includes('renameSync('), 'renameSync( is inside writeAtomic');
    const writes = [...read('scripts/ledger.mjs').matchAll(/writeFileSync\(\s*([^,]+),/g)];
    assert.ok(writes.length > 0);
    for (const m of writes) assert.match(m[1], /tmp|temp/i, `writeFileSync target ${m[1]}`);
    const ledgerSrc = read('scripts/ledger.mjs');
    assert.ok(!ledgerSrc.includes('QUESTIONS-answered'), 'ledger.mjs does not name QUESTIONS-answered');
    assert.ok(!ledgerSrc.includes('QUESTIONS-archive'), 'ledger.mjs does not name QUESTIONS-archive');
  });

  test('S2: skills, plan-ticket and PROCESS.md carry the EZD-173 wording', () => {
    const build = read('.claude/skills/build-ticket/SKILL.md');
    const plan = read('.claude/skills/plan-ticket/SKILL.md');
    for (const s of ['node scripts/ledger.mjs research $ARGUMENTS', '**Ledger writes (EZD-173).**', 'node scripts/ledger.mjs status', 'question', 'answer', 'append vault/DONE.md', 'append vault/lessons/<role>.md', 'L-next', 'handoff',
      'Never edit STATUS.md, QUESTIONS.md, DONE.md, the lessons files or CURRENT.md with Edit or Write in a build unit.', 'MERGE WAIT']) {
      assert.ok(build.includes(s), `build-ticket SKILL.md: ${s}`);
    }
    assert.match(build, /finish \$ARGUMENTS done\\?\|blocked \[/);
    for (const skill of [build, plan]) {
      assert.ok(skill.includes('node scripts/ledger.mjs research'));
      assert.ok(!skill.includes('node vault/tools/research.mjs adopt'));
      assert.ok(!skill.includes('next_ticket.mjs --set-architecture'), 'no next_ticket.mjs --set-architecture');
    }
    const archCmd = 'node scripts/ledger.mjs architecture $ARGUMENTS';
    assert.equal(build.split(archCmd).length - 1, 2, 'build-ticket has the architecture command twice');
    assert.equal(plan.split(archCmd).length - 1, 1, 'plan-ticket has the architecture command once');
    // The whole Ledger writes paragraph and the two phrase replacements (plan C15).
    for (const s of ["**Ledger writes (EZD-173).** Other units may run at the same time, so every ledger change goes through `node scripts/ledger.mjs`, which takes the ledger lock, writes and commits only the files it changed: `node scripts/ledger.mjs status $ARGUMENTS <key>=<value>...` (STATUS row: `status`, `complexity`, `commit`, `tests`, `notes`), `question $ARGUMENTS <asked-by> <text>` (prints the new Q-ID), `answer <Q-ID> <status> <answered-by> <answer> <sources>`, `append vault/DONE.md $ARGUMENTS` and `append vault/lessons/<role>.md $ARGUMENTS` (text on stdin: a DONE line or a planner's lesson line), `lesson $ARGUMENTS vault/lessons/<role>.md...` (a new entry on stdin headed `## L-next` with `status: candidate`; it takes the next L-number across all lesson files, writes the entry into each role file named and updates `vault/lessons/INDEX.md`), `seen $ARGUMENTS <L-nnn>` (raises an existing lesson's `seen` count in every file that holds it) and `handoff $ARGUMENTS` (text on stdin). Never edit STATUS.md, QUESTIONS.md, DONE.md, the lessons files or CURRENT.md with Edit or Write in a build unit.",
      "Record the planner's lesson line with `node scripts/ledger.mjs append vault/lessons/planner.md $ARGUMENTS` (text on stdin; section 13).",
      "Record any lesson with `lesson`, or `seen` when one already covers it (PROCESS.md section 13; search the role files first)."]) {
      assert.ok(build.includes(s), `build-ticket SKILL.md: ${s}`);
    }
    assert.ok(!build.includes('commits only that file'), 'build-ticket SKILL.md has no "commits only that file"');
    // The six PROCESS.md replacement texts of Build step 9.
    const process = read('vault/PROCESS.md');
    for (const s of ["commits `vault/` on `develop` when no other unit is in flight (EZD-173)", "then runs `node scripts/ledger.mjs research <TICKET>` and cites the IDs", "on the next start (its in-flight record in `<log dir>/inflight/`)", "Run through `node scripts/ledger.mjs research <TICKET>` (this ticket's reports, committed under the ledger lock; EZD-173) by the orchestrator after any dispatch", "written in both files with the same L-number; L-numbers are one sequence across all role files.", "**Who writes:** only the orchestrator, at the end of a unit; in a build unit through `node scripts/ledger.mjs lesson`, `seen` and `append` (EZD-173)."]) assert.ok(process.includes(s), `PROCESS.md: ${s}`);
    assert.ok(!process.includes('node vault/tools/research.mjs adopt'), 'PROCESS.md has no node vault/tools/research.mjs adopt');
    assert.ok(!process.includes('(`inflight.json`)'), 'PROCESS.md has no (`inflight.json`)');
  });
});

describe('EZD-173 X: the launcher with a plan problem', () => {
  // Root built as makeRoot in scripts/launcher/dry-run.test.mjs (fivePct 10, nextUnit 'plan EZD-999', no vault/plans/EZD-999.md).
  test('X1: run.mjs --once with a missing plan file prints the problem and commits its cost row', () => {
    const root = tmp('ezd173-x1-');
    const at = (...p) => path.join(root, ...p);
    for (const d of ['scripts', 'vault/tools', 'vault/tickets', 'vault/cost', 'vault/handoff']) mkdirSync(at(d), { recursive: true });
    for (const f of ['run.mjs', 'budget.mjs', 'oauth-usage.mjs', 'cost-log.mjs', 'launcher-idle.mjs', 'ledger.mjs']) cpSync(path.join(REPO, 'scripts', f), at('scripts', f));
    cpSync(path.join(REPO, 'vault/tools/boost.mjs'), at('vault/tools/boost.mjs'));
    cpSync(path.join(REPO, 'vault/tools/questions-files.mjs'), at('vault/tools/questions-files.mjs'));
    writeFileSync(at('vault/tools/next_ticket.mjs'), [
      "export const weekStart = () => new Date('2030-01-07T07:00:00.000Z');",
      "export const weekSpend = () => ({ start: weekStart(), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub' });",
      "export const questionsFingerprint = () => '';",
      'export const assignQuestionIds = () => ({});',
      "if (process.argv.includes('--next-unit')) console.log('plan EZD-999');",
      '',
    ].join('\n'));
    writeFileSync(at('vault/tickets/STATUS.md'), 'stub\n');
    writeFileSync(at('vault/budget.json'), JSON.stringify({ meter_source: 'statusline', weekly_ceiling_usd_est: 1000 }));
    const now = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    writeFileSync(at('vault/cost/usage.json'), JSON.stringify({
      five_hour: { pct: 10, resets_at: iso(now + 7_200_000) },
      seven_day: { pct: 10, resets_at: iso(now + 3 * 86_400_000) },
      fable_seven_day: null,
      read_at: iso(now),
      source: 'statusline',
    }));
    const result = '{"type":"result","subtype":"success","is_error":false,"result":"ok","num_turns":1,"total_cost_usd":0}';
    writeFileSync(at('fake-claude'), `#!/bin/sh\ncase "$*" in *--help*) echo "--max-turns --session-id --permission-prompts";; *) echo '${result}';; esac\nexit 0\n`, { mode: 0o755 });
    writeFileSync(at('scripts/launcher.config.json'), JSON.stringify({
      claude_bin: at('fake-claude'),
      log_dir: at('logs'),
      notify_cmd: `printf '%s\\n' "$MSG" >> "${at('notified.txt')}"`,
    }));
    writeFileSync(at('.gitignore'), 'logs/\nnotified.txt\nvault/handoff/last-failure.json\n');
    git(root, 'init', '-q', '-b', 'develop');
    git(root, 'config', 'user.name', 'EZ Draft Test');
    git(root, 'config', 'user.email', 'test@example.test');
    git(root, 'config', 'commit.gpgsign', 'false');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'init');
    const r = spawnSync(process.execPath, [at('scripts/run.mjs'), '--once'], {
      encoding: 'utf8', timeout: 30000, cwd: root,
      env: { ...process.env, EZD_INFLIGHT_DIR: tmp('ezd173-x1-inflight-'), EZD_ROOT: undefined },
    });
    const out = `exit ${r.status}, signal ${r.signal}\n${r.stdout}\n${r.stderr}`;
    assert.ok(r.stdout.includes('plan file missing:'), out);
    assert.equal(git(root, 'log', '-1', '--format=%s'), 'docs(vault): plan EZD-999', out);
    assert.ok(filesOf(root, 'HEAD').includes('vault/cost/log.jsonl'), out);
    assert.equal(git(root, 'status', '--porcelain', '--', 'vault'), '', out);
  });
});
