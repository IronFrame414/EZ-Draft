// EZD-000d T1-T10: vault/tools/research.mjs, research store, CLAUDE.md row, skill sentences (plan vault/plans/EZD-000d.md sections 3 and 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tool = path.join(root, 'vault/tools/research.mjs');

const H = '# Research reports\n\nHeader line.\n';
const DIGEST_B = '---\ntitle: Title B\nscope: app/src\nticket: EZD-101\n---\nBody B\n';
const WEB_A = '---\ntitle:  Title A \nscope: example.com\nticket: EZD-102\nextra: ignored\n---\nBody A\n';
const BAD_NOFM = '# no front matter\n';
const BAD_NOSCOPE = '---\ntitle: T\nticket: EZD-1\n---\n';
const PIPE = '---\ntitle: a | b\nscope: x\nticket: EZD-1\n---\n';

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Builds <tmp>/vault/research with a copy of the tool; pending = { name: content }, index = string or null (no INDEX.md).
function makeTree({ index = H, pending = {}, withPendingDir = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd000d-'));
  fs.mkdirSync(path.join(tmp, 'vault/tools'), { recursive: true });
  fs.copyFileSync(tool, path.join(tmp, 'vault/tools/research.mjs'));
  const rdir = path.join(tmp, 'vault/research');
  fs.mkdirSync(rdir, { recursive: true });
  if (index !== null) fs.writeFileSync(path.join(rdir, 'INDEX.md'), index);
  if (withPendingDir) {
    fs.mkdirSync(path.join(rdir, 'pending'));
    for (const [n, c] of Object.entries(pending)) fs.writeFileSync(path.join(rdir, 'pending', n), c);
  }
  return { tmp, rdir };
}
function run(tmp, args = ['adopt']) {
  return spawnSync('node', [path.join(tmp, 'vault/tools/research.mjs'), ...args], { encoding: 'utf8' });
}
const read = (p) => fs.readFileSync(p, 'utf8');
const ls = (p) => fs.readdirSync(p).sort();

test('EZD-000d T1 adopt moves two pending files to R-001 and R-002, indexes them, prints IDs, leaves pending empty', () => {
  const before = localDate();
  const { tmp, rdir } = makeTree({ pending: { '.gitkeep': '', 'retriever-digest-b.md': DIGEST_B, 'retriever-web-a.md': WEB_A } });
  const r = run(tmp);
  const after = localDate();
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'R-001\nR-002\n');
  assert.equal(read(path.join(rdir, 'R-001.md')), DIGEST_B);
  assert.equal(read(path.join(rdir, 'R-002.md')), WEB_A);
  assert.deepEqual(ls(path.join(rdir, 'pending')), ['.gitkeep']);
  const ok = [before, after].some((d) =>
    read(path.join(rdir, 'INDEX.md')) === H + `R-001 | ${d} | Title B | app/src | EZD-101\nR-002 | ${d} | Title A | example.com | EZD-102\n`);
  assert.ok(ok, read(path.join(rdir, 'INDEX.md')));
});

test('EZD-000d T2 a second adopt with nothing pending prints nothing and changes nothing', () => {
  const { tmp, rdir } = makeTree({ pending: { '.gitkeep': '', 'retriever-digest-b.md': DIGEST_B, 'retriever-web-a.md': WEB_A } });
  assert.equal(run(tmp).status, 0);
  const snap = () => [read(path.join(rdir, 'INDEX.md')), ls(rdir), ls(path.join(rdir, 'pending'))];
  const first = snap();
  const r = run(tmp);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  assert.deepEqual(snap(), first);
});

test('EZD-000d T3 adopt() numbers after the largest existing file or index number', async () => {
  const { adopt } = await import(pathToFileURL(tool).href);
  const a = makeTree({ index: H + 'R-007 | 2026-10-01 | x | y | z\n', pending: { 'one.md': DIGEST_B, 'two.md': WEB_A } });
  fs.writeFileSync(path.join(a.rdir, 'R-007.md'), 'old\n');
  const ra = adopt(a.rdir, '2026-10-19');
  assert.deepEqual(ra.ids, ['R-008', 'R-009']);
  const lines = read(path.join(a.rdir, 'INDEX.md')).trimEnd().split('\n');
  assert.ok(lines[lines.length - 1].startsWith('R-009 | 2026-10-19 |'), lines.at(-1));
  const b = makeTree({ index: H + 'R-010 | 2026-10-01 | x | y | z\n', pending: { 'one.md': DIGEST_B } });
  assert.deepEqual(adopt(b.rdir, '2026-10-19').ids, ['R-011']);
});

test('EZD-000d T4 adopt() trims values, turns pipes to slashes, ignores extra keys, adds a missing newline', async () => {
  const { adopt } = await import(pathToFileURL(tool).href);
  const { rdir } = makeTree({ index: '# Research reports\n\nHeader line.', pending: { 'pipe.md': PIPE, 'retriever-web-a.md': WEB_A } });
  adopt(rdir, '2026-10-19');
  assert.equal(read(path.join(rdir, 'INDEX.md')),
    '# Research reports\n\nHeader line.\nR-001 | 2026-10-19 | a / b | x | EZD-1\nR-002 | 2026-10-19 | Title A | example.com | EZD-102\n');
});

test('EZD-000d T5 invalid pending files are reported, kept, and the valid one is adopted; exit 1', () => {
  const { tmp, rdir } = makeTree({ pending: { 'bad-nofm.md': BAD_NOFM, 'bad-noscope.md': BAD_NOSCOPE, 'retriever-digest-b.md': DIGEST_B } });
  const r = run(tmp);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, 'R-001\n');
  const err = r.stderr.split('\n');
  assert.ok(err.includes('research: skipped pending/bad-nofm.md: no front matter'), r.stderr);
  assert.ok(err.includes('research: skipped pending/bad-noscope.md: missing scope'), r.stderr);
  assert.deepEqual(ls(path.join(rdir, 'pending')), ['bad-nofm.md', 'bad-noscope.md']);
  assert.equal(read(path.join(rdir, 'INDEX.md')).split('\n').filter((l) => /^R-\d+ \|/.test(l)).length, 1);
});

test('EZD-000d T6 no pending folder, or only non-report files, prints nothing and changes nothing', () => {
  const a = makeTree({ withPendingDir: false });
  const ra = run(a.tmp);
  assert.equal(ra.status, 0);
  assert.equal(ra.stdout, '');
  assert.equal(read(path.join(a.rdir, 'INDEX.md')), H);
  const b = makeTree({ pending: { 'notes.txt': 'x', '.gitkeep': '' } });
  const rb = run(b.tmp);
  assert.equal(rb.status, 0);
  assert.equal(rb.stdout, '');
  assert.equal(read(path.join(b.rdir, 'INDEX.md')), H);
  assert.ok(fs.existsSync(path.join(b.rdir, 'pending/notes.txt')));
});

test('EZD-000d T7 wrong arguments exit 2 with the usage line', () => {
  const { tmp } = makeTree();
  for (const args of [[], ['foo'], ['adopt', 'x']]) {
    const r = run(tmp, args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.ok(r.stderr.startsWith('usage: node vault/tools/research.mjs adopt'), r.stderr);
  }
});

test('EZD-000d T8 the research store files exist as the contract says', () => {
  const rdir = path.join(root, 'vault/research');
  // Q-0149 (orchestrator, rule 19, 2026-10-19): the store is live once a report is adopted, so T8 checks the contract
  // (header, one well-formed line per adopted report, each backed by its file) instead of an empty store.
  const header = '# Research reports\n\nOne line per report: `R-NNN | date | title | scope | ticket`, appended by `node vault/tools/research.mjs adopt`. Read only the reports your plan or dispatch names (PROCESS.md section 13).\n\n';
  const index = read(path.join(rdir, 'INDEX.md'));
  assert.ok(index.startsWith(header));
  const rows = index.slice(header.length).split('\n').filter((l) => l !== '');
  for (const l of rows) assert.match(l, /^R-\d{3,} \| \d{4}-\d{2}-\d{2} \| [^|]+ \| [^|]+ \| EZD-\S+$/);
  const ids = rows.map((l) => l.split(' | ')[0]);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ls(rdir).filter((n) => /^R-.*\.md$/.test(n)).sort(), ids.map((id) => `${id}.md`).sort());
  assert.equal(fs.statSync(path.join(rdir, 'pending/.gitkeep')).size, 0);
  assert.ok(!ls(path.join(rdir, 'pending')).some((n) => n.endsWith('.md')));
});

test('EZD-000d T9 done when: CLAUDE.md has the research row in place and is at most 60 lines', () => {
  const lines = read(path.join(root, 'CLAUDE.md')).split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const row = '| Findings from earlier lookups | vault/research/INDEX.md (only the reports your plan names) |';
  const hits = lines.flatMap((l, i) => (l === row ? [i] : []));
  assert.equal(hits.length, 1);
  const i = hits[0];
  assert.ok(lines[i - 1].startsWith('| Models, budget, units, gates |'));
  assert.ok(lines[i + 1].startsWith('| Gate and ledger commands |'));
  const start = lines.indexOf('## Directory');
  assert.ok(start >= 0 && i > start);
  const next = lines.findIndex((l, k) => k > start && l.startsWith('## '));
  assert.ok(next === -1 || i < next);
  assert.ok(lines.length <= 60, `lines: ${lines.length}`);
});

test('EZD-000d T10 skill files carry the adopt sentences and keep their step numbers', () => {
  const S1 = 'If a retriever you dispatched returned a `REPORT:` line, run `node scripts/ledger.mjs research $ARGUMENTS` before you finish and cite the IDs it prints as `R-NNN` in section 2; a ticket no report covers says so in section 2.';
  const S2 = '**Research reports.** After any dispatch that returned a `REPORT:` line, run `node scripts/ledger.mjs research $ARGUMENTS`; it moves each of this ticket\'s pending reports to `vault/research/R-NNN.md`, commits them and prints the IDs to cite (PROCESS.md section 13).';
  const plan = read(path.join(root, '.claude/skills/plan-ticket/SKILL.md')).split('\n');
  const step2 = plan.find((l) => l.startsWith('2. Write `vault/plans/$ARGUMENTS.md`'));
  assert.ok(step2 && step2.endsWith(' ' + S1));
  const build = read(path.join(root, '.claude/skills/build-ticket/SKILL.md')).split('\n');
  const k = build.findIndex((l) => l.startsWith('**Load only:**'));
  assert.ok(k >= 0);
  assert.equal(build[k + 1], '');
  assert.equal(build[k + 2], S2);
  const nums = (ls_) => ls_.filter((l) => /^\d+\. /.test(l)).map((l) => l.match(/^(\d+)\./)[1]);
  assert.deepEqual(nums(plan), ['1', '2', '3', '4']);
  assert.deepEqual(nums(build), Array.from({ length: 12 }, (_, n) => String(n)));
});

// EZD-173 R1 (plan vault/plans/EZD-173.md section 4; C11, C4): adopt() can be limited to one ticket, and the ledger command
// commits exactly the files that adoption changed.
const R1_ID = ['-c', 'user.name=EZ Draft Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false'];
const r1git = (dir, ...a) => {
  const r = spawnSync('git', ['-C', dir, ...R1_ID, ...a], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const R1_2 = '---\ntitle: Title Two\nscope: app/src\nticket: EZD-002\n---\nBody two\n';
const R1_3 = '---\ntitle: Title Three\nscope: app/src\nticket: EZD-003\n---\nBody three\n';

test('EZD-173 R1 adopt with a ticket moves only that ticket\'s reports; the ledger research command commits only the adopted files', async () => {
  const { adopt } = await import(pathToFileURL(tool).href);
  const a = makeTree({ pending: { 'two.md': R1_2, 'three.md': R1_3 } });
  const res = adopt(a.rdir, '2026-10-24', { ticket: 'EZD-002' });
  assert.deepEqual(res.ids, ['R-001']);
  assert.deepEqual(res.skipped, []);
  assert.deepEqual(res.moved, [{ file: 'two.md', id: 'R-001' }]);
  assert.deepEqual(ls(path.join(a.rdir, 'pending')), ['three.md']);

  const { tmp, rdir } = makeTree({});
  r1git(tmp, 'init', '-q', '-b', 'develop');
  r1git(tmp, 'config', 'user.name', 'EZ Draft Test');
  r1git(tmp, 'config', 'user.email', 'test@example.test');
  r1git(tmp, 'config', 'commit.gpgsign', 'false');
  r1git(tmp, 'add', '-A');
  r1git(tmp, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(rdir, 'pending', 'two.md'), R1_2);
  fs.writeFileSync(path.join(rdir, 'pending', 'three.md'), R1_3);
  const inflight = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd173-r1-inflight-'));
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/ledger.mjs'), 'research', 'EZD-002'], {
    encoding: 'utf8', env: { ...process.env, EZD_ROOT: tmp, EZD_INFLIGHT_DIR: inflight },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout.trim(), /^LEDGER OK research R-001$/);
  assert.equal(r1git(tmp, 'log', '-1', '--format=%s'), 'docs(vault): EZD-002 research');
  assert.deepEqual(r1git(tmp, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['vault/research/INDEX.md', 'vault/research/R-001.md']);
  assert.ok(fs.existsSync(path.join(rdir, 'pending', 'three.md')));
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(inflight, { recursive: true, force: true });
});

test('EZD-173 R2 an unreadable pending report is skipped and kept; the ledger research command commits the adopted files, prints LEDGER FAIL and exits 1', async () => {
  const { adopt } = await import(pathToFileURL(tool).href);
  const a = makeTree({ pending: { 'two.md': R1_2, 'bad.md': 'no front matter here' } });
  const res = adopt(a.rdir, '2026-10-24', { ticket: 'EZD-002' });
  assert.deepEqual(res.skipped, [{ file: 'bad.md', reason: 'no front matter' }]);
  assert.deepEqual(res.moved, [{ file: 'two.md', id: 'R-001' }]);

  const { tmp, rdir } = makeTree({});
  r1git(tmp, 'init', '-q', '-b', 'develop');
  r1git(tmp, 'config', 'user.name', 'EZ Draft Test');
  r1git(tmp, 'config', 'user.email', 'test@example.test');
  r1git(tmp, 'config', 'commit.gpgsign', 'false');
  r1git(tmp, 'add', '-A');
  r1git(tmp, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(rdir, 'pending', 'two.md'), R1_2);
  fs.writeFileSync(path.join(rdir, 'pending', 'bad.md'), 'no front matter here');
  const inflight = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd173-r2-inflight-'));
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/ledger.mjs'), 'research', 'EZD-002'], {
    encoding: 'utf8', env: { ...process.env, EZD_ROOT: tmp, EZD_INFLIGHT_DIR: inflight },
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), 'LEDGER FAIL: research R-001; skipped pending/bad.md: no front matter');
  assert.equal(r1git(tmp, 'log', '-1', '--format=%s'), 'docs(vault): EZD-002 research');
  assert.deepEqual(r1git(tmp, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['vault/research/INDEX.md', 'vault/research/R-001.md']);
  assert.ok(fs.existsSync(path.join(rdir, 'pending', 'bad.md')));
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(inflight, { recursive: true, force: true });
});
