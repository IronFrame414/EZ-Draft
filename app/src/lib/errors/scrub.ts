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

export type ScrubbableEvent = {
  message?: unknown;
  exception?: { values?: Array<{ value?: unknown }> };
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
      values: out.exception.values.map((v) =>
        typeof v.value === 'string' ? { ...v, value: scrubText(v.value) } : v,
      ),
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
  delete out.extra;
  delete out.breadcrumbs;
  return out;
}
