// EZD-033 Step 5 (vault/plans/EZD-033.md; Q-0094; Q-0104): the sign-in throttle's keys and its two database
// calls. Emails and addresses are turned into keyed hashes here and never leave this process otherwise: the
// key is HKDF-derived from the server-only gate secret under its own label (Q-0104 (vii)) and is never sent
// to the database, stored or logged. The calls go through the action's own createSessionClient(), so the
// supabase package is imported as a type only (EZD-007c T34).
import { createHmac, hkdfSync } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { serverGateSecret } from '../db/env';

export type ThrottleKind = 'password' | 'code' | 'email' | 'link';

export type ThrottleTake = {
  allowed: boolean;
  limitedBy: 'ip' | 'password' | 'code' | 'email' | null;
  attemptId: string | null;
  ipAttemptId: string | null;
};

function throttleSecret(): Buffer {
  return Buffer.from(
    hkdfSync('sha256', serverGateSecret(), Buffer.alloc(0), 'ezd-sign-in-throttle-v1', 32),
  );
}

// Lower-case hex HMAC-SHA256 of `<scope>:<value>`; an email is trimmed and lower-cased first.
export function throttleKey(scope: 'email' | 'ip', value: string): string {
  const normalized = scope === 'email' ? value.trim().toLowerCase() : value;
  return createHmac('sha256', throttleSecret()).update(`${scope}:${normalized}`).digest('hex');
}

type Address = { v4: number[] } | { v6: number[] };

function parseIPv4(text: string): number[] | null {
  if (!isIPv4(text)) return null;
  return text.split('.').map(Number);
}

function parseIPv6(text: string): number[] | null {
  if (!isIPv6(text) || text.includes('%')) return null;
  let body = text.toLowerCase();
  // An embedded IPv4 tail (::ffff:a.b.c.d) becomes its two hex groups.
  const lastColon = body.lastIndexOf(':');
  const tail = body.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    body = `${body.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const parse = (part: string) => (part === '' ? [] : part.split(':').map((g) => parseInt(g, 16)));
  let groups: number[];
  const gap = body.indexOf('::');
  if (gap >= 0) {
    const head = parse(body.slice(0, gap));
    const rest = parse(body.slice(gap + 2));
    groups = [...head, ...new Array(8 - head.length - rest.length).fill(0), ...rest];
  } else {
    groups = parse(body);
  }
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  return groups;
}

function parseAddress(text: string): Address | null {
  const v4 = parseIPv4(text);
  if (v4) return { v4 };
  const v6 = parseIPv6(text);
  if (!v6) return null;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is the IPv4 address (Q-0104 (v)).
  if (v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff) {
    return { v4: [v6[6] >> 8, v6[6] & 0xff, v6[7] >> 8, v6[7] & 0xff] };
  }
  return { v6 };
}

function isLoopback(a: Address): boolean {
  if ('v4' in a) return a.v4[0] === 127;
  return a.v6.slice(0, 7).every((g) => g === 0) && a.v6[7] === 1;
}

// Addresses that cannot be a real client on Vercel (Q-0104 (vi)).
function isNotAClient(a: Address): boolean {
  if (isLoopback(a)) return true;
  if ('v4' in a) {
    const [x, y] = a.v4;
    return (
      x === 10 ||
      (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && y === 168) ||
      (x === 100 && y >= 64 && y <= 127) ||
      (x === 169 && y === 254)
    );
  }
  const first = a.v6[0];
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

// RFC 5952 text of the /64 prefix: the first four groups, the rest zero, the longest zero run as "::".
function prefix64(groups: number[]): string {
  const g = [...groups.slice(0, 4), 0, 0, 0, 0];
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8;) {
    if (g[i] !== 0) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < 8 && g[j] === 0) j += 1;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = g.map((n) => n.toString(16));
  const text =
    bestLen >= 2
      ? `${hex.slice(0, bestStart).join(':')}::${hex.slice(bestStart + bestLen).join(':')}`
      : hex.join(':');
  return `${text}/64`;
}

// The client address the per-IP count uses (Q-0104 (v), (vi)). Reads only x-forwarded-for, the header
// Vercel overwrites, first entry. With VERCEL_ENV unset (local, CI): loopback or no header is null (no IP
// count), unparsable is 'unknown'. With VERCEL_ENV set it is never null: loopback, private, carrier-NAT,
// link-local, unparsable or missing are 'unknown'. IPv4 is the full address, IPv6 its /64.
export function clientIp(headers: Headers, env: Record<string, string | undefined>): string | null {
  const onVercel = Boolean(env.VERCEL_ENV);
  const header = headers.get('x-forwarded-for');
  if (header === null) return onVercel ? 'unknown' : null;
  const address = parseAddress(header.split(',')[0].trim());
  if (!address) return 'unknown';
  if (onVercel ? isNotAClient(address) : isLoopback(address)) return onVercel ? 'unknown' : null;
  return 'v4' in address ? address.v4.join('.') : prefix64(address.v6);
}

// Takes one slot. Throws on any database error (the action then fails closed, Step 3).
export async function throttleTake(
  client: SupabaseClient<Database>,
  kind: ThrottleKind,
  emailKey: string | null,
  ipKey: string | null,
): Promise<ThrottleTake> {
  const { data, error } = await client.rpc('sign_in_throttle_take', {
    p_kind: kind,
    p_email_key: emailKey as string,
    p_ip_key: ipKey as string,
  });
  const row = data?.[0];
  if (error || !row) throw new Error('auth_throttle_unavailable');
  return {
    allowed: row.allowed,
    limitedBy: (row.limited_by ?? null) as ThrottleTake['limitedBy'],
    attemptId: row.attempt_id ?? null,
    ipAttemptId: row.ip_attempt_id ?? null,
  };
}

// Marks the attempt's own rows as not failed (Q-0104 (i)). Throws on a database error.
export async function throttleSettle(
  client: SupabaseClient<Database>,
  attemptId: string | null,
  ipAttemptId: string | null,
): Promise<void> {
  if (attemptId === null && ipAttemptId === null) return;
  const { error } = await client.rpc('sign_in_throttle_settle', {
    p_attempt_id: attemptId as string,
    p_ip_attempt_id: ipAttemptId as string,
  });
  if (error) throw new Error('auth_throttle_unavailable');
}
