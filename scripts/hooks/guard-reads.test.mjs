// EZD-000c T5-T10: .claude/hooks/guard-reads.mjs, settings and CLAUDE.md (plan vault/plans/EZD-000c.md sections 3 and 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hook = path.join(root, '.claude/hooks/guard-reads.mjs');
const SENTENCE = 'Read the ranges you need with offset and limit.';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd-guard-reads-'));
// Text of exactly n characters: optional header lines, then lines of x, ending in a newline when n allows.
function make(name, n, header = '') {
  let s = header;
  while (s.length < n) s += 'x'.repeat(Math.min(99, n - s.length - 1) || 1) + '\n';
  s = s.slice(0, n);
  const f = path.join(tmp, name);
  fs.writeFileSync(f, s);
  assert.equal(s.length, n);
  return f;
}
const L = make('L.md', 25000, '# Big\n## Part A\n');
const S = make('S.md', 5000);
const B20000 = make('B20000.md', 20000);
const B20001 = make('B20001.md', 20001);
const P = path.join(tmp, 'P.png');
fs.writeFileSync(P, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(30000 - 8, 0x41)]));

function run(input, env = {}) {
  const e = { ...process.env, CLAUDE_PROJECT_DIR: root, ...env };
  if (!('GUARD_WHOLE_READ_CHARS' in env)) delete e.GUARD_WHOLE_READ_CHARS;
  if (!('GUARD_WHOLE_READ_EXEMPT' in env)) delete e.GUARD_WHOLE_READ_EXEMPT;
  return spawnSync('node', [hook], { input: typeof input === 'string' ? input : JSON.stringify(input), env: e, encoding: 'utf8' });
}
const read = (tool_input, env, agent_type) => run({ tool_name: 'Read', tool_input, cwd: tmp, agent_type }, env);
const bash = (command, env) => run({ tool_name: 'Bash', tool_input: { command }, cwd: tmp }, env);
function reason(r) {
  const j = JSON.parse(r.stdout);
  assert.equal(j.hookSpecificOutput.permissionDecision, 'deny');
  return j.hookSpecificOutput.permissionDecisionReason;
}
function assertPass(r, msg) {
  assert.equal(r.status, 0, msg);
  assert.equal(r.stdout, '', msg);
}
function assertDeniedL(r, msg) {
  assert.equal(r.status, 0, msg);
  const lines = reason(r).split('\n');
  assert.equal(lines[0], `Whole read blocked: ${L} has 25000 characters (limit 20000, GUARD_WHOLE_READ_CHARS).`, msg);
  assert.ok(lines.includes('1: # Big'), msg);
  assert.ok(lines.includes('2: ## Part A'), msg);
  assert.equal(lines[lines.length - 1], SENTENCE, msg);
}

test('EZD-000c T5 Read of a 25,000-character file with no range is denied with the outline, for any agent', () => {
  for (const agent of [undefined, 'builder']) assertDeniedL(read({ file_path: L }, {}, agent), String(agent));
});

test('EZD-000c T6 ranged Read, small file, 20,000-character file, binary file and missing file pass; 20,001 is denied', () => {
  for (const ti of [{ offset: 1, limit: 50 }, { limit: 50 }, { offset: 100 }]) assertPass(read({ file_path: L, ...ti }), JSON.stringify(ti));
  for (const f of [S, B20000, P, path.join(tmp, 'missing.md')]) assertPass(read({ file_path: f }), f);
  assert.equal(JSON.parse(read({ file_path: B20001 }).stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('EZD-000c T7 threshold from GUARD_WHOLE_READ_CHARS, exempt list, bad stdin', () => {
  const a = read({ file_path: S }, { GUARD_WHOLE_READ_CHARS: '4000' });
  assert.ok(reason(a).split('\n')[0].includes('(limit 4000,'));
  assertPass(read({ file_path: S }, { GUARD_WHOLE_READ_CHARS: 'abc' }));
  assert.ok(reason(read({ file_path: L }, { GUARD_WHOLE_READ_CHARS: 'abc' })).split('\n')[0].includes('(limit 20000,'));
  assertPass(read({ file_path: L }, { GUARD_WHOLE_READ_EXEMPT: L }));
  const proc = path.join(root, 'vault/PROCESS.md');
  assertPass(read({ file_path: proc }, { GUARD_WHOLE_READ_EXEMPT: 'vault/PROCESS.md' }));
  assert.equal(JSON.parse(read({ file_path: proc }).stdout).hookSpecificOutput.permissionDecision, 'deny');
  assertPass(run('not json'));
});

test('EZD-000c T8 cat, head, tail, sed -n and less on the large file without a range are denied', () => {
  for (const c of [`cat ${L}`, `head ${L}`, `tail ${L}`, `sed -n p ${L}`, `sed -n '1,$p' ${L}`, `less ${L}`, `cat ${S} ${L}`,
    `cat < ${L}`, `git status; cat ${L}`]) assertDeniedL(bash(c), c);
});

test('EZD-000c T9 grep, wc, ranged sed/head/tail, small file, pipes, redirects, echo and heredocs pass', () => {
  for (const c of [`grep -n Part ${L}`, `wc -c ${L}`, `sed -n '1,40p' ${L}`, `sed -n 1,40p ${L}`, `head -n 40 ${L}`,
    `head -40 ${L}`, `tail -n 40 ${L}`, `cat ${S}`, `cat ${L} | grep Part`, `cat ${L} > ${path.join(tmp, 'copy.md')}`,
    `echo "cat ${L}"`, `cat <<'EOF'\ncat ${L}\nEOF`]) assertPass(bash(c), c);
});

test('EZD-000c T10 settings register the hook and env; CLAUDE.md rule 10 has the sentence', () => {
  const s = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));
  const pre = s.hooks.PreToolUse;
  const mine = pre.filter((e) => e.hooks.some((h) => (h.args || []).some((a) => a.endsWith('/.claude/hooks/guard-reads.mjs'))));
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0], { matcher: 'Read|Bash', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-reads.mjs'] }] });
  const re = new RegExp('^(?:' + mine[0].matcher + ')$');
  assert.ok(re.test('Read') && re.test('Bash') && !re.test('Write') && !re.test('Edit'));
  assert.deepEqual(pre.filter((e) => e !== mine[0]), [
    { matcher: 'Edit|Write|NotebookEdit', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-paths.mjs'] }] },
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-bash.mjs'] }] },
    { matcher: 'Agent|Task', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-agents.mjs'] }] },
  ]);
  assert.equal(s.env.GUARD_WHOLE_READ_CHARS, '20000');
  assert.equal(s.env.GUARD_WHOLE_READ_EXEMPT, '');
  assert.equal(s.env.CLAUDE_CODE_SUBAGENT_MODEL, 'claude-sonnet-5-5');
  assert.equal(s.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, '3');
  assert.equal(s.env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, '2');
  assert.equal(s.env.CLAUDE_CODE_TOTAL_TOKENS_REMINDER, 'off');
  assert.equal(s.env.CLAUDE_CODE_GOAL_CHECKIN_MINUTES, '0');
  for (const k of ['todoFeatureEnabled', 'promptSuggestionEnabled', 'autoCompactEnabled']) assert.equal(s[k], false, k);
  const md = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').split('\n');
  if (md[md.length - 1] === '') md.pop();
  const r10 = md.filter((l) => l.startsWith('10. '));
  assert.equal(r10.length, 1);
  assert.ok(r10[0].startsWith('10. Read only what your dispatch names plus what this directory points you to.'));
  assert.ok(r10[0].endsWith('A file over 20,000 characters is read by range after `node vault/tools/outline.mjs <path>`.'));
  assert.ok(md.length <= 60);
});
