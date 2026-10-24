// Tests for EZD-000g (Item 7): lessons reach a dispatch only when ratified; --check fails on a lesson without a valid status;
// the questions skill writes a "Rule candidates" section; the wrap skill automates ratified lessons only.
// Runs on a temporary copy of vault/ so the real lessons are never touched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let dir, vault;
const run = (...args) => spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs'), ...args], { encoding: 'utf8' });
const lessonFile = (name) => path.join(vault, 'lessons', name);
const entry = (heading) => `${heading}\nTicket EZD-000g, 2026-10-19\nRule: fixture ${heading.match(/L-\d+/)[0]}.\n`;
const H = {
  901: '## L-901  areas: tooling  seen: 1  status: candidate',
  902: '## L-902  areas: tooling  seen: 1  status: ratified',
  903: '## L-903  areas: tooling  seen: 1  status: rejected',
  904: '## L-904  areas: auth  seen: 2  status: ratified  automated: x',
  905: '## L-905  areas: tooling  seen: 1',
  906: '## L-906  areas: tooling  seen: 1  status: maybe',
};
const write = (name, text) => writeFileSync(lessonFile(name), text);
const cleanup = (...names) => names.forEach((n) => rmSync(lessonFile(n), { force: true }));

before(() => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-lessons-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('EZD-000g T1: --check on the unchanged copy has no lessons problem line', () => {
  const r = run('--check');
  assert.ok(!r.stdout.split('\n').some((l) => l.includes('vault/lessons/')), r.stdout);
});

test('EZD-000g T2: --lessons prints only ratified entries (done when, AC-1)', () => {
  write('fixture.md', [901, 902, 903, 904].map((n) => entry(H[n])).join('\n'));
  try {
    const a = run('--lessons', 'fixture', 'tooling');
    assert.equal(a.status, 0);
    assert.ok(a.stdout.includes('## L-902'));
    for (const n of ['L-901', 'L-903', 'L-904']) assert.ok(!a.stdout.includes(n), `${n} must not print:\n${a.stdout}`);
    const b = run('--lessons', 'fixture');
    assert.equal(b.status, 0);
    assert.ok(b.stdout.includes('## L-902'));
    assert.ok(b.stdout.includes(H[904]));
    for (const n of ['L-901', 'L-903']) assert.ok(!b.stdout.includes(n), `${n} must not print:\n${b.stdout}`);
  } finally { cleanup('fixture.md'); }
});

test('EZD-000g T3: only candidate and rejected entries gives the no-lessons message (AC-1)', () => {
  write('fixture-none.md', [901, 903].map((n) => entry(H[n])).join('\n'));
  try {
    const r = run('--lessons', 'fixture-none', 'tooling');
    assert.equal(r.stdout.trim(), '(no lessons for fixture-none in areas tooling)');
  } finally { cleanup('fixture-none.md'); }
});

test('EZD-000g T4: --check names an entry with no status and one with an unknown status (AC-2)', () => {
  write('fixture-check.md', [`${entry(H[905])}Rule: keep status: ratified out of the heading.\n`, entry(H[906]), entry(H[902])].join('\n'));
  try {
    const r = run('--check');
    assert.equal(r.status, 1);
    assert.ok(r.stdout.startsWith('LEDGER INVALID ('), r.stdout);
    const lines = r.stdout.split('\n');
    assert.ok(lines.includes('- vault/lessons/fixture-check.md: L-905 has no status (candidate, ratified or rejected; PROCESS.md section 13)'), r.stdout);
    assert.ok(lines.includes('- vault/lessons/fixture-check.md: L-906 has unknown status "maybe" (candidate, ratified or rejected; PROCESS.md section 13)'), r.stdout);
    assert.ok(!lines.some((l) => l.includes('L-902')), r.stdout);
  } finally { cleanup('fixture-check.md'); }
});

test('EZD-000g T5: a status only in the body does not count; --lessons skips bad entries (AC-2)', () => {
  write('fixture-check.md', [`${entry(H[905])}Rule: keep status: ratified out of the heading.\n`, entry(H[906]), entry(H[902])].join('\n'));
  try {
    const r = run('--lessons', 'fixture-check', 'tooling');
    assert.ok(r.stdout.includes('## L-902'));
    assert.ok(!r.stdout.includes('L-905'), r.stdout);
    assert.ok(!r.stdout.includes('L-906'), r.stdout);
  } finally { cleanup('fixture-check.md'); }
});

test('EZD-000g T6: the questions skill writes a fourth section, Rule candidates, and records the answer (AC-3)', () => {
  const text = readFileSync(path.join(root, '.claude/skills/questions/SKILL.md'), 'utf8');
  const front = text.split('---')[1];
  assert.ok(front.includes('rule candidates'));
  const lines = text.split('\n');
  const step3 = lines.find((l) => l.startsWith('3. '));
  assert.ok(step3.includes('with four sections'));
  assert.ok(!step3.includes('three sections'));
  const item = lines.find((l) => l.startsWith('   4. **Rule candidates** - '));
  assert.ok(item, 'item 4 missing');
  for (const s of ['status: candidate', 'vault/lessons/', 'ratify', 'reject']) assert.ok(item.includes(s), `item 4 lacks ${s}`);
  const step4 = lines.find((l) => l.startsWith('4. '));
  for (const s of ['status: ratified', 'status: rejected', 'vault/lessons/INDEX.md', 'QUESTIONS.md', 'answered-josh', 'Q-ID', '<N> / L-nnn']) assert.ok(step4.includes(s), `step 4 lacks ${s}`);
});

test('EZD-000g T7: the wrap skill automates ratified lessons only (Scope)', () => {
  const text = readFileSync(path.join(root, '.claude/skills/wrap/SKILL.md'), 'utf8');
  const step2 = text.split('\n').find((l) => l.startsWith('2. **Lessons**'));
  assert.ok(step2.includes('Any ratified lesson with `seen` of 2 or more, or any ratified lesson a script could check,'));
  assert.ok(!text.includes('Any lesson with `seen`'));
});
