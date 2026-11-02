// REMEDIATION-PLAN 2.13 N1-N6 (vault/handoff/records-writer/P5-readers.md): next_ticket.mjs reads the running records from the
// records database of its own checkout, and --check validates it. Each case runs on a copied checkout with its own temp
// database (L-041); the copy's expected values come from its own files, never from a pinned live value.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let dir, fileAnswer;
const at = (...p) => path.join(dir, ...p);
const nt = (args, env = {}) => spawnSync(process.execPath, [at('vault/tools/next_ticket.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, EZD_RECORDS_DB: at('records.db'), EZD_RESULTS_FILE: '', ...env } });
const records = () => import(pathToFileURL(at('scripts/records.mjs')).href);
const VIEWS = ['tickets/STATUS.md', 'questions/QUESTIONS.md', 'questions/QUESTIONS-answered.md', 'questions/QUESTIONS-archive.md', 'DONE.md', 'debt.md', 'handoff/CURRENT.md', 'cost/log.jsonl'];

before(async () => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd213-')));
  cpSync(path.join(repo, 'vault'), at('vault'), { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  for (const f of ['docs/architecture.md', '.claude/skills/build-ticket/SKILL.md', 'scripts/records.mjs']) { mkdirSync(path.dirname(at(f)), { recursive: true }); cpSync(path.join(repo, f), at(f)); }
  writeFileSync(at('scripts/launcher.config.json'), JSON.stringify({ log_dir: at('logs') }));
  // The copy's own answer read from its files (no database yet), then the import.
  fileAnswer = nt(['--next-unit'], { EZD_RECORDS_DB: at('none.db') }).stdout;
  const { openRecords, importVault } = await records();
  const db = openRecords(at('records.db'));
  importVault(db, at('vault'));
  db.close();
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('2.13 N1 with the view files deleted, --check and --next-unit read the database and give the file-read answer', () => {
  const saved = Object.fromEntries(VIEWS.map((v) => [v, readFileSync(at('vault', v), 'utf8')]));
  for (const v of VIEWS) unlinkSync(at('vault', v));
  try {
    const c = nt(['--check']);
    assert.equal(c.status, 0, c.stdout + c.stderr);
    assert.match(c.stdout, /^LEDGER OK: \d+ tickets/);
    assert.equal(nt(['--next-unit']).stdout, fileAnswer);
  } finally { for (const [v, t] of Object.entries(saved)) writeFileSync(at('vault', v), t); }
});

test('2.13 N2 a ticket changed only in the database changes what the tool reads; the stale view fails --check', async () => {
  const { openRecords, exportVault } = await records();
  const db = openRecords(at('records.db'));
  const t = db.prepare("select id, phase, status from tickets where status = 'todo' order by id limit 1").get() ?? db.prepare("select id, phase, status from tickets where status != 'blocked' order by id limit 1").get();
  db.prepare("update tickets set status = 'blocked' where id = ?").run(t.id);
  db.close();
  assert.match(nt(['--check']).stdout, /vault\/tickets\/STATUS\.md differs from the records database/, 'the old view on disk is stale');
  const before = nt(['--phase', t.phase], { EZD_RECORDS_DB: at('none.db') }).stdout;
  const d2 = openRecords(at('records.db'));
  exportVault(d2, at('vault'));
  const after = nt(['--phase', t.phase]).stdout;
  assert.notEqual(after, before, `--phase ${t.phase} counts follow the database`);
  d2.prepare('update tickets set status = ? where id = ?').run(t.status, t.id);
  exportVault(d2, at('vault'));
  d2.close();
  assert.equal(nt(['--check']).status, 0);
});

test('2.13 N3 an edited STATUS.md view fails --check', () => {
  const f = at('vault/tickets/STATUS.md');
  const before = readFileSync(f, 'utf8');
  writeFileSync(f, `${before}\nedited by hand\n`);
  try {
    const c = nt(['--check']);
    assert.equal(c.status, 1);
    assert.match(c.stdout, /vault\/tickets\/STATUS\.md differs from the records database \(a view is never edited/);
  } finally { writeFileSync(f, before); }
});

test('2.13 N4 a held plan that changed or went missing fails --check (D9 (a))', async () => {
  const { openRecords, applyOps } = await records();
  const db = openRecords(at('records.db'));
  const t = db.prepare("select id from tickets where status not in ('done') order by id limit 1").get().id;
  applyOps(db, [{ op: 'plan', ticket: t, text: '# held text\n' }]);
  db.close();
  const plan = at('vault/plans', `${t}.md`);
  writeFileSync(plan, '# other text\n');
  let c = nt(['--check']);
  assert.match(c.stdout, new RegExp(`vault/plans/${t}\\.md differs from the text recorded for it`));
  unlinkSync(plan);
  c = nt(['--check']);
  assert.match(c.stdout, new RegExp(`vault/plans/${t}\\.md is missing; the records database holds its text`));
  writeFileSync(plan, '# held text\n');
  c = nt(['--check']);
  assert.doesNotMatch(c.stdout, new RegExp(`plans/${t}\\.md`));
});

test('2.13 N5 a database of another checkout is an error', async () => {
  const other = path.join(dir, 'other.db');
  const { openRecords } = await records();
  const db = openRecords(other);
  db.prepare("insert into meta (key, value) values ('checkout', '/somewhere/else')").run();
  db.close();
  const r = nt(['--next-unit'], { EZD_RECORDS_DB: other });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /belongs to \/somewhere\/else/);
});

test('2.13 N6 --sort-questions moves rows in the database; inside a unit it is deferred', async () => {
  const { openRecords, applyOps, exportVault } = await records();
  const db = openRecords(at('records.db'));
  const q = db.prepare("select id from questions where file = 'questions/QUESTIONS.md' and status = 'open' order by id limit 1").get();
  db.close();
  if (!q) return; // no open row in this copy: nothing to sort
  const d1 = openRecords(at('records.db'));
  applyOps(d1, [{ op: 'answer', id: q.id, status: 'answered-agent', answered_by: 'test', answer: 'x', source: 'N6' }]);
  exportVault(d1, at('vault'));
  d1.close();
  const deferred = nt(['--sort-questions'], { EZD_RESULTS_FILE: at('unit.results.jsonl') });
  assert.match(deferred.stdout, /QUESTIONS SORT DEFERRED/);
  const r = nt(['--sort-questions']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /QUESTIONS SORTED: [1-9]\d* moved/);
  const d2 = openRecords(at('records.db'));
  assert.notEqual(d2.prepare('select file from questions where id = ?').get(q.id).file, 'questions/QUESTIONS.md');
  d2.close();
  assert.equal(nt(['--check']).status, 0, nt(['--check']).stdout);
});
