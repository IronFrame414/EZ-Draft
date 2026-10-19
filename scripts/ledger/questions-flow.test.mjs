// Tests for Q-0129 in vault/tools/next_ticket.mjs: questions are answered before any build, plan QPs become open Q-IDs,
// and a questions unit that changed nothing is not repeated. Runs on a temporary copy of vault/.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let vault;
const tool = () => path.join(vault, 'tools/next_ticket.mjs');
const nextUnit = () => spawnSync(process.execPath, [tool(), '--next-unit'], { encoding: 'utf8' }).stdout.trim();
const file = (rel) => path.join(vault, rel);
const edit = (rel, fn) => writeFileSync(file(rel), fn(readFileSync(file(rel), 'utf8')));
function setStatus(id, st, complexity = 'medium') {
  edit('tickets/STATUS.md', (s) => s.split('\n').map((l) => {
    if (!l.startsWith(`| ${id} |`)) return l;
    const c = l.split('|'); c[4] = ` ${st} `; c[5] = ` ${complexity} `; return c.join('|');
  }).join('\n'));
}
const fresh = async () => import(`${pathToFileURL(tool()).href}?t=${Date.now()}${Math.random()}`);

before(() => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-ledger-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  for (const f of ['handoff/STOP', 'handoff/BUDGET_HOLD.md', 'handoff/.questions-last-run.json']) if (existsSync(file(f))) spawnSync('rm', [file(f)]);
  for (const id of ['EZD-000b', 'EZD-000c', 'EZD-000d', 'EZD-000e', 'EZD-000f', 'EZD-000g', 'EZD-000h']) setStatus(id, 'ready');
  setStatus('EZD-000i', 'questions');
});

test('Q-0129: a questions ticket with no escalated question gets a questions unit before any build', () => {
  assert.equal(nextUnit(), 'questions 0');
});

test('Q-0129: a questions unit that changed nothing is not run again until the ledger changes', async () => {
  const fp = (await fresh()).questionsFingerprint();
  writeFileSync(file('handoff/.questions-last-run.json'), JSON.stringify({ phase: 0, before: fp, after: fp }));
  assert.equal(nextUnit(), 'build EZD-000b');
  writeFileSync(file('handoff/.questions-last-run.json'), JSON.stringify({ phase: 0, before: 'x', after: fp }));
  assert.equal(nextUnit(), 'questions 0', 'a run that changed something may run again');
  spawnSync('rm', [file('handoff/.questions-last-run.json')]);
});

test('Q-0129: plan QPs become open Q-IDs and the questions unit is due', async () => {
  writeFileSync(file('plans/EZD-000i.md'), `# EZD-000i\n\n## 10. Open questions\n- **QP-1:** Use a or b?\nQP-2: Pick c | d.\n- Q-0126 (was QP-1; answered-agent): old.\n`);
  const ids = (await fresh()).assignQuestionIds('EZD-000i');
  assert.deepEqual(ids, ['Q-0130', 'Q-0131']);
  const q = readFileSync(file('questions/QUESTIONS.md'), 'utf8');
  assert.match(q, /^\| Q-0130 \| 0 \/ EZD-000i \(plan QP-1\) \| planner \([0-9-]+\) \| Use a or b\? \| open \|/m);
  assert.match(q, /^\| Q-0131 \| 0 \/ EZD-000i \(plan QP-2\) \| .* \| Pick c \\\| d\. \| open \|/m);
  const plan = readFileSync(file('plans/EZD-000i.md'), 'utf8');
  assert.match(plan, /^- \*\*Q-0130 \(was QP-1\):\*\* Use a or b\?$/m);
  assert.match(plan, /^Q-0131 \(was QP-2\): Pick c \| d\.$/m);
  assert.equal(nextUnit(), 'questions 0');
});

test('Q-0129: a ticket whose question is escalated waits while ready work builds', () => {
  edit('questions/QUESTIONS.md', (s) => s.replace(/(\| Q-013[01] \|[^\n]*?\| )open( \|)/g, '$1escalated$2'));
  edit('questions/QUESTIONS.md', (s) => `${s.trimEnd()}\n| Q-0132 | 0 / EZD-000i (plan QP-9) | planner | Product choice? | escalated |  |  |  |\n`);
  assert.equal(nextUnit(), 'build EZD-000b');
});
