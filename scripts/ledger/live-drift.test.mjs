// EZD-281 T7, T8: the ledger-reading test suites pass on a copy of the repository whose live state has drifted (a different budget hold,
// later Q-IDs, open questions and todo tickets in phases 1 and 2), so no test pins a live ledger or budget value (Q-0463, CLAUDE.md rules 16, 18).
// T8 is the control: a test that does pin the live hold fails in the same drifted copy, so the harness would catch one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = 'scripts/ledger/live-drift.test.mjs';
const SUITES = ['ledger', 'budget', 'launcher', 'process', 'tools', 'hooks'];
let dir;
let liveHold;
const f = (rel) => path.join(dir, rel);
const read = (rel) => readFileSync(f(rel), 'utf8');
const qid = (n) => `Q-${String(n).padStart(4, '0')}`;
const git = (...args) => spawnSync('git', ['-c', 'user.email=drift@test', '-c', 'user.name=drift', ...args], { cwd: dir, encoding: 'utf8' });
const tool = (name, args = []) => spawnSync(process.execPath, [f(`vault/tools/${name}`), ...args], { cwd: dir, encoding: 'utf8' });

function testFiles(sub) {
  const root = f(`scripts/${sub}`);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true }).map(String).filter((p) => p.endsWith('.test.mjs')).map((p) => `scripts/${sub}/${p}`.split(path.sep).join('/'));
}

function runTests(files) {
  return spawnSync(process.execPath, ['--import', f('app/test-harness/net-guard/preload.mjs'), '--test', '--test-concurrency=4', ...files], {
    cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
}

before(async () => {
  liveHold = JSON.parse(readFileSync(path.join(repo, 'vault/budget.json'), 'utf8')).hold_at_pct;
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd281-drift-')));
  cpSync(path.join(repo, 'scripts'), f('scripts'), { recursive: true });
  cpSync(path.join(repo, 'vault'), f('vault'), { recursive: true, filter: (s) => !/[\\/]vault[\\/]archive([\\/]|$)/.test(s) }); // mockups stay: reads.test.mjs T5 needs the folder present
  mkdirSync(f('docs'), { recursive: true });
  cpSync(path.join(repo, 'docs/architecture.md'), f('docs/architecture.md'));
  // D6 lists .claude/hooks only; the suites in the run set also read .claude/settings.json, skills and agents, CLAUDE.md and .gitignore.
  cpSync(path.join(repo, '.claude'), f('.claude'), { recursive: true, filter: (s) => !/^worktrees([\\/]|$)/.test(path.relative(path.join(repo, '.claude'), s)) });
  for (const x of ['CLAUDE.md', '.gitignore', '.gitattributes']) if (existsSync(path.join(repo, x))) cpSync(path.join(repo, x), f(x));
  cpSync(path.join(repo, 'app/test-harness/net-guard'), f('app/test-harness/net-guard'), { recursive: true });
  cpSync(path.join(repo, 'package.json'), f('package.json'));
  if (existsSync(path.join(repo, 'node_modules'))) symlinkSync(path.join(repo, 'node_modules'), f('node_modules'));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir }).status, 0);

  // Dr1: a different hold.
  const bj = JSON.parse(read('vault/budget.json'));
  bj.hold_at_pct = liveHold === 73 ? 74 : 73;
  writeFileSync(f('vault/budget.json'), JSON.stringify(bj, null, 2) + '\n');

  // Dr2: a later next Q-ID, written with two spaces before the ID (a row shape questionMax counts).
  const { questionMax } = await import(pathToFileURL(f('vault/tools/questions-files.mjs')).href);
  const top = questionMax(f('vault'));
  appendFileSync(f('vault/questions/QUESTIONS-answered.md'), `\n|  ${qid(top + 500)} | 0 / EZD-000b | orchestrator (2026-10-30) | Drift row. | answered-agent | orchestrator | drift | drift |\n`);

  // Dr3: an open question in phase 1 and one in phase 2, after the last Q-ID row of QUESTIONS.md.
  const lines = read('vault/questions/QUESTIONS.md').split('\n');
  const last = lines.map((l) => /^\|\s*Q-\d{4}\s*\|/.test(l)).lastIndexOf(true);
  lines.splice(last + 1, 0,
    `| ${qid(top + 501)} | 1 / EZD-101 | orchestrator (2026-10-30) | Drift open phase 1. | open |  |  |  |`,
    `| ${qid(top + 502)} | 2 / EZD-201 | orchestrator (2026-10-30) | Drift open phase 2. | open |  |  |  |`);
  writeFileSync(f('vault/questions/QUESTIONS.md'), lines.join('\n'));

  // Dr4: a todo ticket in phase 1 and one in phase 2.
  const tj = JSON.parse(read('vault/tickets/tickets.json'));
  for (const [id, n] of [['EZD-8881', 1], ['EZD-8882', 2]]) {
    tj.tickets.push({ id, phase: n, title: 'Drift ticket', depends_raw: '', spec_ref: 'drift', spec_files: ['spec/sections/11-non-functional-requirements.md#Operations'], decisions: [], mockups: [], architecture: [],
      phase_file: `tickets/phases/phase-0${n}.md`, depends_on: [], build_position: 9000 + n, acs: [], acs_source: 'done-when' });
    appendFileSync(f('vault/tickets/STATUS.md'), `| ${id} | ${n} | Drift ticket | todo | | |  |  | drift |\n`);
    const pl = read(`vault/tickets/phases/phase-0${n}.md`).split('\n');
    const at = pl.map((l) => /^\| EZD-/.test(l)).lastIndexOf(true);
    pl.splice(at + 1, 0, `| ${id} | Drift ticket | Drift scope. | Drift works (test). | | drift |`);
    writeFileSync(f(`vault/tickets/phases/phase-0${n}.md`), pl.join('\n'));
  }
  writeFileSync(f('vault/tickets/tickets.json'), JSON.stringify(tj, null, 1) + '\n');
  const acs = tool('gen_acs.mjs');
  assert.equal(acs.status, 0, acs.stdout + acs.stderr);

  assert.equal(git('add', '-A').status, 0);
  const c = git('commit', '-qm', 'base');
  assert.equal(c.status, 0, c.stdout + c.stderr);
});

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('EZD-281 T7: the ledger-reading suites pass on a copy with drifted live state (AC-EZD-281-1, AC-EZD-281-2)', { timeout: 600000 }, () => {
  const check = tool('next_ticket.mjs', ['--check']);
  assert.ok(check.stdout.startsWith('LEDGER OK'), `drifted copy --check: ${check.stdout}${check.stderr}`);
  const files = SUITES.flatMap(testFiles).filter((p) => p !== SELF).sort();
  assert.ok(files.length > 0, 'the run set is not empty');
  const r = runTests(files);
  const failed = r.stdout.split('\n').filter((l) => /^\s*not ok /.test(l));
  assert.equal(r.status, 0, `${failed.join('\n')}\n${r.stderr.slice(0, 4000)}`);
});

test('EZD-281 T8: control, a test that pins the live hold fails in the drifted copy (AC-EZD-281-2)', { timeout: 600000 }, () => {
  const pinned = 'scripts/ledger/zz-pinned.test.mjs';
  writeFileSync(f(pinned), `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\n` +
    `const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');\n` +
    `test('pinned hold', () => assert.equal(JSON.parse(readFileSync(path.join(root, 'vault/budget.json'), 'utf8')).hold_at_pct, ${JSON.stringify(liveHold)}));\n`);
  try {
    const r = runTests([pinned]);
    assert.notEqual(r.status, 0, 'the pinned test must fail in the drifted copy');
    assert.match(r.stdout, /not ok .*pinned hold/);
  } finally {
    rmSync(f(pinned), { force: true });
  }
});
