// EZD-033 Step 8 (vault/plans/EZD-033.md): admin SQL helpers for the sign-in throttle table
// (public.sign_in_throttle, Step 5). throttleRows counts the rows of one kind and key; insertThrottleRows
// adds n rows of one kind and key aged `ageSeconds` (default 0) with `failed` (default true), for the
// window tests. Keys are 64 lower-case hex characters, kinds are ip, password, code or email.
import { randomBytes } from 'node:crypto';
import { harnessSql } from './rls/fixtures';

export type ThrottleKind = 'ip' | 'password' | 'code' | 'email';

export const freshKey = () => randomBytes(32).toString('hex');

export async function throttleRows(kind: ThrottleKind, key: string): Promise<number> {
  const rows = await harnessSql()`
    select count(*)::int as n from public.sign_in_throttle
    where kind = ${kind} and key_hash = ${key}`;
  return rows[0].n as number;
}

export async function insertThrottleRows(
  kind: ThrottleKind,
  key: string,
  n: number,
  opts: { ageSeconds?: number; failed?: boolean } = {},
): Promise<void> {
  const ageSeconds = opts.ageSeconds ?? 0;
  const failed = opts.failed ?? true;
  await harnessSql()`
    insert into public.sign_in_throttle (kind, key_hash, failed, at)
    select ${kind}, ${key}, ${failed}, now() - make_interval(secs => ${ageSeconds})
    from generate_series(1, ${n})`;
}
