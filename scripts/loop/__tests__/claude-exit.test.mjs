// Builder deaths (2026-11-18): a run that ends with no result is named, described and resumed once.
// The transcript lines are shaped like the EZD-222 and EZD-305 transcripts of 2026-11-18 18:21:56Z.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describeExit, died, lastEntry, readLastEntry, transcriptPath } from '../claude-exit.mjs';

test('the transcript lives under the cwd with every non-alphanumeric character as a dash', () => {
  assert.equal(
    transcriptPath('/Users/josh/Projects/ezdraft/.claude/worktrees/EZD-222', '04243675-ad72-47e3-9651-97680d57432e', '/Users/josh'),
    '/Users/josh/.claude/projects/-Users-josh-Projects-ezdraft--claude-worktrees-EZD-222/04243675-ad72-47e3-9651-97680d57432e.jsonl',
  );
});

test('only a run with no result, no timeout and no limit counts as died', () => {
  assert.equal(died({ res: null, timedOut: false, limited: false }), true);
  assert.equal(died({ res: { session_id: 'x' }, timedOut: false, limited: false }), false);
  assert.equal(died({ res: null, timedOut: true, limited: false }), false);
  assert.equal(died({ res: null, timedOut: false, limited: true }), false);
});

test('the exit is described with code, signal and seconds', () => {
  assert.equal(describeExit({ code: null, signal: 'SIGKILL', secs: 732 }), 'exit code none, signal SIGKILL after 732 s');
  assert.equal(describeExit({ code: 1, signal: null, secs: 47 }), 'exit code 1 after 47 s');
});

const tool = { timestamp: '2026-11-18T18:21:56.208Z', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'python3 - <<EOF' } }] } };
const bookkeeping = [{ type: 'last-prompt', lastPrompt: 'You are the builder' }, { type: 'cost-state', totalCostUSD: 4.65 }];

test('the last entry skips bookkeeping lines and names the tool in use', () => {
  const text = [tool, ...bookkeeping].map((o) => JSON.stringify(o)).join('\n') + '\n{half a line';
  assert.equal(lastEntry(text), '2026-11-18T18:21:56.208Z tool Bash: {"command":"python3 - <<EOF"}');
});

test('a queued task notification and plain text are named too; nothing usable gives null', () => {
  const q = { timestamp: '2026-11-18T18:21:56.013Z', type: 'queue-operation', operation: 'enqueue', content: '<task-notification>' };
  assert.equal(lastEntry(JSON.stringify(q)), '2026-11-18T18:21:56.013Z queue enqueue: <task-notification>');
  const said = { timestamp: '2026-11-18T18:21:41.648Z', type: 'assistant', message: { content: [{ type: 'text', text: 'Full check running.' }] } };
  assert.equal(lastEntry(JSON.stringify(said)), '2026-11-18T18:21:41.648Z said: Full check running.');
  assert.equal(lastEntry(bookkeeping.map((o) => JSON.stringify(o)).join('\n')), null);
  assert.equal(lastEntry(''), null);
});

test('readLastEntry finds the transcript of a session, or gives null when there is none', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'ce-'));
  try {
    const cwd = '/x/.claude/worktrees/EZD-1';
    const p = transcriptPath(cwd, 'abc', home);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(tool) + '\n');
    assert.match(readLastEntry(cwd, 'abc', home), /tool Bash/);
    assert.equal(readLastEntry(cwd, 'missing', home), null);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
