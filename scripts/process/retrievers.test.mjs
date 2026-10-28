import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const agentsDir = path.join(ROOT, '.claude/agents');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// Contract section 3: line 1 is '---', frontmatter runs to the next '---' line.
function parse(rel) {
  const lines = read(rel).split('\n');
  assert.equal(lines[0], '---', `${rel}: line 1 must be ---`);
  const end = lines.indexOf('---', 1);
  assert.ok(end > 0, `${rel}: closing --- missing`);
  const entries = lines.slice(1, end).map((l) => {
    const i = l.indexOf(': ');
    return [l.slice(0, i), l.slice(i + 2).trim()];
  });
  const fm = Object.fromEntries(entries);
  return {
    keys: entries.map((e) => e[0]),
    fm,
    tools: (fm.tools ?? '').split(',').map((s) => s.trim()),
    body: lines.slice(end + 1).join('\n'),
  };
}

const D1 =
  'Answers one question about documents in this repository (spec, plans, logs, lessons, research) in 40 lines at most, with path:line pointers. Writes a research report to vault/research/pending/ when the brief says REPORT: yes. Dispatched only by the orchestrator, planner, code-reviewer, security-reviewer and phase-auditor.';
const D2 =
  'Answers one question about the outside world with WebSearch and WebFetch in 40 lines at most, with a URL for every statement. Writes a research report to vault/research/pending/ when the brief says REPORT: yes. Dispatched only by the orchestrator, planner, code-reviewer, security-reviewer and phase-auditor.';

const FM_BLOCK = '```\n---\ntitle: <the question in a few words>\nscope: <SCOPE from the brief>\nticket: <the ticket ID from FOR>\n---\n```\n';

const BODY_DIGEST =
  '\nYou answer one question about documents in this repository (spec files, plans, logs, lessons, research reports) for the agent that briefed you. The only file you may write is a research report under `vault/research/pending/`.\n\n' +
  'The brief has six lines: `QUESTION`, `FOR` (the asking agent and ticket), `SCOPE` (the paths you may read), `CAP` (max lines), `REPORT` (yes or no) and `KNOWN` (what the asker already has; do not repeat it).\n\n' +
  '1. Read only inside SCOPE. Find the lines with Grep and Glob first, then Read only the ranges you need. A Read of a file over 20,000 characters without a range is denied with the file\'s outline; read the ranges it points to. Never read `.env` files.\n' +
  '2. Answer the question only: no preamble, no account of what you read, no advice. At most CAP lines and never more than 40. Back every statement with a `path:line` pointer. If SCOPE does not answer the question, say so in one line and name what you searched.\n' +
  '3. With `REPORT: yes`, write your findings with their pointers to `vault/research/pending/retriever-digest-<slug>.md` before you answer, where `<slug>` is two to five lowercase words from the question joined by hyphens. The file starts with this front matter:\n' +
  FM_BLOCK +
  'Then make `REPORT: pending/retriever-digest-<slug>.md` the first line of your answer. With `REPORT: no`, write nothing.\n' +
  '4. You dispatch no agents.\n';

const BODY_WEB =
  '\nYou answer one question about the outside world (documentation, product pages, release notes, standards) for the agent that briefed you. The only file you may write is a research report under `vault/research/pending/`.\n\n' +
  'The brief has six lines: `QUESTION`, `FOR` (the asking agent and ticket), `SCOPE` (the sites you may use), `CAP` (max lines), `REPORT` (yes or no) and `KNOWN` (what the asker already has; do not repeat it).\n\n' +
  '1. Search and fetch only inside SCOPE. Never put a secret, token or key in a search or a URL.\n' +
  '2. Answer the question only: no preamble, no account of what you read, no advice. At most CAP lines and never more than 40. Back every statement with the URL of the page it comes from. If SCOPE does not answer the question, say so in one line and name what you searched.\n' +
  '3. With `REPORT: yes`, write your findings with their URLs to `vault/research/pending/retriever-web-<slug>.md` before you answer, where `<slug>` is two to five lowercase words from the question joined by hyphens. The file starts with this front matter:\n' +
  FM_BLOCK +
  'Then make `REPORT: pending/retriever-web-<slug>.md` the first line of your answer. With `REPORT: no`, write nothing.\n' +
  '4. You dispatch no agents.\n';

const R =
  'A lookup that would pull more than about 30,000 tokens into your context, or that needs sifting (a long log, the whole spec, a web search), goes to a retriever through the Agent tool: `retriever-digest` for documents in this repository, `retriever-web` for the outside world. You get the answer, never the pages. One grep or one small file is fine inline. Brief it in the format in `.claude/skills/build-ticket/dispatch.md`. Dispatch no other agent (PROCESS.md section 3 rule 15). Never read a research report\'s body; cite its ID (R-NNN).';

const B1 =
  '**Retriever brief** (PROCESS.md section 4): `QUESTION · FOR (agent and ticket) · SCOPE (paths or sites) · CAP (max lines) · REPORT yes|no · KNOWN (what the asker already has)`. Only the orchestrator, planner, code-reviewer, security-reviewer and phase-auditor dispatch `retriever-digest` (documents in this repository) or `retriever-web` (the outside world), with only these lines:';

const B2 = [
  '```',
  'QUESTION: <one question>',
  'FOR: <asking agent> · EZD-xxx',
  'SCOPE: <paths or sites>',
  'CAP: <max lines, 40 at most>',
  'REPORT: yes | no',
  'KNOWN: <what the asker already has>',
  '```',
];

const KEYS = ['name', 'description', 'tools', 'model', 'effort', 'maxTurns'];

function checkRetriever(file, name, desc, tools) {
  const p = parse(file);
  assert.deepEqual(p.keys, KEYS);
  assert.equal(p.fm.name, name);
  assert.equal(p.fm.description, desc);
  assert.deepEqual(p.tools, tools);
  assert.equal(p.fm.model, 'claude-haiku-5-5');
  assert.equal(p.fm.effort, 'low'); // process v2.4 (Josh 2026-10-22): Haiku helpers at low effort
  assert.equal(p.fm.maxTurns, '15');
}

test('EZD-000e T1 AC-EZD-000e-1: retriever-digest frontmatter', () => {
  checkRetriever('.claude/agents/retriever-digest.md', 'retriever-digest', D1, ['Read', 'Grep', 'Glob', 'Write']);
});

test('EZD-000e T2 AC-EZD-000e-1: retriever-web frontmatter', () => {
  checkRetriever('.claude/agents/retriever-web.md', 'retriever-web', D2, ['WebSearch', 'WebFetch', 'Write']);
});

test('EZD-000e T3 AC-EZD-000e-1: retriever bodies match the contract', () => {
  for (const [a, expected] of [['retriever-digest', BODY_DIGEST], ['retriever-web', BODY_WEB]]) {
    const { body } = parse(`.claude/agents/${a}.md`);
    assert.equal(body, expected, `${a} body`);
    assert.ok(body.includes('never more than 40'));
    assert.ok(body.includes(`vault/research/pending/${a}-<slug>.md`));
    assert.ok(body.includes(`REPORT: pending/${a}-<slug>.md`));
    assert.ok(body.includes('---\ntitle: '));
    assert.ok(body.includes('\nscope: ') && body.includes('\nticket: '));
    for (const t of ['TaskCreate', 'TaskUpdate', 'TaskList']) assert.ok(!body.includes(t));
  }
  assert.ok(parse('.claude/agents/retriever-digest.md').body.includes('path:line'));
});

const DISPATCHERS = {
  planner: { tools: ['Read', 'Grep', 'Glob', 'Write', 'Edit', 'Bash', 'Agent'], model: 'claude-opus-5-5', effort: 'high', maxTurns: '40' },
  'code-reviewer': { tools: ['Read', 'Grep', 'Glob', 'Bash', 'Agent'], model: 'claude-opus-5-5', effort: 'high', maxTurns: '30' },
  'security-reviewer': { tools: ['Read', 'Grep', 'Glob', 'Bash', 'Agent'], model: 'claude-opus-5-5', effort: 'high', maxTurns: '30' },
  'phase-auditor': { tools: ['Read', 'Grep', 'Glob', 'Bash', 'Agent'], model: 'claude-fable-5-1', effort: 'high', maxTurns: '40' },
};

test('EZD-000e T4 AC-EZD-000e-2: dispatchers hold Agent as last tool', () => {
  for (const [name, exp] of Object.entries(DISPATCHERS)) {
    const p = parse(`.claude/agents/${name}.md`);
    assert.deepEqual(p.tools, exp.tools, name);
    assert.equal(p.fm.name, name);
    assert.equal(p.fm.model, exp.model, name);
    assert.equal(p.fm.effort, exp.effort, name);
    assert.equal(p.fm.maxTurns, exp.maxTurns, name);
  }
});

test('EZD-000e T5 AC-EZD-000e-2: dispatchers carry the retriever rule', () => {
  for (const name of Object.keys(DISPATCHERS)) {
    const lines = parse(`.claude/agents/${name}.md`).body.split('\n');
    const idx = lines.map((l, i) => (l === '## Retrievers' ? i : -1)).filter((i) => i >= 0);
    assert.equal(idx.length, 1, `${name}: one ## Retrievers line`);
    const next = lines.slice(idx[0] + 1).find((l) => l.trim() !== '');
    assert.equal(next, R, name);
  }
});

test('EZD-000e T6 AC-EZD-000e-3: no other agent has an Agent tool', () => {
  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  const names = files.map((f) => f.replace(/\.md$/, ''));
  for (const must of ['builder', 'test-author', 'ui-verifier', 'calc-auditor', 'Explore', 'retriever-digest', 'retriever-web']) {
    assert.ok(names.includes(must), `${must}.md must exist`);
  }
  for (const n of names.filter((x) => !(x in DISPATCHERS))) {
    const p = parse(`.claude/agents/${n}.md`);
    assert.ok('tools' in p.fm, `${n}.md has no tools line`);
    for (const t of p.tools) {
      assert.ok(t !== 'Agent' && !t.startsWith('Agent(') && t !== 'Task', `${n}.md grants ${t}`);
    }
  }
});

test('EZD-000e T7 AC-EZD-000e-4: dispatch.md holds the retriever brief format', () => {
  const lines = read('.claude/skills/build-ticket/dispatch.md').split('\n');
  // Process v2.4 (Josh 2026-10-22) added the Gate failures and Advisor lines to the dispatch template; Q-0333 (c) (Josh 2026-10-25) folded the Advisor line into Findings to address, so the head was 21 lines; EZD-244 adds the Architecture line, so the head is 22 lines.
  const head = lines.slice(0, 22).join('\n') + '\n';
  assert.equal(crypto.createHash('sha256').update(head).digest('hex'), '5afca9d0a92301bffa634d67568f0655791a8547e27271a5490f593321142f7f', 'lines 1-22 changed');
  assert.deepEqual(lines.slice(22), ['', B1, '', ...B2, '']);
});
