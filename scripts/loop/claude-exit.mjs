// Builder deaths (2026-11-18): six builder runs ended with no result and no error text (EZD-215, 124, 312, 422, 305,
// 222), twice two at the same second, and each threw away a whole build. The loop now names every claude run's session
// (`--session-id`), so its transcript can be found, records how the process ended (exit code, signal), and resumes a
// run that died once, so its work goes on instead of starting over. Node built-ins only.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Claude Code keeps a session's transcript in ~/.claude/projects/<cwd with every non-alphanumeric character as "-">.
export function transcriptPath(cwd, sessionId, home = os.homedir()) {
  return path.join(home, '.claude', 'projects', String(cwd).replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`);
}

// A run died: it gave no result, was not stopped by our timeout, and did not hit a usage limit.
export function died(r) {
  return !r.res && !r.timedOut && !r.limited;
}

// A process that caught a signal and exited with 128 + its number (claude exits 143 on SIGTERM, audit 2026-11-23 W5)
// is named with that signal too, since Node then reports no signal.
export function signalOfCode(code) {
  if (!Number.isInteger(code) || code <= 128) return null;
  const n = code - 128;
  return Object.entries(os.constants.signals).find(([, v]) => v === n)?.[0] ?? null;
}

export function describeExit({ code, signal, secs }) {
  const caught = !signal && signalOfCode(code);
  return `exit code ${code ?? 'none'}${caught ? ` (${caught})` : ''}${signal ? `, signal ${signal}` : ''} after ${secs ?? '?'} s`;
}

// One line about the last real entry of a transcript: when, and what the session was doing.
export function lastEntry(text) {
  const lines = String(text || '').trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let o;
    try { o = JSON.parse(lines[i]); } catch { continue; }
    if (!o.timestamp || !['assistant', 'user', 'api-request', 'queue-operation'].includes(o.type)) continue;
    const c = o.message?.content;
    let what = o.type;
    if (Array.isArray(c)) {
      const tool = c.find((x) => x.type === 'tool_use');
      const result = c.find((x) => x.type === 'tool_result');
      const textPart = c.find((x) => x.type === 'text');
      if (tool) what = `tool ${tool.name}: ${JSON.stringify(tool.input ?? {}).slice(0, 120)}`;
      else if (result) what = `tool result: ${JSON.stringify(result.content ?? '').slice(0, 120)}`;
      else if (textPart) what = `said: ${String(textPart.text).slice(0, 120)}`;
    } else if (typeof c === 'string') what = `${o.type}: ${c.slice(0, 120)}`;
    else if (o.type === 'queue-operation') what = `queue ${o.operation ?? ''}: ${String(o.content ?? '').slice(0, 80)}`;
    return `${o.timestamp} ${what.replace(/\s+/g, ' ')}`;
  }
  return null;
}

export function readLastEntry(cwd, sessionId, home) {
  const p = transcriptPath(cwd, sessionId, home);
  if (!existsSync(p)) return null;
  try { return lastEntry(readFileSync(p, 'utf8')); } catch { return null; }
}

export const RESUME_PROMPT = 'Your previous run stopped unexpectedly: the process ended in the middle of the task. Check where you were (git status, git log, the files you were editing), then continue and finish the task exactly as first instructed, ending your answer the same way.';

// EZD-1988: the prompt goes to claude on stdin (`claude -p` reads it there when no prompt argument is given), never on
// its command line. A builder prompt names scripts/check.mjs, so with the prompt in argv every builder matched another
// lane's `pkill -f "scripts/check.mjs"` and was stopped mid-build (2026-11-24 14:28:29Z, 2026-11-25 01:04:38Z and
// 08:22:09Z). The command line holds only flags, the run's name and ids.
export function claudeArgs({ model, effort, name, resume, sessionId, readOnly }) {
  const args = ['-p', '--output-format', 'json', '--model', model, '--effort', effort, '--name', name];
  if (resume) args.push('--resume', resume);
  if (sessionId) args.push('--session-id', sessionId);
  if (readOnly) {
    args.push('--permission-mode', 'dontAsk',
      '--allowedTools', 'Read', 'Grep', 'Glob', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)',
      'Bash(node vault/tools/outline.mjs:*)', 'Bash(node vault/tools/next_ticket.mjs --reads:*)',
      '--disallowedTools', 'Edit', 'Write', 'NotebookEdit');
  } else {
    args.push('--permission-mode', 'bypassPermissions');
  }
  return args;
}

// Starts claude with the prompt written to its stdin. `spawnFn` and `cmd` are for tests.
export function startClaude({ prompt, cwd, env, cmd = 'claude', spawnFn = spawn, ...opts }) {
  const p = spawnFn(cmd, claudeArgs(opts), { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  p.stdin?.on('error', () => { /* claude ended before reading: its exit is reported instead */ });
  p.stdin?.end(String(prompt ?? ''));
  return p;
}
