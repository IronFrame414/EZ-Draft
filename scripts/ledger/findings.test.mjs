// Tests for EZD-245: review findings log (vault/tools/findings.mjs), plan-checker reads, skill and doc text.
// Each case runs on a fresh temporary copy of vault/ so the real lessons and log are never touched.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let dir, vault;

const findings = (...args) => spawnSync(process.execPath, [path.join(vault, 'tools/findings.mjs'), ...args], { encoding: 'utf8' });
const next = (...args) => spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs'), ...args], { encoding: 'utf8' });
const logPath = () => path.join(vault, 'lessons/findings.jsonl');
const planPath = () => path.join(vault, 'plans/EZD-245.md');
const logLines = () => readFileSync(logPath(), 'utf8').split('\n').filter((l) => l !== '');
const rec = (t, round, reviewer, cat, text) => {
  const r = findings('record', t, String(round), reviewer, cat, text);
  assert.equal(r.status, 0, `record failed: ${r.stderr}`);
  return r;
};
const real = (p) => readFileSync(path.join(root, p), 'utf8');
const step = (text, n) => {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${n}. `));
  assert.ok(start >= 0, `step ${n} not found`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^\d+\. /.test(lines[i])) { end = i; break; }
  return lines.slice(start, end).join('\n');
};

const PLANNER = [
  '## L-901  areas: tooling  seen: 1  status: ratified',
  'Rule: fixture L-901.',
  'Plan check: fixture check L-901.',
  '',
  '## L-902  areas: tooling  seen: 1  status: candidate',
  'Rule: fixture L-902.',
  '',
  '## L-903  areas: ui  seen: 1  status: ratified',
  'Rule: fixture L-903.',
  '',
].join('\n');
const planWith = (areas) => `# EZD-245 · fixture\n\n- **Areas:** ${areas}\n\n## 1. What to build\n`;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-findings-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  // next_ticket.mjs reads the role table from <root>/.claude/skills/build-ticket/SKILL.md and docs/architecture.md, one folder above the vault
  mkdirSync(path.join(dir, '.claude/skills/build-ticket'), { recursive: true });
  cpSync(path.join(root, '.claude/skills/build-ticket/SKILL.md'), path.join(dir, '.claude/skills/build-ticket/SKILL.md'));
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  cpSync(path.join(root, 'docs/architecture.md'), path.join(dir, 'docs/architecture.md'));
  rmSync(logPath(), { force: true });
  writeFileSync(path.join(vault, 'lessons/planner.md'), PLANNER);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const CATS = ['scope-missing', 'scope-extra', 'contract-gap', 'pinned-stack', 'test-defect', 'test-missing', 'test-weak', 'test-isolation',
  'general-case', 'error-handling', 'architecture-rule', 'security', 'gate-red', 'ui-mismatch', 'calc', 'docs'];
const F4 = () => {
  rec('EZD-245', 1, 'code-reviewer', 'test-weak', 'a');
  rec('EZD-246', 1, 'code-reviewer', 'test-weak', 'b');
  rec('EZD-245', 1, 'code-reviewer', 'docs', 'c');
};

test('EZD-245 F1 record writes one finding line (AC-1)', () => {
  const r = findings('record', 'EZD-245', '1', 'code-reviewer', 'test-weak', 'T12', 'passes', 'on', 'an', 'empty', 'body');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'FINDING RECORDED EZD-245 r1 code-reviewer test-weak');
  const lines = logLines();
  assert.equal(lines.length, 1);
  const o = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(o), ['date', 'ticket', 'round', 'reviewer', 'category', 'text', 'lesson']);
  assert.equal(o.ticket, 'EZD-245');
  assert.equal(o.round, 1);
  assert.equal(typeof o.round, 'number');
  assert.equal(o.reviewer, 'code-reviewer');
  assert.equal(o.category, 'test-weak');
  assert.equal(o.text, 'T12 passes on an empty body');
  assert.equal(o.lesson, null);
  assert.match(o.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('EZD-245 F2 record refuses bad input and writes nothing (AC-1)', () => {
  const ok = ['EZD-245', '1', 'code-reviewer', 'test-weak', 'x'];
  const cases = [
    [3, 'nonsense', 'unknown category "nonsense" (run node vault/tools/findings.mjs categories)'],
    [2, 'planner', 'unknown reviewer "planner" (code-reviewer, security-reviewer, ui-verifier, calc-auditor, gate)'],
    [0, 'EZD-9999', 'unknown ticket EZD-9999 (not in tickets.json)'],
    [1, '0', 'round must be a whole number 1 or more'],
    [1, 'x', 'round must be a whole number 1 or more'],
    [4, '   ', 'text must be one line of 1 to 300 characters'],
    [4, 'a'.repeat(301), 'text must be one line of 1 to 300 characters'],
    [4, 'a\nb', 'text must be one line of 1 to 300 characters'],
  ];
  for (const [idx, val, msg] of cases) {
    const args = [...ok];
    args[idx] = val;
    const r = findings('record', ...args);
    assert.equal(r.status, 1, `${val}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stderr.startsWith('findings: '), r.stderr);
    assert.ok(r.stderr.includes(msg), `${msg} not in ${r.stderr}`);
  }
  assert.ok(!existsSync(logPath()));
});

test('EZD-245 F3 categories lists the 16 fixed categories (AC-1)', () => {
  const r = findings('categories');
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  assert.equal(lines.length, 16);
  assert.deepEqual(lines.map((l) => l.split(' - ')[0]), CATS);
  assert.equal(lines[0], 'scope-missing - a ticket or plan item was not built');
});

test('EZD-245 F4 repeats names a category seen on two tickets (AC-2)', () => {
  F4();
  const r = findings('repeats');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'REPEAT test-weak: 2 tickets (EZD-245, EZD-246), 2 findings');
});

test('EZD-245 F5 one ticket is no repeat (AC-2)', () => {
  rec('EZD-245', 1, 'code-reviewer', 'test-weak', 'a');
  rec('EZD-245', 2, 'code-reviewer', 'test-weak', 'a');
  const r = findings('repeats');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'NO REPEATS');
});

test('EZD-245 F6 cover marks the findings and clears the repeat (AC-2)', () => {
  F4();
  const c = findings('cover', 'test-weak', 'L-901');
  assert.equal(c.status, 0, c.stderr);
  assert.equal(c.stdout.trim(), 'COVERED test-weak by L-901: 2 finding(s)');
  assert.equal(findings('repeats').stdout.trim(), 'NO REPEATS');
  const objs = logLines().map((l) => JSON.parse(l));
  assert.equal(objs.length, 3);
  for (const o of objs) assert.equal(o.lesson, o.category === 'test-weak' ? 'L-901' : null);
});

test('EZD-245 F7 a new repeat after cover counts only uncovered findings (AC-2)', () => {
  F4();
  findings('cover', 'test-weak', 'L-901');
  rec('EZD-245', 3, 'security-reviewer', 'test-weak', 'd');
  rec('EZD-246', 2, 'code-reviewer', 'test-weak', 'e');
  rec('EZD-246', 2, 'code-reviewer', 'test-weak', 'f');
  assert.equal(findings('repeats').stdout.trim(), 'REPEAT test-weak: 2 tickets (EZD-245, EZD-246), 3 findings');
});

test('EZD-245 F8 cover refusals (AC-2)', () => {
  F4();
  const before = readFileSync(logPath());
  const a = findings('cover', 'test-weak', 'L-999');
  assert.equal(a.status, 1);
  assert.ok(a.stderr.includes('findings: L-999 is not a lesson in vault/lessons/planner.md'), a.stderr);
  assert.ok(readFileSync(logPath()).equals(before));
  rmSync(logPath());
  const b = findings('cover', 'docs', 'L-901');
  assert.equal(b.status, 1);
  assert.ok(b.stderr.includes('findings: no uncovered finding in category docs'), b.stderr);
});

test('EZD-245 F9 list prints uncovered findings of a category (AC-2)', () => {
  F4();
  const r = findings('list', 'test-weak');
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^EZD-245 r1 code-reviewer \d{4}-\d{2}-\d{2}: a$/);
  assert.equal(findings('list', 'calc').stdout.trim(), '(no uncovered findings in calc)');
});

test('EZD-245 F10 --check and every subcommand refuse a bad log line (AC-1)', () => {
  const base = { date: '2026-10-28', ticket: 'EZD-245', round: 1, reviewer: 'code-reviewer', category: 'test-weak', text: 'T12 passes on an empty body', lesson: null };
  writeFileSync(logPath(), [
    JSON.stringify(base),
    '{oops',
    JSON.stringify({ ...base, category: 'nonsense' }),
    JSON.stringify({ ...base, lesson: 'L-999' }),
  ].join('\n') + '\n');
  const c = next('--check');
  assert.equal(c.status, 1);
  for (const l of [
    '- vault/lessons/findings.jsonl line 2: not JSON',
    '- vault/lessons/findings.jsonl line 3: unknown category "nonsense"',
    '- vault/lessons/findings.jsonl line 4: lesson L-999 is not in vault/lessons/planner.md',
  ]) assert.ok(c.stdout.split('\n').includes(l), `${l}\n${c.stdout}`);
  const r = findings('repeats');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('findings: vault/lessons/findings.jsonl line 2: not JSON'), r.stderr);
});

test('EZD-245 F11 clean check: valid log and no log give no findings problem (AC-1)', () => {
  rec('EZD-245', 1, 'code-reviewer', 'test-weak', 'T12 passes on an empty body');
  const a = next('--check');
  assert.ok(!a.stdout.split('\n').some((l) => l.includes('findings.jsonl')), a.stdout);
  rmSync(logPath(), { force: true });
  const b = next('--check');
  assert.ok(!b.stdout.split('\n').some((l) => l.includes('findings.jsonl')), b.stdout);
  const r = findings('repeats');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'NO REPEATS');
});

test('EZD-245 F12 usage on no arguments, unknown subcommand, missing argument (AC-1)', () => {
  for (const args of [[], ['bogus'], ['list']]) {
    const r = findings(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.ok(r.stderr.startsWith('usage: findings.mjs record'), r.stderr);
  }
});

test('EZD-245 R1 plan-checker reads carry the plan areas lessons (AC-4)', () => {
  writeFileSync(planPath(), planWith('Tooling, process'));
  const r = next('--reads', 'EZD-245', 'plan-checker');
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n');
  assert.deepEqual(lines.slice(0, 4), ['Plan: vault/plans/EZD-245.md', 'Sections: header, 1, 3, 4, 6', 'Areas: tooling, process', 'Lessons:']);
  assert.ok(r.stdout.includes('## L-901'));
  assert.ok(r.stdout.includes('Plan check: fixture check L-901.'));
  assert.ok(!r.stdout.includes('L-902'));
  assert.ok(!r.stdout.includes('L-903'));
  for (const l of lines) assert.ok(!/^(Spec files:|Decisions:|Architecture)/.test(l), l);
  assert.ok(!r.stdout.includes('Areas with no lesson in any role file'));
});

test('EZD-245 R2 plan-checker reads refuse a bad plan (AC-4)', () => {
  const cases = [
    [() => writeFileSync(planPath(), '# EZD-245 · fixture\n\n- **Complexity:** low\n\n## 1. What to build\n'),
      'vault/plans/EZD-245.md has no Areas line in its header (- **Areas:** <area>, <area>)'],
    [() => writeFileSync(planPath(), planWith('tooling, Bad_Area')), 'vault/plans/EZD-245.md Areas line has an invalid area "bad_area"'],
    [() => rmSync(planPath(), { force: true }), 'vault/plans/EZD-245.md does not exist'],
  ];
  for (const [setup, msg] of cases) {
    setup();
    const r = next('--reads', 'EZD-245', 'plan-checker');
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.includes(msg), `${msg}\n${r.stderr}`);
  }
});

test('EZD-245 R3 an area with no lesson is named last (AC-4)', () => {
  writeFileSync(planPath(), planWith('tooling, zzz-none'));
  const r = next('--reads', 'EZD-245', 'plan-checker');
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  assert.equal(lines[lines.length - 1], 'Areas with no lesson in any role file: zzz-none');
});

test('EZD-245 R4 other roles read the same output as before (AC-4)', () => {
  const a = next('--reads', 'EZD-245', 'builder');
  assert.equal(a.status, 0, a.stderr);
  writeFileSync(planPath(), planWith('tooling, process'));
  const b = next('--reads', 'EZD-245', 'builder');
  assert.equal(b.stdout, a.stdout);
  assert.ok(!a.stdout.split('\n').some((l) => l.trim() === 'Lessons:'));
});

test('EZD-245 S1 build-ticket skill records findings, repeats and covers (AC-3)', () => {
  const t = real('.claude/skills/build-ticket/SKILL.md');
  const s5 = step(t, 5);
  assert.ok(s5.includes('findings.mjs record'), 'step 5 record');
  assert.ok(s5.includes('first 300 characters'), 'step 5 first 300 characters');
  const s9 = step(t, 9);
  assert.ok(s9.startsWith('9. **FAIL**'), s9.slice(0, 40));
  assert.ok(s9.includes('findings.mjs record'));
  assert.ok(s9.includes('first 300 characters'), 'step 9 first 300 characters');
  const s10 = step(t, 10);
  assert.ok(s10.includes('findings.mjs record'));
  assert.ok(s10.includes('gate-red'));
  assert.ok(s10.includes('first 300 characters'), 'step 10 first 300 characters');
  assert.ok(s10.includes('without recording it again'), 'step 10 without recording it again');
  const s11 = step(t, 11);
  for (const w of ['findings.mjs repeats', 'findings.mjs list', 'findings.mjs cover']) assert.ok(s11.includes(w), w);
});

test('EZD-245 S2 plan-checker dispatch names the reads command and sections (AC-4)', () => {
  const both = (text) => text.split('\n').some((l) => l.includes('--reads') && l.includes('plan-checker'));
  const ps = real('.claude/skills/plan-ticket/SKILL.md');
  const pl = real('.claude/agents/planner.md');
  const dp = real('.claude/skills/build-ticket/dispatch.md');
  for (const [n, t] of [['plan-ticket SKILL', ps], ['planner.md', pl], ['dispatch.md', dp]]) assert.ok(both(t), n);
  for (const [n, t] of [['plan-ticket SKILL', ps], ['planner.md', pl]]) {
    assert.ok(t.includes('Areas'), n);
    assert.ok(t.includes('--lessons planner'), n);
    assert.ok(t.includes('a new lower-case word only for an area no lesson has yet'), n);
  }
  const pc = real('.claude/agents/plan-checker.md');
  assert.ok(pc.includes('Plan check:'));
  assert.ok(pc.includes('Sections:'));
  const gap = '<step, section or L-n> · <what is undecided or lacking> · <the options you see>';
  assert.ok(pc.includes(gap), 'plan-checker.md D28 gap line');
  assert.ok(dp.includes(gap), 'dispatch.md D28 gap line');
  assert.ok(!pc.includes('<what the plan lacks>'));
  assert.ok(!pc.includes('<step or section> ·'));
});

test('EZD-245 S3 wrap and docs name the findings log and repeats (AC-2)', () => {
  assert.ok(step(real('.claude/skills/wrap/SKILL.md'), 2).includes('findings.mjs repeats'));
  for (const f of ['vault/PROCESS.md', 'vault/lessons/INDEX.md']) {
    const t = real(f);
    assert.ok(t.includes('findings.jsonl'), f);
    assert.ok(t.includes('findings.mjs repeats'), f);
  }
});

test('EZD-245 F13 record repairs a log whose last line has no final newline (AC-1)', async () => {
  const base = { date: '2026-10-28', ticket: 'EZD-245', round: 1, reviewer: 'code-reviewer', category: 'test-weak', text: 'first', lesson: null };
  writeFileSync(logPath(), JSON.stringify(base));
  rec('EZD-246', 2, 'code-reviewer', 'docs', 'second');
  const raw = readFileSync(logPath(), 'utf8');
  assert.ok(raw.endsWith('\n'));
  const lines = logLines();
  assert.equal(lines.length, 2, raw);
  assert.equal(JSON.parse(lines[0]).text, 'first');
  assert.equal(JSON.parse(lines[1]).text, 'second');
  const mod = await import(pathToFileURL(path.join(vault, 'tools/findings.mjs')).href);
  const r = mod.readFindings(vault);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.findings.map((f) => f.text), ['first', 'second']);
  assert.deepEqual(mod.findingProblems(vault), []);
});

test('EZD-245 F14 list refuses an unknown category (AC-2)', () => {
  F4();
  const before = readFileSync(logPath());
  const r = findings('list', 'test-wek');
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'findings: unknown category "test-wek" (run node vault/tools/findings.mjs categories)\n');
  assert.equal(r.stdout, '');
  assert.ok(readFileSync(logPath()).equals(before));
});

test('EZD-245 F15 categories refuses a bad log (AC-1)', () => {
  const base = { date: '2026-10-28', ticket: 'EZD-245', round: 1, reviewer: 'code-reviewer', category: 'test-weak', text: 'T12 passes on an empty body', lesson: null };
  writeFileSync(logPath(), [
    JSON.stringify(base),
    '{oops',
    JSON.stringify({ ...base, category: 'nonsense' }),
    JSON.stringify({ ...base, lesson: 'L-999' }),
  ].join('\n') + '\n');
  const before = readFileSync(logPath());
  const r = findings('categories');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('findings: vault/lessons/findings.jsonl line 2: not JSON'), r.stderr);
  assert.equal(r.stdout, '');
  assert.ok(readFileSync(logPath()).equals(before));
});
