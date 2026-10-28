// Tests for the "priority": 1 flag in vault/tools/next_ticket.mjs (Josh 2026-10-27): a flagged ticket is planned and built
// before the others of its phase, then by number. Runs on a temporary copy of vault/ with a fixed phase 1 state.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let vault;
const file = (rel) => path.join(vault, rel);
const nextUnit = () => spawnSync(process.execPath, [file('tools/next_ticket.mjs'), '--next-unit'], { encoding: 'utf8' }).stdout.trim();
const tickets = () => JSON.parse(readFileSync(file('tickets/tickets.json'), 'utf8'));
const setTickets = (data) => writeFileSync(file('tickets/tickets.json'), JSON.stringify(data, null, 1) + '\n');
const flag = (id, on) => { const d = tickets(); const t = d.tickets.find((x) => x.id === id); if (on) t.priority = 1; else delete t.priority; setTickets(d); };
const statusOf = (id) => readFileSync(file('tickets/STATUS.md'), 'utf8').match(new RegExp(`^\\| ${id} \\|[^|]*\\|[^|]*\\| ([a-z-]+) `, 'm'))?.[1];
const setStatus = (id, st) => writeFileSync(file('tickets/STATUS.md'), readFileSync(file('tickets/STATUS.md'), 'utf8')
  .replace(new RegExp(`^(\\| ${id} \\|[^|]*\\|[^|]*\\| )[a-z-]+( \\|)`, 'm'), `$1${st}$2`));

// Two phase 1 tickets the test drives, both with every dependency done in the live ledger.
let low, high, todoLow, todoHigh;

before(() => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-priority-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  for (const f of ['handoff/STOP', 'handoff/BUDGET_HOLD.md', 'handoff/LAUNCHER_FIX.md']) if (existsSync(file(f))) rmSync(file(f));
  // No ticket in flight, so --next-unit reaches the plan and build choices.
  writeFileSync(file('tickets/STATUS.md'), readFileSync(file('tickets/STATUS.md'), 'utf8').replace(/^(\| EZD-\w+ \|[^|]*\|[^|]*\| )(?:in-progress|review)( \|)/gm, '$1ready$2'));
  const st = readFileSync(file('tickets/STATUS.md'), 'utf8');
  const doneSet = new Set([...st.matchAll(/^\| (EZD-\w+) \|[^|]*\|[^|]*\| done /gm)].map((m) => m[1]));
  const p1 = tickets().tickets.filter((t) => t.phase === 1 && (t.depends_on ?? []).every((d) => doneSet.has(d)));
  const ready = p1.filter((t) => statusOf(t.id) === 'ready');
  const todo = p1.filter((t) => statusOf(t.id) === 'todo');
  [low, high] = [ready[0].id, ready[ready.length - 1].id];
  [todoLow, todoHigh] = [todo[0]?.id, todo[todo.length - 1]?.id];
});

test('priority flag: a flagged todo ticket is planned before a lower-numbered one', (t) => {
  if (!todoLow || todoLow === todoHigh) return t.skip('fewer than two phase 1 todo tickets in the live ledger');
  assert.equal(nextUnit(), `plan ${todoLow}`);
  flag(todoHigh, true);
  assert.equal(nextUnit(), `plan ${todoHigh}`);
  flag(todoHigh, false);
});

test('priority flag: a flagged ready ticket is built before a lower-numbered one', () => {
  for (const t of tickets().tickets) if (t.phase === 1 && statusOf(t.id) === 'todo') setStatus(t.id, 'blocked');
  assert.notEqual(low, high);
  const before = nextUnit();
  assert.match(before, /^build EZD-/, before);
  assert.notEqual(before, `build ${high}`);
  flag(high, true);
  assert.equal(nextUnit(), `build ${high}`);
});
