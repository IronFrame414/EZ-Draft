// EZD-024 Step 3 (vault/plans/EZD-024.md): scrubbing for everything sent to Sentry or put in an owner email,
// shared by browser and server. Pure, no imports. It enforces the "never logged" list of docs/architecture.md
// Errors and logging: tokens, keys, secrets, request bodies, email addresses (and the 6-digit sign-in code,
// R26 R15).

const URL_TAIL = /(https?:\/\/[^\s?#]*)[?#]\S*/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UUID = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const TOKEN_RUN = /[A-Za-z0-9_-]{24,}/g;
const SIX_DIGITS = /\b\d{6}\b/g;

export function scrubText(s: string): string {
  return s
    .replace(URL_TAIL, '$1')
    .replace(EMAIL, '<email>')
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

function scrubStacktrace(value: Record<string, unknown>): Record<string, unknown> {
  const { stacktrace, ...rest } = value;
  const frames = isPlainObject(stacktrace) ? stacktrace.frames : undefined;
  if (!Array.isArray(frames)) return rest;
  return { ...rest, stacktrace: { frames: frames.filter(isPlainObject).map(scrubFrame) } };
}

export type ScrubbableEvent = {
  message?: unknown;
  exception?: { values?: Array<{ value?: unknown; stacktrace?: unknown }> };
  tags?: unknown;
  contexts?: unknown;
  request?: { url?: unknown; headers?: object };
  user?: { id?: unknown };
  extra?: unknown;
  breadcrumbs?: unknown;
};

// Returns a scrubbed copy; the input is never changed.
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const out = { ...event } as E;
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => {
        if (!isPlainObject(v)) return v;
        let next: Record<string, unknown> = v;
        if (typeof v.value === 'string') next = { ...next, value: scrubText(v.value) };
        if ('stacktrace' in v) next = scrubStacktrace(next);
        return next as typeof v;
      }),
    };
  }
  if (typeof out.message === 'string') out.message = scrubText(out.message);
  if (out.request) {
    const kept: { url?: unknown; headers?: Record<string, unknown> } = {};
    if (typeof out.request.url === 'string') kept.url = scrubText(out.request.url);
    else if (out.request.url !== undefined) kept.url = out.request.url;
    if (out.request.headers) {
      const headers: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(out.request.headers)) {
        if (name.toLowerCase() === 'user-agent') headers[name] = value;
      }
      kept.headers = headers;
    }
    out.request = kept as E['request'];
  }
  if (out.user) {
    if (out.user.id !== undefined) out.user = { id: out.user.id } as E['user'];
    else delete out.user;
  }
  if ('tags' in out) {
    if (isPlainObject(out.tags)) out.tags = scrubTags(out.tags);
    else delete out.tags;
  }
  if ('contexts' in out) {
    if (isPlainObject(out.contexts)) out.contexts = scrubContexts(out.contexts);
    else delete out.contexts;
  }
  delete out.extra;
  delete out.breadcrumbs;
  return out;
}
