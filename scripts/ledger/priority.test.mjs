// Tests for the "priority": 1 flag in vault/tools/next_ticket.mjs (Josh 2026-10-27): a flagged ticket is planned and built
// before the others of its phase, then by number. Runs on a temporary copy of vault/ with a fixed phase 1 state: four
// synthetic phase 1 tickets (two todo, two ready, no dependencies) and every other phase 1 ticket blocked, so the result
// never depends on where the live ledger stands.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let vault;
const file = (rel) => path.join(vault, rel);
const tool = (name, args) => spawnSync(process.execPath, [file(`tools/${name}`), ...args], { encoding: 'utf8' });
const nextUnit = () => tool('next_ticket.mjs', ['--next-unit']).stdout.trim();
const tickets = () => JSON.parse(readFileSync(file('tickets/tickets.json'), 'utf8'));
const setTickets = (data) => writeFileSync(file('tickets/tickets.json'), JSON.stringify(data, null, 1) + '\n');
const flag = (id, on) => { const d = tickets(); const t = d.tickets.find((x) => x.id === id); if (on) t.priority = 1; else delete t.priority; setTickets(d); };
// STATUS.md columns after the ID: Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes
const statusOf = (id) => readFileSync(file('tickets/STATUS.md'), 'utf8').match(new RegExp(`^\\| ${id} \\|[^|]*\\|[^|]*\\| ([a-z-]+) `, 'm'))?.[1];
const setStatus = (id, st) => writeFileSync(file('tickets/STATUS.md'), readFileSync(file('tickets/STATUS.md'), 'utf8')
  .replace(new RegExp(`^(\\| ${id} \\|[^|]*\\|[^|]*\\| )[a-z-]+( \\|)`, 'm'), `$1${st}$2`));

// The synthetic tickets the test drives, numbered above every real ticket.
const [todoLow, todoHigh, low, high] = ['EZD-9990', 'EZD-9991', 'EZD-9992', 'EZD-9993'];
const SYNTHETIC = [[todoLow, 'todo'], [todoHigh, 'todo'], [low, 'ready'], [high, 'ready']];

before(() => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-priority-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  cpSync(path.join(root, 'docs', 'architecture.md'), path.join(dir, 'docs', 'architecture.md'));
  for (const f of ['handoff/STOP', 'handoff/BUDGET_HOLD.md', 'handoff/LAUNCHER_FIX.md']) if (existsSync(file(f))) rmSync(file(f));

  // No live priority flags, and no open question row (an open row sends --next-unit to the questions unit).
  const data = tickets();
  for (const t of data.tickets) delete t.priority;
  writeFileSync(file('questions/QUESTIONS.md'), readFileSync(file('questions/QUESTIONS.md'), 'utf8')
    .replace(/^(\|\s*Q-\d{4}\s*\|[^|]*\|[^|]*\|[^|]*\|\s*)open(\s*\|)/gm, '$1answered-agent$2'));

  // No ticket in flight, and every real phase 1 ticket that is not done is blocked (a blocked row needs a note).
  const phase1 = new Set(data.tickets.filter((t) => t.phase === 1).map((t) => t.id));
  writeFileSync(file('tickets/STATUS.md'), readFileSync(file('tickets/STATUS.md'), 'utf8').split('\n').map((line) => {
    const m = line.match(/^\| (EZD-\w+) \|(.*)\|$/);
    if (!m) return line;
    const c = m[2].split('|');
    const st = c[2].trim();
    if (phase1.has(m[1]) && st !== 'done') { c[2] = ' blocked '; if (!c[7].trim()) c[7] = ' priority test '; }
    else if (st === 'in-progress' || st === 'review') c[2] = ' ready ';
    return `| ${m[1]} |${c.join('|')}|`;
  }).join('\n'));

  // Later phases stay quiet (EZD-281 D3): an open question of any phase is answered, and every todo, planned or questions ticket of a signed-off
  // phase above phase 1 is blocked. Unsigned phases are left alone.
  const signed = new Set(readFileSync(file('spec/SIGNOFF.md'), 'utf8').split(/\r?\n/).map((l) => l.match(/^\|\s*(\d+)\s*\|/)).filter(Boolean).map((m) => Number(m[1])));
  for (const rel of ['questions/QUESTIONS.md', 'questions/QUESTIONS-answered.md', 'questions/QUESTIONS-archive.md']) if (existsSync(file(rel))) {
    writeFileSync(file(rel), readFileSync(file(rel), 'utf8').replace(/^(\|\s*Q-\d{4}\s*\|[^|]*\|[^|]*\|[^|]*\|\s*)open(\s*\|)/gm, '$1answered-agent$2'));
  }
  writeFileSync(file('tickets/STATUS.md'), readFileSync(file('tickets/STATUS.md'), 'utf8').split('\n').map((line) => {
    const m = line.match(/^\| (EZD-\w+) \|(.*)\|$/);
    if (!m) return line;
    const c = m[2].split('|');
    if (!(Number(c[0]) > 1) || !signed.has(Number(c[0])) || !['todo', 'planned', 'questions'].includes(c[2].trim())) return line;
    c[2] = ' blocked '; if (!c[7].trim()) c[7] = ' priority test fixture ';
    return `| ${m[1]} |${c.join('|')}|`;
  }).join('\n'));

  // The synthetic tickets: tickets.json, a STATUS.md row and a phase file row (gen_acs reads the Done-when from it).
  const model = data.tickets.find((t) => t.phase === 1);
  for (const [id] of SYNTHETIC) {
    data.tickets.push({ id, phase: 1, title: `Priority test ${id}`, spec_files: model.spec_files, decisions: model.decisions, mockups: [],
      phase_file: 'tickets/phases/phase-01.md', depends_on: [], acs: [], architecture: [] });
  }
  setTickets(data);
  appendFileSync(file('tickets/STATUS.md'), SYNTHETIC.map(([id, st]) => `| ${id} | 1 | Priority test ${id} | ${st} | ${st === 'ready' ? 'low' : ''} |  |  |  | Synthetic ticket of scripts/ledger/priority.test.mjs. |\n`).join(''));
  appendFileSync(file('tickets/phases/phase-01.md'), '\n' + SYNTHETIC.map(([id]) => `| ${id} | Priority test ${id} | The test passes. | — | — |\n`).join(''));
  const acs = tool('gen_acs.mjs', []);
  assert.equal(acs.status, 0, acs.stdout + acs.stderr);

  const check = tool('next_ticket.mjs', ['--check']);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  for (const [id, st] of SYNTHETIC) assert.equal(statusOf(id), st);
});

test('priority flag: a flagged todo ticket is planned before a lower-numbered one', () => {
  assert.equal(nextUnit(), `plan ${todoLow}`);
  flag(todoHigh, true);
  assert.equal(nextUnit(), `plan ${todoHigh}`);
  flag(todoHigh, false);
});

test('priority flag: a flagged ready ticket is built before a lower-numbered one', () => {
  setStatus(todoLow, 'blocked');
  setStatus(todoHigh, 'blocked');
  assert.equal(nextUnit(), `build ${low}`);
  flag(high, true);
  assert.equal(nextUnit(), `build ${high}`);
});
