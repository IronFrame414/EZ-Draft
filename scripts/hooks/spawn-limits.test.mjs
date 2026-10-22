// Tests for EZD-000f: spawn limits (guard-agents.mjs), settings depth, retriever write limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const agentsHook = path.join(root, '.claude/hooks/guard-agents.mjs');
const pathsHook = path.join(root, '.claude/hooks/guard-paths.mjs');
const fakeRoot = '/ezd-guard-paths-test-root';

function run(stdin) {
  const r = spawnSync('node', [agentsHook], {
    input: stdin,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  const denied = r.stdout.includes('"deny"');
  let parsedDeny = false;
  if (denied) {
    try { parsedDeny = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision === 'deny'; } catch { parsedDeny = false; }
  }
  return { decision: denied ? 'deny' : 'allow', parsedDeny };
}

function spawnDecision(caller, target, tool = 'Agent') {
  const input = { tool_name: tool, tool_input: { description: 't', prompt: 't' }, cwd: root };
  if (caller !== undefined) input.agent_type = caller;
  if (target !== undefined) input.tool_input.subagent_type = target;
  return run(JSON.stringify(input));
}

function assertAllDeny(callers, targets) {
  for (const c of callers) for (const t of targets) {
    const r = spawnDecision(c, t);
    assert.equal(r.decision, 'deny', `${c} -> ${t}`);
    assert.equal(r.parsedDeny, true, `${c} -> ${t} json`);
  }
}

function writeDecision(agent, file) {
  const r = spawnSync('node', [pathsHook], {
    input: JSON.stringify({ agent_type: agent, tool_input: { file_path: fakeRoot + '/' + file }, cwd: fakeRoot }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: fakeRoot },
    encoding: 'utf8',
  });
  return r.stdout.includes('"deny"') ? 'deny' : 'allow';
}

const DISPATCHERS = ['planner', 'code-reviewer', 'security-reviewer', 'phase-auditor'];
const RETRIEVERS = ['retriever-digest', 'retriever-web'];

test('EZD-000f T1: builder, test-author, ui-verifier cannot spawn anything', () => {
  assertAllDeny(['builder', 'test-author', 'ui-verifier'], ['retriever-digest', 'retriever-web', 'builder']);
});

test('EZD-000f T2: dispatchers may spawn only a retriever', () => {
  assertAllDeny(DISPATCHERS, ['builder', 'test-author', 'planner', 'Explore', 'general-purpose', undefined]);
});

test('EZD-000f T3: retrievers spawn nothing', () => {
  assertAllDeny(RETRIEVERS, ['retriever-digest', 'retriever-web', 'builder']);
});

test('EZD-000f T4: allowed spawns, main session, non-spawn tools, unreadable input', () => {
  assert.equal(spawnDecision('planner', 'retriever-digest').decision, 'allow');
  for (const c of DISPATCHERS) for (const t of RETRIEVERS) assert.equal(spawnDecision(c, t).decision, 'allow', `${c} -> ${t}`);
  for (const t of ['builder', 'test-author', 'planner', 'code-reviewer', 'ui-verifier', 'Explore', 'retriever-web', 'general-purpose']) {
    assert.equal(spawnDecision(undefined, t).decision, 'allow', `main -> ${t}`);
  }
  assert.equal(spawnDecision('builder', 'builder', 'Read').decision, 'allow');
  assert.equal(run('not json').decision, 'allow');
});

test('EZD-000f T5: only the four named dispatchers (exact names) may spawn', () => {
  assertAllDeny(['calc-auditor', 'Explore', 'general-purpose', 'Planner'], ['retriever-digest']);
});

test('EZD-000f T6: retrievers write only under vault/research/pending/', () => {
  const wt = '.claude/worktrees/EZD-001/vault/research/pending/retriever-web-x.md';
  for (const a of RETRIEVERS) {
    for (const f of ['vault/research/pending/retriever-digest-spawn-limits.md', wt]) {
      assert.equal(writeDecision(a, f), 'allow', `${a} ${f}`);
    }
    for (const f of ['vault/research/INDEX.md', 'vault/research/R-001.md', 'vault/research/pending/../INDEX.md',
      'vault/plans/EZD-000f.md', 'CLAUDE.md', '.claude/settings.json', 'app/src/x.ts', '.env.local']) {
      assert.equal(writeDecision(a, f), 'deny', `${a} ${f}`);
    }
  }
});

test('EZD-000f T7: settings depth, concurrency and the registered hook', () => {
  const s = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));
  assert.equal(s.env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, '2');
  assert.equal(s.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, '3');
  const pre = s.hooks.PreToolUse;
  const mine = pre.filter((e) => e.hooks.some((h) => (h.args || []).some((a) => a.endsWith('/.claude/hooks/guard-agents.mjs'))));
  assert.equal(mine.length, 1);
  assert.equal(pre[pre.length - 1], mine[0]);
  const re = new RegExp('^(?:' + mine[0].matcher + ')$');
  assert.ok(re.test('Agent') && re.test('Task'));
  for (const n of ['Read', 'Bash', 'Write', 'Edit']) assert.ok(!re.test(n), n);
});

test('EZD-000f T8: retriever pending file is writable and adopt() adopts it (verification item 9, local half)', async () => {
  assert.equal(writeDecision('retriever-digest', 'vault/research/pending/retriever-digest-spawn-limits.md'), 'allow');
  const { adopt } = await import(pathToFileURL(path.join(root, 'vault/tools/research.mjs')).href);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd-000f-'));
  try {
    const dir = path.join(tmp, 'research');
    fs.mkdirSync(path.join(dir, 'pending'), { recursive: true });
    const header = '# Research reports\n\nOne line per report: `R-NNN | date | title | scope | ticket`, appended by `node vault/tools/research.mjs adopt`. Read only the reports your plan or dispatch names (PROCESS.md section 13).\n\n';
    fs.writeFileSync(path.join(dir, 'INDEX.md'), header);
    fs.writeFileSync(path.join(dir, 'pending/retriever-digest-spawn-limits.md'),
      '---\ntitle: spawn limits\nscope: .claude/hooks/\nticket: EZD-000f\n---\n\nBody.\n');
    const res = adopt(dir, '2026-10-19');
    assert.deepEqual(res, { ids: ['R-001'], skipped: [] });
    assert.deepEqual(fs.readdirSync(path.join(dir, 'pending')).filter((f) => f.endsWith('.md')), []);
    const index = fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf8');
    assert.equal(index, header + 'R-001 | 2026-10-19 | spawn limits | .claude/hooks/ | EZD-000f\n');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('token diet 2026-10-22: only the planner may spawn plan-checker, and plan-checker spawns nothing', () => {
  assert.equal(spawnDecision('planner', 'plan-checker').decision, 'allow');
  assertAllDeny(['code-reviewer', 'security-reviewer', 'phase-auditor', 'builder', 'test-author'], ['plan-checker']);
  assertAllDeny(['plan-checker'], ['retriever-digest', 'retriever-web', 'plan-checker', 'builder']);
});
