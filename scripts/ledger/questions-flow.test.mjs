// Tests for Q-0129 in vault/tools/next_ticket.mjs: questions are answered before any build, plan QPs become open Q-IDs,
// and a questions unit that changed nothing is not repeated. Runs on a temporary copy of vault/.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
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
// The copied ledger grows with the real one, so the expected IDs are the next ones after its highest Q-ID.
let qa, qb, qc;
const qid = (n) => `Q-${String(n).padStart(4, '0')}`;
// The ledger is one table in three files (Josh 2026-10-28); new rows land in QUESTIONS.md.
const QFILES = ['questions/QUESTIONS.md', 'questions/QUESTIONS-answered.md', 'questions/QUESTIONS-archive.md'];
const qText = (rel) => (existsSync(file(rel)) ? readFileSync(file(rel), 'utf8') : '');
const qRows = (rel) => qText(rel).split('\n').filter((l) => /^\| Q-\d{4} \|/.test(l));
const run = (flag) => spawnSync(process.execPath, [tool(), flag], { encoding: 'utf8' });

before(async () => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-ledger-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  cpSync(path.join(root, 'docs', 'architecture.md'), path.join(dir, 'docs', 'architecture.md'));
  for (const f of ['handoff/STOP', 'handoff/BUDGET_HOLD.md', 'handoff/.questions-last-run.json']) if (existsSync(file(f))) spawnSync('rm', [file(f)]);
  // Fixed fixture, independent of where the live ledger stands (lesson L-003): every phase 0 ticket but EZD-000 is ready,
  // EZD-000i is in questions, and no phase 0 question is open or escalated.
  edit('tickets/STATUS.md', (s) => s.split('\n').map((l) => {
    const c = l.split('|');
    if (c.length < 10 || c[2].trim() !== '0' || !/^ EZD-/.test(c[1]) || c[1].trim() === 'EZD-000') return l;
    c[4] = c[1].trim() === 'EZD-000i' ? ' questions ' : ' ready '; c[5] = ' medium '; c[7] = ' '; return c.join('|');
  }).join('\n'));
  edit('questions/QUESTIONS.md', (s) => s.split('\n').map((l) => {
    const c = l.split('|');
    if (c.length < 10 || !/^ Q-\d{4} $/.test(c[1]) || !/^\s*0\s*\//.test(c[2]) || !/^ (open|escalated) $/.test(c[5])) return l;
    c[5] = ' answered-agent '; return c.join('|');
  }).join('\n'));
  // A live in-flight ticket (e.g. EZD-001 in-progress) depends on the tickets reset above and fails the ledger check.
  edit('tickets/STATUS.md', (s) => s.replace(/^(\| EZD-\w+ \|[^|]*\|[^|]*\| )(?:in-progress|review)( \|)/gm, '$1ready$2'));
  // A live done ticket that depends, directly or through other done tickets, on the tickets reset above
  // (e.g. EZD-001, then EZD-002) also fails the ledger check, so reset done dependents until none is left.
  // Dependencies come from tickets.json depends_on, as the ledger check reads them: a STATUS Depends cell keeps the
  // raw text, which names a split ticket by its parent (EZD-101's cell says EZD-005; depends_on has EZD-005a, EZD-005b).
  const dependsOn = new Map(JSON.parse(readFileSync(file('tickets/tickets.json'), 'utf8')).tickets.map((t) => [t.id, t.depends_on ?? []]));
  for (let changed = true; changed; ) {
    const rows = readFileSync(file('tickets/STATUS.md'), 'utf8').split('\n').filter((l) => /^\| EZD-\w+ \|/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
    const notDone = new Set(rows.filter((c) => c[4] !== 'done').map((c) => c[1]));
    const reset = new Set(rows.filter((c) => c[4] === 'done' && (dependsOn.get(c[1]) ?? []).some((d) => notDone.has(d))).map((c) => c[1]));
    changed = reset.size > 0;
    for (const id of reset) edit('tickets/STATUS.md', (s) => s.replace(new RegExp(`^(\\| ${id} \\|[^|]*\\|[^|]*\\| )done( \\|)`, 'm'), '$1ready$2'));
  }
  // Live escalations on the tickets reset above (e.g. Q-0138) would leak into the fixture; the tests add their own.
  edit('questions/QUESTIONS.md', (s) => s.replace(/^(\| Q-\d{4} \| [^|]*EZD-000[b-i][^|]*\|[^|]*\|[^|]*\| )escalated( \|)/gm, '$1answered-agent$2'));
  // Tickets the reset above opened carry the architecture list their plan names (EZD-244), as the live ledger's open tickets do, and the tooling mark it implies (EZD-253).
  const { planArchitecture } = await import(pathToFileURL(file('tools/outline.mjs')).href);
  const { planTrack } = await import(pathToFileURL(file('tools/next_ticket.mjs')).href);
  edit('tickets/tickets.json', (s) => {
    const data = JSON.parse(s);
    for (const t of data.tickets) {
      const plan = file(`plans/${t.id}.md`);
      if (t.track === undefined && existsSync(plan) && planTrack(readFileSync(plan, 'utf8')) === 'tooling') t.track = 'tooling';
      if (t.architecture !== undefined) continue;
      t.architecture = (existsSync(plan) ? planArchitecture(readFileSync(plan, 'utf8')).list : null) ?? [];
    }
    return JSON.stringify(data, null, 2);
  });
  const top = Math.max(...QFILES.flatMap((q) => [...qText(q).matchAll(/^\| Q-(\d{4}) \|/gm)]).map((m) => Number(m[1])));
  [qa, qb, qc] = [qid(top + 1), qid(top + 2), qid(top + 3)];
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
  assert.deepEqual(ids, [qa, qb]);
  const q = readFileSync(file('questions/QUESTIONS.md'), 'utf8');
  assert.match(q, new RegExp(`^\\| ${qa} \\| 0 \\/ EZD-000i \\(plan QP-1\\) \\| planner \\([0-9-]+\\) \\| Use a or b\\? \\| open \\|`, 'm'));
  assert.match(q, new RegExp(`^\\| ${qb} \\| 0 \\/ EZD-000i \\(plan QP-2\\) \\| .* \\| Pick c \\\\\\| d\\. \\| open \\|`, 'm'));
  const plan = readFileSync(file('plans/EZD-000i.md'), 'utf8');
  assert.match(plan, new RegExp(`^- \\*\\*${qa} \\(was QP-1\\):\\*\\* Use a or b\\?$`, 'm'));
  assert.match(plan, new RegExp(`^${qb} \\(was QP-2\\): Pick c \\| d\\.$`, 'm'));
  assert.equal(nextUnit(), 'questions 0');
});

test('Q-0129: a ticket whose question is escalated waits while ready work builds', () => {
  edit('questions/QUESTIONS.md', (s) => s.replace(new RegExp(`(\\| (?:${qa}|${qb}) \\|[^\\n]*?\\| )open( \\|)`, 'g'), '$1escalated$2'));
  edit('questions/QUESTIONS.md', (s) => `${s.trimEnd()}\n| ${qc} | 0 / EZD-000i (plan QP-9) | planner | Product choice? | escalated |  |  |  |\n`);
  assert.equal(nextUnit(), 'build EZD-000b');
});

test('Josh 2026-10-28: question rows move between the three files whole and unchanged, and --check guards the split', async () => {
  assert.equal(run('--sort-questions').status, 0);
  const all = () => QFILES.flatMap(qRows).sort();
  const before = all();
  assert.equal(new Set(before.map((l) => l.split('|')[1])).size, before.length, 'each Q-ID once');
  for (const rel of QFILES.slice(1)) assert.ok(qRows(rel).every((l) => !/\| (open|escalated) \|/.test(l)), `${rel} holds only answered rows`);
  const row = (id) => qRows('questions/QUESTIONS.md').find((l) => l.startsWith(`| ${id} |`));
  // An escalated row outside QUESTIONS.md fails the check; sorting brings it back unchanged.
  const qaRow = row(qa);
  edit('questions/QUESTIONS.md', (s) => s.replace(`${qaRow}\n`, ''));
  edit('questions/QUESTIONS-answered.md', (s) => `${s.trimEnd()}\n${qaRow}\n`);
  const bad = run('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, new RegExp(`${qa} is escalated but sits in questions/QUESTIONS-answered.md`));
  run('--sort-questions');
  assert.equal(row(qa), qaRow);
  assert.deepEqual(all(), before);
  // A Q-ID in two files fails the check.
  edit('questions/QUESTIONS-archive.md', (s) => `${s.trimEnd()}\n${qaRow}\n`);
  assert.match(run('--check').stdout, new RegExp(`${qa} is in questions/QUESTIONS.md and questions/QUESTIONS-archive.md`));
  edit('questions/QUESTIONS-archive.md', (s) => s.replace(`${qaRow}\n`, ''));
  // Answered rows leave QUESTIONS.md unchanged except for the status the unit wrote; EZD-000i is not done, so they stay needed.
  edit('questions/QUESTIONS.md', (s) => s.replace(new RegExp(`^(\\| (?:${qa}|${qb}|${qc}) \\|[^\\n]*?\\| )escalated( \\|)`, 'gm'), '$1answered-agent$2'));
  const answered = [qa, qb, qc].map(row);
  assert.match(run('--sort-questions').stdout, /^QUESTIONS SORTED: 3 moved;/);
  assert.equal([qa, qb, qc].map(row).filter(Boolean).length, 0);
  assert.deepEqual(answered.map((l) => qRows('questions/QUESTIONS-answered.md').includes(l)), [true, true, true]);
  assert.match(run('--check').stdout, /^LEDGER OK/);
  // IDs are never reused: the highest ID now sits in QUESTIONS-answered.md.
  writeFileSync(file('plans/EZD-000i.md'), `# EZD-000i\n\n## 10. Open questions\n- QP-1: One more?\n`);
  const [next] = (await fresh()).assignQuestionIds('EZD-000i');
  assert.equal(next, qid(Number(qc.slice(2)) + 1));
});
