// EZD-024 Step 3 (vault/plans/EZD-024.md): error fingerprints. Web Crypto only, so it runs in the Node and
// edge runtimes. No stack frames: bundled file names change at every deploy (planner's choice).
import { scrubText } from '../../lib/errors/scrub';

export type ErrorSource = 'browser' | 'function' | 'worker' | 'job';

const MAX = 300;

export function normalizeMessage(s: string): string {
  return scrubText(s)
    .replace(/\b[0-9a-f]{8,}\b/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX);
}

const UUID_SEGMENT =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function browserPath(where: string): string {
  let path = where;
  if (/^https?:\/\//i.test(where)) {
    try {
      path = new URL(where).pathname;
    } catch {
      path = where;
    }
  }
  path = path.split(/[?#]/)[0];
  return path
    .split('/')
    .map((segment) =>
      UUID_SEGMENT.test(segment) ||
      /^\d+$/.test(segment) ||
      (segment.length >= 16 && /\d/.test(segment))
        ? '<id>'
        : segment,
    )
    .join('/');
}

export function normalizeLocation(source: ErrorSource, where: string): string {
  if (source === 'browser') return browserPath(where);
  if (source === 'worker') return 'worker';
  return where;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function errorFingerprint(input: {
  source: ErrorSource;
  type: string;
  message: string;
  location: string;
}): Promise<string> {
  return sha256Hex(
    `${input.source}\n${input.type}\n${normalizeMessage(input.message)}\n${input.location}`,
  );
}

export function errorType(error: unknown): string {
  return error instanceof Error ? error.name : 'NonError';
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function errorTitle(type: string, message: string): string {
  return `${type}: ${scrubText(message)}`.slice(0, MAX);
}
