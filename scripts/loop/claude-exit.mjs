// Builder deaths (2026-11-18): six builder runs ended with no result and no error text (EZD-215, 124, 312, 422, 305,
// 222), twice two at the same second, and each threw away a whole build. The loop now names every claude run's session
// (`--session-id`), so its transcript can be found, records how the process ended (exit code, signal), and resumes a
// run that died once, so its work goes on instead of starting over. Node built-ins only.
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

export function describeExit({ code, signal, secs }) {
  return `exit code ${code ?? 'none'}${signal ? `, signal ${signal}` : ''} after ${secs ?? '?'} s`;
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
