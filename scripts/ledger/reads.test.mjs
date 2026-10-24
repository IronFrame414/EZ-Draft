// Reading map (Q-0218; vault/questions/interview-plan-2026-10-20.md "Restructure and reading map"): each ticket's tickets.json
// entry lists its exact spec files (with heading anchors), decision files and mockups; `next_ticket.mjs --reads <ticket> <role>`
// prints the dispatch's Spec files, Decisions and Sections lines (Sections from the table in .claude/skills/build-ticket/SKILL.md);
// `--check` fails when a listed path or anchor is missing or a spec file is over 20,000 characters. Runs on a temporary copy.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let dir, vault;
const run = (...a) => spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs'), ...a], { encoding: 'utf8' });
const file = (rel) => path.join(vault, rel);
const editJson = (fn) => { const d = JSON.parse(readFileSync(file('tickets/tickets.json'), 'utf8')); fn(d); writeFileSync(file('tickets/tickets.json'), JSON.stringify(d, null, 1) + '\n'); };
const ticket = (d, id) => d.tickets.find((t) => t.id === id);
const skill = () => path.join(dir, '.claude/skills/build-ticket/SKILL.md');
let saved;

before(() => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-reads-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/]archive([\\/]|$)/.test(s) });
  mkdirSync(path.dirname(skill()), { recursive: true });
  cpSync(path.join(root, '.claude/skills/build-ticket/SKILL.md'), skill());
  saved = readFileSync(file('tickets/tickets.json'), 'utf8');
});
const restore = () => writeFileSync(file('tickets/tickets.json'), saved);
const fixture = () => editJson((d) => Object.assign(ticket(d, 'EZD-118'), {
  spec_files: ['spec/sections/03c-tables.md#project', 'spec/sections/03c-tables.md#tenant', 'spec/sections/screens/S01-projects.md'],
  decisions: ['spec/decisions/05-screens.md#Q-0201', 'spec/decisions/10-permissions-and-settings.md'],
  mockups: ['mockups/S01bWizard.png'],
}));

test('READS T1: --reads prints the Spec files, Decisions, Mockups, Plan and Sections lines for a role', () => {
  fixture();
  const r = run('--reads', 'EZD-118', 'builder');
  restore();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), [
    'Spec files: vault/spec/sections/03c-tables.md (project; tenant), vault/spec/sections/screens/S01-projects.md',
    'Decisions: vault/spec/decisions/05-screens.md (Q-0201), vault/spec/decisions/10-permissions-and-settings.md',
    'Mockups: vault/mockups/S01bWizard.png',
    'Plan: vault/plans/EZD-118.md',
    'Sections: header, 1, 3, 4, 6',
  ]);
});

test('READS T2: role names match the SKILL.md table with spaces or hyphens, and a table edit changes the output', () => {
  const sections = (role) => run('--reads', 'EZD-118', role).stdout.split('\n').find((l) => l.startsWith('Sections:'));
  assert.equal(sections('code-reviewer mode 2'), 'Sections: header, 3, 4');
  assert.equal(sections('code-reviewer-mode-2'), 'Sections: header, 3, 4');
  assert.equal(sections('planner-re-validation'), 'Sections: header, 2, 3, 4, 9');
  const before = readFileSync(skill(), 'utf8');
  writeFileSync(skill(), before.replace('| test-author | header, 3, 4 |', '| test-author | header, 9 |'));
  assert.equal(sections('test-author'), 'Sections: header, 9');
  writeFileSync(skill(), before);
});

test('READS T3: the planner, who writes the plan, gets no Sections line', () => {
  const out = run('--reads', 'EZD-118', 'planner').stdout.trim().split('\n');
  assert.ok(out.some((l) => l === 'Plan: vault/plans/EZD-118.md (to write)'));
  assert.ok(!out.some((l) => l.startsWith('Sections:')));
});

test('READS T4: an unknown role or ticket exits 1 and names the problem', () => {
  const r1 = run('--reads', 'EZD-118', 'janitor');
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /unknown role "janitor".*test-author/s);
  const r2 = run('--reads', 'EZD-99999', 'builder');
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /EZD-99999/);
});

const checkWith = (fn) => { editJson(fn); const r = run('--check'); restore(); return r; };

test('READS T5: --check fails on a missing spec, decisions or mockup path', () => {
  const r = checkWith((d) => Object.assign(ticket(d, 'EZD-118'), {
    spec_files: ['spec/sections/nope.md'], decisions: ['spec/decisions/nope.md'], mockups: ['mockups/Nope.png'],
  }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /EZD-118: spec file spec\/sections\/nope\.md does not exist/);
  assert.match(r.stdout, /EZD-118: decisions file spec\/decisions\/nope\.md does not exist/);
  assert.match(r.stdout, /EZD-118: mockup mockups\/Nope\.png does not exist/);
});

test('READS T6: --check fails on an anchor the file does not contain', () => {
  const r = checkWith((d) => { ticket(d, 'EZD-118').spec_files = ['spec/sections/screens/S01-projects.md#No such heading here']; });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /EZD-118: anchor "No such heading here" not found in spec\/sections\/screens\/S01-projects\.md/);
});

test('READS T7: --check fails when a ticket has no spec files or no decisions list', () => {
  const r = checkWith((d) => { const t = ticket(d, 'EZD-118'); t.spec_files = []; delete t.decisions; });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /EZD-118: no spec_files/);
  assert.match(r.stdout, /EZD-118: no decisions list/);
});

test('READS T8: --check fails when a file under spec/sections is over 20,000 characters', () => {
  const big = file('spec/sections/zz-too-big.md');
  writeFileSync(big, 'x'.repeat(20001));
  const r = run('--check');
  rmSync(big);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /spec\/sections\/zz-too-big\.md is 20001 characters \(over 20,000\)/);
});

test('READS T9: the live ledger passes --check and lists no moved file (pointer, old decisions.md)', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'vault/tools/next_ticket.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  const d = JSON.parse(readFileSync(path.join(root, 'vault/tickets/tickets.json'), 'utf8'));
  const moved = /^spec\/(decisions\.md|sections\/03-data-model\.md|sections\/09-calculations-and-rules\.md|sections\/screens\/X-)/;
  for (const t of d.tickets) {
    assert.ok(t.spec_files.length > 0, `${t.id} has no spec_files`);
    assert.ok(Array.isArray(t.decisions), `${t.id} has no decisions list`);
    for (const p of [...t.spec_files, ...t.decisions]) assert.doesNotMatch(p, moved, `${t.id} lists ${p}`);
  }
});

test('READS T10: every live ticket prints a reading list for the builder', () => {
  const d = JSON.parse(readFileSync(path.join(root, 'vault/tickets/tickets.json'), 'utf8'));
  for (const t of d.tickets.filter((_, i) => i % 40 === 0)) {
    const r = spawnSync(process.execPath, [path.join(root, 'vault/tools/next_ticket.mjs'), '--reads', t.id, 'builder'], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${t.id}: ${r.stderr}`);
    assert.match(r.stdout, /^Spec files: vault\//m);
    assert.match(r.stdout, /^Decisions: /m);
  }
});
