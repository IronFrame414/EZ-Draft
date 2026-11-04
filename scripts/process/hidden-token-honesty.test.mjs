// EZD-000b tests: hidden-token settings (Item 2) and honesty rules (Item 5) of vault/handoff/PA3-MECHANISMS.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const settings = () => JSON.parse(read('.claude/settings.json'));

const R14 = 'Report only what a tool result in this session backs. A claim about our code is verified by reading it in the same action.';
const R15 = "Another agent's report, a test runner's summary, a profiler, a metric or a past log is a claim until checked against the primary artifact (the file, the diff, the output).";
const R16 = 'A result that looks too good is a bug until proven otherwise. Prove a fix with a re-run. Never redefine a term, weaken a check or narrow a test to make a failure pass; report failures as failures, with the output.';

const lines = (s) => { const l = s.split('\n'); if (l[l.length - 1] === '') l.pop(); return l; };
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test('EZD-000b T1: settings turn off task list, prompt suggestions and auto compact', () => {
  const s = settings();
  for (const k of ['todoFeatureEnabled', 'promptSuggestionEnabled', 'autoCompactEnabled']) {
    assert.strictEqual(s[k], false, `${k} must be false`);
  }
});

test('EZD-000b T2: env turns off token reminder and goal check-ins', () => {
  const env = settings().env;
  assert.strictEqual(env.CLAUDE_CODE_TOTAL_TOKENS_REMINDER, 'off');
  assert.strictEqual(env.CLAUDE_CODE_GOAL_CHECKIN_MINUTES, '0');
});

test('EZD-000b T3: existing env values are unchanged', () => {
  const env = settings().env;
  assert.strictEqual(env.CLAUDE_CODE_SUBAGENT_MODEL, 'claude-sonnet-5-5');
  assert.strictEqual(env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, '3');
  assert.strictEqual(env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, '2');
});

test('EZD-000b T4: no skill or agent file names the task-list tools', () => {
  const hits = [...walk(path.join(root, '.claude/skills')), ...walk(path.join(root, '.claude/agents'))]
    .filter((f) => /TaskCreate|TaskUpdate|TaskList/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map((f) => path.relative(root, f)), []);
});

test('EZD-000b T5: CLAUDE.md rules are numbered 1 to 18, 14 to 16 are the honesty rules, 17 is the no-parked-issue rule (Q-0268) and 18 the long-term rule (Josh 2026-10-27)', () => {
  const l = lines(read('CLAUDE.md'));
  const start = l.indexOf('## Rules (every agent)');
  assert.ok(start >= 0, 'Rules heading missing');
  let end = l.findIndex((x, i) => i > start && x.startsWith('## '));
  if (end < 0) end = l.length;
  const numbered = l.slice(start + 1, end).filter((x) => /^\d+\. /.test(x));
  assert.deepEqual(numbered.map((x) => Number(x.match(/^(\d+)\. /)[1])), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.equal(numbered[13], `14. ${R14}`);
  assert.equal(numbered[14], `15. ${R15}`);
  assert.equal(numbered[15], `16. ${R16}`);
  assert.ok(numbered[16].startsWith('17. No known issue is parked (Q-0268).'));
  assert.ok(numbered[17].startsWith('18. Build for the long term (Josh 2026-10-27).'));
});

test('EZD-000b T6: CLAUDE.md is at most 100 lines (Josh 2026-10-27: may grow, stays short and concise)', () => {
  assert.ok(lines(read('CLAUDE.md')).length <= 100);
});

for (const name of ['code-reviewer', 'security-reviewer', 'phase-auditor']) {
  test(`EZD-000b T7: ${name} has the three honesty rules under ## Honesty`, () => {
    const l = lines(read(`.claude/agents/${name}.md`));
    const idx = l.map((x, i) => (x === '## Honesty' ? i : -1)).filter((i) => i >= 0);
    assert.equal(idx.length, 1, 'exactly one ## Honesty heading');
    let end = l.findIndex((x, i) => i > idx[0] && x.startsWith('## '));
    if (end < 0) end = l.length;
    const sec = l.slice(idx[0] + 1, end);
    const pos = [`14. ${R14}`, `15. ${R15}`, `16. ${R16}`].map((x) => sec.indexOf(x));
    assert.ok(pos.every((p) => p >= 0), 'all three rules present');
    assert.ok(pos[0] < pos[1] && pos[1] < pos[2], 'rules in order');
  });
}

test('EZD-000b T8: PROCESS.md budget section says the launcher gates on real usage percentages', () => {
  const l = lines(read('vault/PROCESS.md'));
  const h = l.indexOf('### The budget');
  assert.ok(h >= 0, '### The budget missing');
  const first = l.slice(h + 1).find((x) => x.trim() !== '');
  assert.ok(first.replace(/\*\*/g, '').startsWith("The launcher gates on the plan's real usage percentages"), first);
});
