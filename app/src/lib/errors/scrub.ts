// EZD-024 Step 3 (vault/plans/EZD-024.md): scrubbing for everything sent to Sentry or put in an owner email,
// shared by browser and server. Pure, no imports. It enforces the "never logged" list of docs/architecture.md
// Errors and logging: tokens, keys, secrets, request bodies, email addresses (and the 6-digit sign-in code,
// R26 R15).

// EZD-142 D2: the URL tail and email passes are linear-time scanners (dropUrlTails, replaceEmails) with the
// same output as the regexes `(https?:\/\/[^\s?#]*)[?#]\S*` and `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`,
// which backtracked from every start. The three patterns below are bounded per start, so they stay regexes.
const UUID = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const TOKEN_RUN = /[A-Za-z0-9_-]{24,}/g;
const SIX_DIGITS = /\b\d{6}\b/g;

// D5: exactly the code units JavaScript `\s` matches.
function isSpace(c: number): boolean {
  return (
    (c >= 0x09 && c <= 0x0d) ||
    c === 0x20 ||
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

const QUESTION = 63;
const HASH = 35;

// D3: keeps `http(s)://<no space, ?, #>` and drops the `?` or `#` tail up to the next space.
function dropUrlTails(s: string): string {
  const n = s.length;
  const parts: string[] = [];
  let i = 0;
  let copy = 0;
  for (;;) {
    const p = s.indexOf('http', i);
    if (p === -1) break;
    let j = p + 4;
    if (s.charCodeAt(j) === 115) j++; // 's'
    if (!s.startsWith('://', j)) {
      i = p + 1;
      continue;
    }
    let q = j + 3;
    while (q < n) {
      const c = s.charCodeAt(q);
      if (isSpace(c) || c === QUESTION || c === HASH) break;
      q++;
    }
    if (q < n && (s.charCodeAt(q) === QUESTION || s.charCodeAt(q) === HASH)) {
      let e = q;
      while (e < n && !isSpace(s.charCodeAt(e))) e++;
      parts.push(s.slice(copy, q));
      copy = e;
      i = e;
    } else {
      // Every start inside [p, q) stops at the same q and fails.
      i = q;
    }
  }
  parts.push(s.slice(copy));
  return parts.join('');
}

function isLetter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

// A-Z a-z 0-9 . -
function isDomain(c: number): boolean {
  return isLetter(c) || isDigit(c) || c === 46 || c === 45;
}

// A-Z a-z 0-9 . _ % + -
function isLocal(c: number): boolean {
  return isDomain(c) || c === 95 || c === 37 || c === 43;
}

// D4: replaces `<local>@<domain>.<2+ letters>` with `<email>`.
function replaceEmails(s: string): string {
  const n = s.length;
  const parts: string[] = [];
  let i = 0;
  let last = 0;
  let copy = 0;
  for (;;) {
    const a = s.indexOf('@', i);
    if (a === -1) break;
    let st = a;
    while (st > last && isLocal(s.charCodeAt(st - 1))) st--;
    if (st === a) {
      i = a + 1;
      continue;
    }
    let r = a + 1;
    while (r < n && isDomain(s.charCodeAt(r))) r++;
    let k = r - 1;
    while (
      k >= a + 2 &&
      !(s.charCodeAt(k) === 46 && isLetter(s.charCodeAt(k + 1)) && isLetter(s.charCodeAt(k + 2)))
    ) {
      k--;
    }
    if (k < a + 2) {
      i = a + 1;
      continue;
    }
    let e = k + 1;
    while (e < r && isLetter(s.charCodeAt(e))) e++;
    parts.push(s.slice(copy, st), '<email>');
    copy = e;
    last = e;
    i = e;
  }
  parts.push(s.slice(copy));
  return parts.join('');
}

export function scrubText(s: string): string {
  return replaceEmails(dropUrlTails(s))
    .replace(UUID, '<uuid>')
    .replace(TOKEN_RUN, (run) => (/[A-Za-z]/.test(run) && /\d/.test(run) ? '<token>' : run))
    .replace(SIX_DIGITS, '<code>');
}

// EZD-040: tags, contexts and stack frames.
const JOB_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function put(dst: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(dst, key, { value, enumerable: true, writable: true, configurable: true });
}

function scrubTags(tags: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (typeof value === 'string') {
      put(
        out,
        scrubText(key),
        key === 'ezd.job_id' && JOB_UUID.test(value) ? value : scrubText(value),
      );
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      put(out, scrubText(key), value);
    }
  }
  return out;
}

// Iterative deep copy (no recursion); an object met a second time becomes null.
function scrubContexts(contexts: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>([contexts]);
  const root: Record<string, unknown> = {};
  const stack: Array<{ src: object; dst: Record<string, unknown> | unknown[] }> = [
    { src: contexts, dst: root },
  ];
  while (stack.length > 0) {
    const { src, dst } = stack.pop()!;
    const entries: Array<[string, unknown]> = Array.isArray(src)
      ? src.map((v, i): [string, unknown] => [String(i), v])
      : Object.entries(src);
    for (const [key, value] of entries) {
      let copy: unknown;
      let keep = true;
      if (typeof value === 'string') copy = scrubText(value);
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        copy = value;
      } else if (typeof value === 'object') {
        if (seen.has(value)) copy = null;
        else {
          seen.add(value);
          const child: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
          stack.push({ src: value, dst: child });
          copy = child;
        }
      } else {
        copy = null;
        keep = false;
      }
      if (Array.isArray(dst)) dst.push(keep ? copy : null);
      else if (keep) put(dst, scrubText(key), copy);
    }
  }
  return root;
}

const FRAME_STRINGS = [
  'filename',
  'abs_path',
  'function',
  'raw_function',
  'module',
  'package',
  'context_line',
] as const;

function scrubFrame(frame: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of FRAME_STRINGS) {
    const v = frame[k];
    if (typeof v === 'string') out[k] = scrubText(v);
  }
  for (const k of ['pre_context', 'post_context'] as const) {
    const v = frame[k];
    if (Array.isArray(v)) {
      out[k] = v.filter((x): x is string => typeof x === 'string').map(scrubText);
    }
  }
  for (const k of ['lineno', 'colno'] as const) {
    if (typeof frame[k] === 'number') out[k] = frame[k];
  }
  if (typeof frame.in_app === 'boolean') out.in_app = frame.in_app;
  return out;
}

// EZD-142 D10: frames_omitted and every other stacktrace key are dropped.
function scrubFrames(stacktrace: unknown): { frames: Record<string, unknown>[] } | undefined {
  if (!isPlainObject(stacktrace) || !Array.isArray(stacktrace.frames)) return undefined;
  return { frames: stacktrace.frames.filter(isPlainObject).map(scrubFrame) };
}

// EZD-142 D10.
function scrubThread(t: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof t.id === 'number') out.id = t.id;
  else if (typeof t.id === 'string') out.id = scrubText(t.id);
  if (typeof t.name === 'string') out.name = scrubText(t.name);
  for (const k of ['main', 'crashed', 'current'] as const) {
    if (typeof t[k] === 'boolean') out[k] = t[k];
  }
  const stacktrace = scrubFrames(t.stacktrace);
  if (stacktrace) out.stacktrace = stacktrace;
  return out;
}

// EZD-142 D9.
function scrubExceptionValue(v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ['type', 'value', 'module'] as const) {
    const value = v[k];
    if (typeof value === 'string') out[k] = scrubText(value);
  }
  if (typeof v.thread_id === 'number') out.thread_id = v.thread_id;
  else if (typeof v.thread_id === 'string') out.thread_id = scrubText(v.thread_id);
  if (isPlainObject(v.mechanism)) out.mechanism = scrubContexts(v.mechanism);
  const stacktrace = scrubFrames(v.stacktrace);
  if (stacktrace) out.stacktrace = stacktrace;
  return out;
}

export type ScrubbableEvent = {
  message?: unknown;
  exception?: {
    values?: Array<{
      type?: unknown;
      value?: unknown;
      module?: unknown;
      thread_id?: unknown;
      mechanism?: unknown;
      stacktrace?: unknown;
    }>;
  };
  tags?: unknown;
  contexts?: unknown;
  request?: { url?: unknown; headers?: object };
  user?: { id?: unknown };
  extra?: unknown;
  breadcrumbs?: unknown;
  threads?: unknown;
  logentry?: unknown;
  fingerprint?: unknown;
};

export const EVENT_ID = /^[0-9a-f]{32}$/;
const LEVELS = new Set(['fatal', 'error', 'warning', 'log', 'info', 'debug']);
const TEXT_FIELDS = ['platform', 'logger', 'transaction', 'dist', 'type', 'message'] as const;
const CONFIG_FIELDS = ['release', 'environment'] as const;

// Returns a scrubbed copy holding only the allowlisted fields (EZD-142 D7-D11); the input is never changed.
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const ev = event as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (typeof ev.event_id === 'string' && EVENT_ID.test(ev.event_id)) out.event_id = ev.event_id;
  for (const k of ['timestamp', 'start_timestamp'] as const) {
    if (typeof ev[k] === 'number') out[k] = ev[k];
  }
  if (typeof ev.level === 'string' && LEVELS.has(ev.level)) out.level = ev.level;
  for (const k of TEXT_FIELDS) {
    const v = ev[k];
    if (typeof v === 'string') out[k] = scrubText(v);
  }
  for (const k of CONFIG_FIELDS) {
    if (typeof ev[k] === 'string') out[k] = ev[k];
  }
  for (const k of ['logentry', 'sdk'] as const) {
    const v = ev[k];
    if (isPlainObject(v)) out[k] = scrubContexts(v);
  }
  if (Array.isArray(ev.fingerprint)) {
    out.fingerprint = ev.fingerprint
      .filter((x): x is string => typeof x === 'string')
      .map(scrubText);
  }
  if (isPlainObject(ev.tags)) out.tags = scrubTags(ev.tags);
  if (isPlainObject(ev.contexts)) out.contexts = scrubContexts(ev.contexts);

  const exception = ev.exception;
  if (isPlainObject(exception) && Array.isArray(exception.values)) {
    out.exception = { values: exception.values.filter(isPlainObject).map(scrubExceptionValue) };
  }

  const threads = ev.threads;
  if (isPlainObject(threads) && Array.isArray(threads.values)) {
    out.threads = { values: threads.values.filter(isPlainObject).map(scrubThread) };
  }

  const request = ev.request;
  if (isPlainObject(request)) {
    const kept: Record<string, unknown> = {};
    if (typeof request.url === 'string') kept.url = scrubText(request.url);
    if (isPlainObject(request.headers)) {
      const headers: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (name.toLowerCase() === 'user-agent' && typeof value === 'string') {
          headers[name] = value;
        }
      }
      kept.headers = headers;
    }
    out.request = kept;
  }

  const user = ev.user;
  if (isPlainObject(user)) {
    if (typeof user.id === 'string') out.user = { id: scrubText(user.id) };
    else if (typeof user.id === 'number') out.user = { id: user.id };
  }

  return out as E;
}
