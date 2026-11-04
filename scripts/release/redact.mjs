// EZD-023c Step 3 (vault/plans/EZD-023c.md): pure redaction helpers. EZD-025 imports both.

/**
 * Replaces the password of every `<scheme>://<user>:<password>@` with `***`. The password runs to the last `@`
 * of the same whitespace-free run, so a bare `@` inside it does not leak its tail (EZD-025 Step 4a; Q-0257 (a)).
 */
export function redactUrl(text) {
  return String(text).replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:/@]*:)[^\s]*@/g, '$1***@');
}

// EZD-152 Step 2 (vault/plans/EZD-152.md; Q-0288 (a)): psql quotes the failing row under `DETAIL:`, `CONTEXT:`,
// `QUERY:` and `LINE n:`, and the offending value in an `ERROR:` line. English labels, upper case, as psql writes them.
// A row block runs to the end of the output: a continuation line is client text and can start with any label.
const ROW_START = /^\s*(?:psql:\S*:\d+:\s+)?(?:DETAIL|CONTEXT|QUERY|LINE \d+):/;
const ERROR_LINE = /^(\s*(?:psql:\S*:\d+:\s+)?ERROR:\s+)([\s\S]*)$/;

/**
 * Replaces the quoted value after the first `: ` of an `ERROR:` line with `"<value>"`. Returns the line and whether
 * the quote did not close on it (the value runs on into the following lines).
 */
function replaceErrorValue(line) {
  const m = ERROR_LINE.exec(line);
  if (m === null) return { line, open: false };
  const msg = m[2];
  const i = msg.indexOf(': ');
  if (i === -1) return { line, open: false };
  const tail = msg.slice(i + 2);
  const q = tail.indexOf('"');
  if (q === -1) return { line, open: false };
  const z = tail.lastIndexOf('"');
  const head = `${m[1]}${msg.slice(0, i + 2)}${tail.slice(0, q)}"<value>"`;
  if (z > q) return { line: `${head}${tail.slice(z + 1)}`, open: false };
  return { line: head, open: true };
}

/**
 * New list without the row blocks psql prints: the first `DETAIL:`, `CONTEXT:`, `QUERY:` or `LINE n:` line and every
 * line after it, and the lines after an `ERROR:` line whose quoted value does not close. The quoted value of each
 * kept `ERROR:` line is replaced by `"<value>"`. Pure.
 */
export function dropRowLines(lines) {
  const kept = [];
  let dropping = false;
  for (const line of lines) {
    if (dropping) continue;
    if (ROW_START.test(line)) {
      dropping = true;
      continue;
    }
    const r = replaceErrorValue(line);
    kept.push(r.line);
    if (r.open) dropping = true;
  }
  return kept;
}

/** Lines without psql row fields, redacted, minus any holding a masked value, at most the last 20. */
export function safeLines(lines, maskedValues) {
  const masked = (maskedValues ?? []).filter((v) => typeof v === 'string' && v !== '');
  return dropRowLines(lines)
    .map((l) => redactUrl(l))
    .filter((l) => !masked.some((v) => l.includes(v)))
    .slice(-20);
}
