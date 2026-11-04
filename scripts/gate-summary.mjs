// Failure summary of one gate step (scripts/gate.mjs; PROCESS v2.4 Change 7): the failing test lines and the first error after
// each, for the console and gate-failures.log. Pure functions, no I/O (EZD-155; Q-0268 sweep item 24).
export const FAILING_MAX = 12;
export const ERROR_WINDOW = 30;
export const TAIL_LINES = 8;
// Vitest, Playwright and mocha-style markers, plus node:test TAP `not ok N` (a `# TODO` or `# SKIP` result is not a failure).
// A passing TAP result `ok N` (nested ones indented) is never failing, even when its title holds FAIL or a cross mark (Q-0313).
export function isFailing(line) {
  if (/^\s*ok \d+\b/.test(line)) return false;
  if (/(^|\s)(FAIL|✗|×|✖)\s/.test(line) || /^\s+\d+\)\s/.test(line)) return true;
  return /(^|\s)not ok \d+\b/.test(line) && !/#\s*(todo|skip)\b/i.test(line);
}
// A line naming an error. Test result lines (`ok N`, `not ok N`) and `# Subtest:` headers are titles, never errors.
export function isError(line) {
  if (!/error/i.test(line) || /0 errors?/i.test(line) || /^\s*>/.test(line)) return false;
  return !/(^|\s)(not )?ok \d+\b/.test(line) && !/(^|\s)# Subtest:/.test(line);
}
// The error line at index i, trimmed; a YAML block scalar (`error: |-`) is joined with its first non-blank line.
function errorText(lines, i) {
  const t = lines[i].trim();
  if (!/:\s*[|>][-+]?$/.test(t)) return t;
  const next = lines.slice(i + 1).find((l) => l.trim());
  return next ? `${t.replace(/\s*[|>][-+]?$/, '')} ${next.trim()}` : t;
}
export function summarizeStep(label, out) {
  const lines = out.split('\n');
  const failingAt = [];
  lines.forEach((l, i) => { if (isFailing(l)) failingAt.push(i); });
  const errorAfter = (at) => {
    for (let i = at + 1; i <= at + ERROR_WINDOW && i < lines.length; i++) if (isError(lines[i])) return errorText(lines, i);
    return null;
  };
  const anyError = () => { const i = lines.findIndex(isError); return i < 0 ? null : errorText(lines, i); };
  const firstError = failingAt.length ? (failingAt.map(errorAfter).find((e) => e !== null) ?? null) : anyError();
  const failing = failingAt.slice(0, FAILING_MAX).map((i) => lines[i]);
  const tail = lines.filter(Boolean).slice(-TAIL_LINES).join('\n');
  const consoleLines = [...failing];
  if (firstError) consoleLines.push(`first error: ${firstError}`);
  if (!failing.length && !firstError) consoleLines.push(tail);
  const entries = [`=== ${label} ===`];
  for (const at of failingAt) { const err = errorAfter(at); entries.push(lines[at].trim(), ...(err ? [`  ${err}`] : [])); }
  if (!failingAt.length) entries.push(firstError ? `first error: ${firstError}` : tail);
  return { failing, firstError, consoleLines, entries };
}
