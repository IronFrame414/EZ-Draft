// EZD-244 A1-A9 (vault/plans/EZD-244.md section 4): the architecture map. docs/architecture.md is read by heading; its
// Core sections line and each open ticket's tickets.json `architecture` list name headings that must exist;
// `next_ticket.mjs --check`, `--set-architecture` and `--reads` enforce it. A3-A9 run on a temporary copy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, realpathSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outline = await import(pathToFileURL(path.join(root, 'vault/tools/outline.mjs')).href);
let dir, vault;
const run = (...a) => spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs'), ...a], { encoding: 'utf8' });
const file = (rel) => path.join(vault, rel);
const docFile = () => path.join(dir, 'docs/architecture.md');
const planFile = () => file('plans/EZD-112.md');
const statusFile = () => file('tickets/STATUS.md');
const ticketsFile = () => file('tickets/tickets.json');
const skill = () => path.join(dir, '.claude/skills/build-ticket/SKILL.md');
const editJson = (fn) => { const d = JSON.parse(readFileSync(ticketsFile(), 'utf8')); fn(d); writeFileSync(ticketsFile(), JSON.stringify(d, null, 1) + '\n'); };
const ticket = (d, id) => d.tickets.find((t) => t.id === id);
const saved = {};
const lines = (s) => s.split('\n');

before(() => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd244-map-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/]archive([\\/]|$)/.test(s) });
  mkdirSync(path.dirname(skill()), { recursive: true });
  cpSync(path.join(root, '.claude/skills/build-ticket/SKILL.md'), skill());
  mkdirSync(path.dirname(docFile()), { recursive: true });
  cpSync(path.join(root, 'docs/architecture.md'), docFile());
  for (const [k, f] of Object.entries({ doc: docFile, plan: planFile, status: statusFile, tickets: ticketsFile })) saved[k] = readFileSync(f(), 'utf8');
});
after(() => rmSync(dir, { recursive: true, force: true }));

const restore = () => {
  writeFileSync(docFile(), saved.doc);
  writeFileSync(planFile(), saved.plan);
  writeFileSync(statusFile(), saved.status);
  writeFileSync(ticketsFile(), saved.tickets);
};
// EZD-112 planned (open), architecture list as given (undefined = key absent).
const plan112 = function (...args) {
  const list = args.length === 0 ? ['Company settings (EZD-112)'] : args[0];
  restore();
  const rows = lines(saved.status).map((l) => {
    if (!l.startsWith('| EZD-112 |')) return l;
    const c = l.split('|');
    c[4] = ' planned ';
    return c.join('|');
  });
  writeFileSync(statusFile(), rows.join('\n'));
  editJson((d) => {
    const t = ticket(d, 'EZD-112');
    if (list === undefined) delete t.architecture; else t.architecture = list;
  });
};
const setPlanLine = (line) => {
  const text = saved.plan.replace(/\n## 3\./, `\n${line}\n\n## 3.`);
  assert.notEqual(text, saved.plan);
  writeFileSync(planFile(), text);
};
const problems112 = (stdout) => lines(stdout).filter((l) => l.startsWith('EZD-112:'));

test('EZD-244 A1: CLAUDE.md files do not import docs/architecture.md or any @path', () => {
  const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.split('\n')
    .filter((f) => f && path.basename(f) === 'CLAUDE.md');
  assert.ok(tracked.includes('CLAUDE.md'));
  for (const f of tracked) {
    const text = readFileSync(path.join(root, f), 'utf8');
    assert.ok(!text.includes('@docs/architecture.md'), `${f} imports docs/architecture.md`);
    assert.doesNotMatch(text, /(^|[\s(\[`'"])@[\w.~-]*\//m, `${f} holds an @path import`);
  }
});

test('EZD-244 A2: every open ticket lists distinct existing headings; the core names are headings', () => {
  const doc = readFileSync(path.join(root, 'docs/architecture.md'), 'utf8');
  const headings = outline.architectureHeadings(doc).map((h) => h.text);
  const core = outline.coreSections(doc);
  assert.equal(core.length, 5);
  assert.deepEqual(core, ['Folder layout', 'Tests', 'Test scope (Q-0006)', 'Errors and logging', 'Adding a dependency']);
  for (const c of core) assert.ok(headings.includes(c), `core "${c}" is not a heading`);
  const open = lines(readFileSync(path.join(root, 'vault/tickets/STATUS.md'), 'utf8'))
    .filter((l) => /^\| EZD-/.test(l)).map((l) => l.split('|')).map((c) => ({ id: c[1].trim(), status: c[4].trim() }))
    .filter((r) => r.status !== 'todo' && r.status !== 'done');
  assert.ok(open.length >= 1, 'no open ticket');
  const tickets = JSON.parse(readFileSync(path.join(root, 'vault/tickets/tickets.json'), 'utf8')).tickets;
  for (const { id } of open) {
    const t = tickets.find((x) => x.id === id);
    assert.ok(t && Array.isArray(t.architecture), `${id} has no architecture list`);
    assert.equal(new Set(t.architecture).size, t.architecture.length, `${id} repeats an entry`);
    for (const h of t.architecture) {
      assert.equal(typeof h, 'string');
      assert.ok(headings.includes(h), `${id}: "${h}" is not a heading`);
    }
  }
});

test('EZD-244 A3: an open ticket with an existing heading in its list has no problem line', () => {
  plan112();
  const r = run('--check');
  assert.deepEqual(problems112(r.stdout), []);
});

test('EZD-244 A4: a renamed heading is reported for the ticket that lists it', () => {
  plan112();
  writeFileSync(docFile(), saved.doc.replace('### Company settings (EZD-112)', '### Company settings'));
  const r = run('--check');
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('EZD-112: architecture section "Company settings (EZD-112)" is not a heading in docs/architecture.md'), r.stdout);
});

test('EZD-244 A5: an open ticket without the key is reported', () => {
  plan112(undefined);
  const r = run('--check');
  assert.ok(r.stdout.includes('EZD-112: no architecture list (EZD-244; run --set-architecture EZD-112)'), r.stdout);
});

test('EZD-244 A6: a plan line that differs from tickets.json is reported, --set-architecture copies it after mockups', () => {
  plan112();
  setPlanLine('Architecture: Customers (EZD-113)');
  const first = run('--check');
  assert.ok(first.stdout.includes('EZD-112: plan Architecture line differs from tickets.json (run --set-architecture EZD-112)'), first.stdout);
  const set = run('--set-architecture', 'EZD-112');
  assert.equal(set.status, 0, set.stderr);
  assert.equal(set.stdout.trim(), 'ARCHITECTURE SET EZD-112: 1 section(s)');
  const t = ticket(JSON.parse(readFileSync(ticketsFile(), 'utf8')), 'EZD-112');
  assert.deepEqual(t.architecture, ['Customers (EZD-113)']);
  const keys = Object.keys(t);
  assert.equal(keys[keys.indexOf('mockups') + 1], 'architecture');
  const last = run('--check');
  assert.deepEqual(problems112(last.stdout), []);
});

test('EZD-244 A7: a broken docs/architecture.md fails --check with the exact line', () => {
  plan112();
  const variants = [
    [saved.doc.replace(/^Core sections:.*\n/m, ''), 'docs/architecture.md: no "Core sections:" line (EZD-244)'],
    [saved.doc.replace(/^## Tests$/m, '## Tests and runners'), 'docs/architecture.md: core section "Tests" is not a heading'],
    [saved.doc + '\n### Tests\nextra\n', 'docs/architecture.md: heading "Tests" appears 2 times'],
    [null, 'docs/architecture.md missing (architecture map, EZD-244)'],
  ];
  for (const [text, want] of variants) {
    if (text === null) rmSync(docFile()); else writeFileSync(docFile(), text);
    const r = run('--check');
    assert.equal(r.status, 1, want);
    assert.ok(r.stdout.includes(want), `${want}\n${r.stdout}`);
  }
  writeFileSync(docFile(), saved.doc);
});

test('EZD-244 A8: --set-architecture refuses, keeps or sets by the plan line', () => {
  plan112();
  const bytes = () => readFileSync(ticketsFile(), 'utf8');
  setPlanLine('Architecture: No such heading');
  let before = bytes();
  let r = run('--set-architecture', 'EZD-112');
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), 'EZD-112: architecture section "No such heading" is not a heading in docs/architecture.md');
  assert.equal(bytes(), before);

  plan112(undefined);
  before = bytes();
  r = run('--set-architecture', 'EZD-112');
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), 'EZD-112: no Architecture line in section 2 of vault/plans/EZD-112.md');
  assert.equal(bytes(), before);

  plan112([]);
  before = bytes();
  r = run('--set-architecture', 'EZD-112');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.startsWith('ARCHITECTURE KEPT EZD-112'), r.stdout);
  assert.equal(bytes(), before);

  plan112([]);
  setPlanLine('Architecture: none beyond the core');
  r = run('--set-architecture', 'EZD-112');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'ARCHITECTURE SET EZD-112: 0 section(s)');
  assert.deepEqual(ticket(JSON.parse(bytes()), 'EZD-112').architecture, []);
});

test('EZD-244 A9: --reads prints the Architecture line before Plan: for every role; a missing list fails', () => {
  plan112(['Tests', 'Local database']);
  const want = "Architecture: node vault/tools/outline.mjs docs/architecture.md --section 'Folder layout' --section 'Tests' --section 'Test scope (Q-0006)' --section 'Errors and logging' --section 'Adding a dependency' --section 'Local database'";
  const headingsLine = 'Architecture headings: node vault/tools/outline.mjs docs/architecture.md --headings';
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const roles = lines(readFileSync(skill(), 'utf8')).filter((l) => /^\| [a-z]/.test(l) && !l.startsWith('| Role'))
    .map((l) => norm(l.split('|')[1])).filter(Boolean);
  assert.ok(roles.includes('builder') && roles.includes('test-author'));
  for (const role of ['planner', ...roles]) {
    const r = run('--reads', 'EZD-112', role);
    assert.equal(r.status, 0, `${role}: ${r.stderr}`);
    const out = lines(r.stdout.trim());
    assert.equal(out.filter((l) => l.startsWith('Architecture: ')).length, 1, role);
    const i = out.indexOf(want);
    assert.ok(i >= 0, `${role}: ${r.stdout}`);
    if (role === 'planner') {
      assert.equal(out[i + 1], headingsLine);
      assert.ok(out.findIndex((l) => l.startsWith('Plan:')) > i + 1);
    } else {
      assert.ok(out[i + 1].startsWith('Plan:'), `${role}: ${out[i + 1]}`);
      assert.ok(!out.includes(headingsLine), role);
    }
  }
  plan112(undefined);
  const r = run('--reads', 'EZD-112', 'builder');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('EZD-112: no architecture list'), r.stderr);
  restore();
});
