// Failure lines in loop.log (EZD-1939, audit 2026-11-23 Area 2 triage and W5). A red check's `detail:` line names the
// failing stage and up to 5 failing tests (spec file:line and title), read from the check's check-failures.log; it is
// built from whole items, so it is never blank and never starts or ends mid-line. A CLAUDE DIED line also names the
// other lanes' events in the same second, so the same-second pattern the audit saw can be checked from the log.
// Pure functions; scripts/loop.mjs does the reading and the logging. Node built-ins only.

export const MAX_TESTS = 5;
export const MAX_LINE = 600;

// One line of text: whitespace collapsed. If it is longer than max, it ends at the last whole word that fits, then "…".
export function oneLine(text, max = MAX_LINE) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 0 ? cut.slice(0, sp) : cut).trimEnd()} …`;
}

const strip = (l) => String(l).replace(/\x1b\[[0-9;]*m/g, '').replace(/\r$/, '');
// A path as the repo knows it: the check's folder (or any worktree folder) taken off the front.
function relPath(p, root) {
  let f = String(p).replace(/^file:\/\//, '');
  if (root && f.startsWith(`${root.replace(/\/$/, '')}/`)) return f.slice(root.replace(/\/$/, '').length + 1);
  f = f.replace(/^.*\/\.claude\/worktrees\/[^/]+\//, '');
  return f;
}
const PW = /\[([\w-]+)\] › (\S+?):(\d+):\d+ › (.+?)\s*(?:─+\s*)?$/;
const pwTest = (m) => `${m[2]}:${m[3]} ${m[4].split(' › ').pop().trim()} [${m[1]}]`;

// The failing tests named in a check-failures.log (or any check output), in order, without repeats.
// Playwright: the list under "N failed" (never the "N flaky" list: those passed on retry), else the "1) [proj] › …"
// headers. Vitest: " FAIL  file > suite > test", with the line from the next "❯ file:L:C". node:test (TAP): "not ok N -
// title" with its "location: '…:L:C'"; a file or a group whose subtests failed is not a test.
export function failingTests(text, root = '') {
  const lines = String(text ?? '').split('\n').map(strip);
  const out = [];
  const add = (t) => { if (t && !out.includes(t)) out.push(t); };

  // Playwright summary block.
  let inFailed = false;
  for (const l of lines) {
    if (/^\s*\d+ failed\s*$/.test(l)) { inFailed = true; continue; }
    if (!inFailed) continue;
    const m = PW.exec(l);
    if (m) add(pwTest(m));
    else if (/^\s*\d+ (flaky|did not run|passed|skipped|interrupted)\b/.test(l) || !l.trim()) inFailed = false;
  }
  // Playwright numbered headers, when there was no summary block.
  if (!out.length) {
    for (const l of lines) {
      if (/Retry #\d/.test(l)) continue;
      const m = /^\s*\d+\) /.test(l) && PW.exec(l);
      if (m) add(pwTest(m));
    }
  }
  // Playwright progress lines ("  ✘  3 [desktop] › file:L:C › … (1.0m)"), when the run stopped before its summary.
  if (!out.length) {
    for (const l of lines) {
      if (!/^\s*✘\s+\d+ \[/.test(l)) continue;
      const m = PW.exec(l.replace(/\s*\((?:retry #\d+, )?[\d.]+m?s?\)\s*$/, '').replace(/\s*\(retry #\d+\)\s*$/, ''));
      if (m) add(pwTest(m));
    }
  }
  // Vitest. The same test can show twice (failure lines, last lines), once without its line: keep one, with the line.
  const vt = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*FAIL\s+(?:\|[^|]+\|\s+)?(\S+\.(?:test|spec)\.[cm]?[jt]sx?) > (.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const file = relPath(m[1], root);
    let at = '';
    for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
      if (/^\s*FAIL\s/.test(lines[j])) break;
      const loc = /❯\s+(\S+?):(\d+):\d+/.exec(lines[j]);
      if (loc && relPath(loc[1], root).endsWith(file)) { at = `:${loc[2]}`; break; }
    }
    const key = `${file} ${m[2].split(' > ').pop().trim()}`;
    if (!vt.has(key) || (at && !vt.get(key))) vt.set(key, at);
  }
  for (const [key, at] of vt) { const sp = key.indexOf(' '); add(`${key.slice(0, sp)}${at}${key.slice(sp)}`); }
  // node:test TAP.
  const files = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*not ok \d+ - (.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const title = m[1].replace(/\s+#\s+(TODO|SKIP)\b.*$/, '');
    let loc = null; let type = '';
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*(not ok \d|ok \d|# Subtest:)/.test(lines[j])) break;
      const lm = /^\s*location: '(.+):(\d+):\d+'/.exec(lines[j]);
      if (lm && !loc) loc = lm;
      const tm = /^\s*failureType: '(\w+)'/.exec(lines[j]);
      if (tm) type = tm[1];
    }
    if (type === 'subtestsFailed') continue;
    // A whole test file that failed on its own (a 300 s timeout) is named only when no single test is.
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(title)) { files.push(`${relPath(title, root)} (whole file${/timed out/.test(lines.slice(i, i + 8).join(' ')) ? ', timed out' : ''})`); continue; }
    add(loc ? `${relPath(loc[1], root)}:${loc[2]} ${title}` : title);
  }
  if (!out.length) files.forEach(add);
  return out;
}

// The stage a check failed at: the "step:" line of check-failures.log, else stdout's "CHECK FAIL at <step> after".
export function failedStage(failures, out) {
  const s = /^step: (.+?)\s*$/m.exec(String(failures ?? ''));
  if (s) return s[1];
  const c = [...String(out ?? '').matchAll(/CHECK FAIL at (.+?) after \d+s/g)].pop();
  return c ? c[1] : '';
}

// The last non-empty line that says something, from the failure lines first, then the last lines, then stdout.
function lastLine(failures, out) {
  const sect = (name) => {
    const m = new RegExp(`== ${name} ==\\n([\\s\\S]*?)(?:\\n== |$)`).exec(String(failures ?? ''));
    return m ? m[1] : '';
  };
  for (const t of [sect('failure lines'), sect('last lines'), String(out ?? '')]) {
    const ls = t.split('\n').map((l) => strip(l).trim()).filter((l) => l && !/^\$ /.test(l) && !/^[─⎯-]+$/.test(l));
    if (ls.length) return ls[ls.length - 1];
  }
  const ls = String(failures ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !/^(step|command|full log):/.test(l));
  return ls[ls.length - 1] || '';
}

// The one-line summary of a red check for loop.log. failures: the text of check-failures.log, or '' when it is missing
// or older than this check (then it belongs to an earlier run). out: the check's stdout.
export function failureSummary({ failures = '', out = '', timedOut = false, root = '', max = MAX_LINE } = {}) {
  const stage = failedStage(failures, out) || 'unknown';
  const head = timedOut ? `check stopped at its time limit (stage ${stage})` : `stage ${stage}`;
  const tests = failingTests(failures, root);
  if (!tests.length) {
    const last = lastLine(failures, out);
    const base = `${head}; no failing test named`;
    return last ? oneLine(`${base}; last line: ${last}`, max) : `${base}; see check.log`;
  }
  // Whole titles only: drop titles from the end until the line fits.
  for (let n = Math.min(tests.length, MAX_TESTS); n >= 1; n--) {
    const more = tests.length - n;
    const line = `${head}; ${tests.length} failing test${tests.length === 1 ? '' : 's'}: ${tests.slice(0, n).join('; ')}${more ? `; +${more} more` : ''}`;
    if (line.length <= max || n === 1) return line.length <= max ? line : oneLine(line, max);
  }
  return head;
}

// ---------- same-second events (W5) ----------
export const secondOf = (d = new Date()) => new Date(d).toISOString().replace(/\.\d+Z$/, 'Z');
const ticketOf = (msg) => /\b(EZD-[\w-]+?)(?=[\s:,;·()]|$)/.exec(String(msg))?.[1] || '';

// A short memory of what the loop logged and noted (check ends, claude run ends), so a death can name its neighbours.
export function createEvents(keep = 200) {
  const buf = [];
  return {
    note(msg, at = new Date(), ticket = ticketOf(msg)) {
      buf.push({ sec: secondOf(at), ticket, msg: String(msg).split('\n')[0] });
      if (buf.length > keep) buf.shift();
    },
    list: () => buf.slice(),
  };
}

// The events of other tickets (and of the loop itself) in the given second, as one clause for the log line.
export function sameSecondEvents(list, sec, ticket, max = 5) {
  const hits = list.filter((e) => e.sec === sec && (!ticket || e.ticket !== ticket)).map((e) => oneLine(e.msg, 160));
  const uniq = [...new Set(hits)];
  if (!uniq.length) return 'same-second events: none';
  return `same-second events: ${uniq.slice(0, max).join(' | ')}${uniq.length > max ? ` | +${uniq.length - max} more` : ''}`;
}

// Milliseconds until the given second is over (plus a little), so events that land just after the death count too.
export function msToSecondEnd(at, pad = 100) {
  const ms = new Date(at).getTime();
  return 1000 - (ms % 1000) + pad;
}
