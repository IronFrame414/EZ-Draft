// node --test vault/tools/usage-by-agent.test.mjs
// Small synthetic transcripts only (no real ones), written to a temp folder per test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { priceUsage, readTranscript, loadRows, analyze, render, projectsDirFor, MissingRateError } from '../../vault/tools/usage-by-agent.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../vault/tools/usage-by-agent.mjs');

function usage(o = {}) {
  return {
    input_tokens: o.input ?? 0,
    cache_creation_input_tokens: (o.w5 ?? 0) + (o.w1 ?? 0),
    cache_read_input_tokens: o.read ?? 0,
    output_tokens: o.output ?? 0,
    cache_creation: { ephemeral_5m_input_tokens: o.w5 ?? 0, ephemeral_1h_input_tokens: o.w1 ?? 0 },
    service_tier: 'standard',
    speed: 'standard',
    inference_geo: 'global',
    server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
    fallback_credit: null,
  };
}
const assistant = (id, model, u, content = []) => ({ type: 'assistant', message: { id, model, role: 'assistant', usage: u, content } });
const toolResult = (id, text) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] } });

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'usage-by-agent-'));
}
function writeJsonl(file, lines) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('prices each token type at the Opus 5.5 rates, splitting 5-minute and 1-hour cache writes', () => {
  const { usd, tokens } = priceUsage('claude-opus-5-5', usage({ input: 1e6, w5: 1e6, w1: 1e6, read: 1e6, output: 1e6 }));
  assert.deepEqual(tokens, { input: 1e6, write5m: 1e6, write1h: 1e6, read: 1e6, output: 1e6 });
  close(usd, 4 + 5 + 8 + 0.2 + 20);
});

test('prices Sonnet 5.5 and Fable 5.1', () => {
  close(priceUsage('claude-sonnet-5-5', usage({ input: 1e6, output: 1e6, read: 1e6 })).usd, 2 + 10 + 0.2);
  close(priceUsage('claude-fable-5-1', usage({ w1: 1e6, read: 1e6 })).usd, 20 + 0.25);
});

test('Haiku 5.5 uses the long-prompt card above 100K prompt tokens', () => {
  close(priceUsage('claude-haiku-5-5', usage({ input: 1000, read: 99_000, output: 1e6 })).usd, (1000 * 0.1 + 99_000 * 0.01) / 1e6 + 0.5);
  close(priceUsage('claude-haiku-5-5', usage({ input: 1000, read: 100_000, output: 1e6 })).usd, (1000 * 0.5 + 100_000 * 0.05) / 1e6 + 2.5);
});

test('an unknown model, a non-standard speed or a server-tool request stops with MissingRateError', () => {
  assert.throws(() => priceUsage('claude-opus-9', usage({ input: 1 })), MissingRateError);
  assert.throws(() => priceUsage('claude-opus-5-5', { ...usage({ input: 1 }), speed: 'fast' }), MissingRateError);
  assert.throws(() => priceUsage('claude-opus-5-5', { ...usage(), server_tool_use: { web_search_requests: 2 } }), MissingRateError);
});

test('de-duplicates by message.id, keeping the last copy, and skips synthetic messages', () => {
  const dir = tmp();
  const f = path.join(dir, 's.jsonl');
  writeJsonl(f, [
    assistant('m1', 'claude-opus-5-5', usage({ input: 10, output: 5 })),
    assistant('m1', 'claude-opus-5-5', usage({ input: 10, output: 50 })),
    assistant('m2', 'claude-opus-5-5', usage({ read: 7, output: 1 })),
    assistant('m3', '<synthetic>', usage({ input: 99 })),
    '{"type":"assistant","message":{', // partly written last line
  ]);
  const t = readTranscript(f);
  assert.equal(t.messages.length, 2);
  assert.equal(t.messages.find((m) => m.usage.input_tokens === 10).usage.output_tokens, 50);
});

test('counts plan characters returned to Read and Bash, not other files', () => {
  const dir = tmp();
  const f = path.join(dir, 's.jsonl');
  writeJsonl(f, [
    assistant('m1', 'claude-opus-5-5', usage(), [
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/repo/vault/plans/EZD-001.md' } },
      { type: 'tool_use', id: 't2', name: 'Bash', input: { command: "sed -n '1,40p' vault/plans/EZD-002.md" } },
      { type: 'tool_use', id: 't3', name: 'Read', input: { file_path: '/repo/vault/plans/TEMPLATE.txt' } },
      { type: 'tool_use', id: 't4', name: 'Grep', input: { pattern: 'x', path: 'vault/plans/EZD-001.md' } },
    ]),
    toolResult('t1', 'a'.repeat(100)),
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'b'.repeat(30) }] }] } },
    toolResult('t3', 'c'.repeat(1000)),
    toolResult('t4', 'd'.repeat(1000)),
  ]);
  const t = readTranscript(f);
  assert.equal(t.planChars, 130);
  assert.equal(t.planReads, 2);
});

test('loadRows filters by --since (inclusive), --until (exclusive) and --rev (rows without process_rev skipped)', () => {
  const dir = tmp();
  const log = path.join(dir, 'log.jsonl');
  writeJsonl(log, [
    { ts: '2026-10-19T05:59:59Z', unit: 'plan', ticket: 'A', session_id: 'a' },
    { ts: '2026-10-19T06:00:00Z', unit: 'plan', ticket: 'B', session_id: 'b', process_rev: 'abc1234' },
    { ts: '2026-10-20T05:00:00Z', unit: 'build', ticket: 'C', session_id: 'c' },
    { ts: '2026-10-20T06:00:00Z', unit: 'build', ticket: 'D', session_id: 'd', process_rev: 'abc1234' },
    { ts: '2026-10-20T07:00:00Z', unit: 'build', ticket: 'E' },
  ]);
  const ids = (o) => loadRows(log, o).map((r) => r.ticket);
  assert.deepEqual(ids({ since: '2026-10-19T06:00:00Z', until: '2026-10-20T06:00:00Z' }), ['B', 'C']);
  assert.deepEqual(ids({ rev: 'abc' }), ['B', 'D']);
  assert.deepEqual(ids({}), ['A', 'B', 'C', 'D']);
});

function fixtureProject() {
  const dir = tmp();
  const proj = path.join(dir, 'projects');
  // build run: orchestrator on Opus, a builder sub-agent on Sonnet, a planner sub-agent with no meta file.
  writeJsonl(path.join(proj, 's1.jsonl'), [
    assistant('o1', 'claude-opus-5-5', usage({ input: 1e6 }), [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: 'vault/plans/EZD-001.md' } }]),
    toolResult('r1', 'x'.repeat(40)),
  ]);
  writeJsonl(path.join(proj, 's1/subagents/agent-a1.jsonl'), [assistant('b1', 'claude-sonnet-5-5', usage({ output: 1e6 }))]);
  fs.writeFileSync(path.join(proj, 's1/subagents/agent-a1.meta.json'), JSON.stringify({ agentType: 'builder', model: 'sonnet' }));
  writeJsonl(path.join(proj, 's1/subagents/agent-a2.jsonl'), [assistant('p1', 'claude-opus-5-5', usage({ output: 1e5 }))]);
  // plan run: orchestrator only. The same message id as the build run is counted again: de-duplication is per file.
  writeJsonl(path.join(proj, 's2.jsonl'), [assistant('o1', 'claude-opus-5-5', usage({ read: 1e6 }))]);
  const log = path.join(dir, 'log.jsonl');
  writeJsonl(log, [
    { ts: '2026-10-19T07:00:00Z', unit: 'build', ticket: 'EZD-001', session_id: 's1', est_usd: 1 },
    { ts: '2026-10-19T08:00:00Z', unit: 'plan', ticket: 'EZD-001', session_id: 's2', est_usd: 2 },
    { ts: '2026-10-19T09:00:00Z', unit: 'plan', ticket: 'EZD-002', session_id: 'gone', est_usd: 3 },
  ]);
  return { proj, log };
}

test('analyze sums $ by unit x role x model, per ticket, and plan characters per role', () => {
  const { proj, log } = fixtureProject();
  const a = analyze(loadRows(log), proj);
  const cell = (u, r, m) => a.cells.find((c) => c.unit === u && c.role === r && c.model === m);
  close(cell('build', 'orchestrator', 'claude-opus-5-5').usd, 4);
  close(cell('build', 'builder', 'claude-sonnet-5-5').usd, 10);
  close(cell('build', 'unknown', 'claude-opus-5-5').usd, 2);
  close(cell('plan', 'orchestrator', 'claude-opus-5-5').usd, 0.2);
  const t1 = a.tickets.find((t) => t.ticket === 'EZD-001');
  close(t1.usd, 16.2);
  close(t1.byUnit.build, 16);
  assert.equal(t1.runs, 2);
  assert.deepEqual(a.missing, ['gone']);
  assert.equal(a.plan.find((p) => p.unit === 'build' && p.role === 'orchestrator').chars, 40);
  close(a.estUsd, 6);
  const md = render(a);
  assert.match(md, /\| build \| builder \| claude-sonnet-5-5 \| 1 \|/);
  assert.match(md, /Total: \*\*\$16\.20\*\*/);
  assert.match(md, /\| EZD-001 \| 2 \| \$16\.00 \| \$0\.20 \| \$16\.20 \|/);
  assert.match(md, /Missing transcripts: 1/);
});

test('the CLI writes the report with --out and exits 2 naming a missing rate', () => {
  const { proj, log } = fixtureProject();
  const out = path.join(path.dirname(log), 'r.md');
  execFileSync('node', [SCRIPT, '--log', log, '--projects', proj, '--since', '2026-10-19T07:30:00Z', '--out', out, '--title', 'T']);
  const md = fs.readFileSync(out, 'utf8');
  assert.match(md, /^# T/);
  assert.match(md, /Log rows since 2026-10-19T07:30:00Z\./);
  assert.match(md, /Total: \*\*\$0\.20\*\*/);

  writeJsonl(path.join(proj, 's2.jsonl'), [assistant('o9', 'claude-opus-9', usage({ input: 1 }))]);
  const r = spawnSync('node', [SCRIPT, '--log', log, '--projects', proj], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no rate for model "claude-opus-9"/);
});

test('a worktree maps to the main checkout\'s project folder', () => {
  assert.equal(projectsDirFor('/Users/x/Projects/ezdraft/.claude/worktrees/brave-1'), path.join(os.homedir(), '.claude/projects/-Users-x-Projects-ezdraft'));
  assert.equal(projectsDirFor('/Users/x/Projects/ezdraft'), path.join(os.homedir(), '.claude/projects/-Users-x-Projects-ezdraft'));
});
