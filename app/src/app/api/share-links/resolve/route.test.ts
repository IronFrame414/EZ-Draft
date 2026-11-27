// EZD-2006 (AC-EZD-2006-2, AC-EZD-2006-3; security audit 2026-11-27 S3): the resolve route is behind the
// per-address throttle the error tunnel uses (tunnelAllows, error_tunnel_take: 60 per address key in a
// rolling hour, EZD-143). Past the limit it answers 429 and resolves nothing. Key(x) = throttleKey('ip',
// clientIp(new Headers({ 'x-forwarded-for': x }), {})), as in monitoring/route-throttle.test.ts. Holds the
// error-alert lock for the whole file, because the tunnel tests clear error_tunnel_throttle.
import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdErrorAlertLock } from '../../../../../test-harness/errors/alert-lock';
import { closeHarness, harnessSql } from '../../../../../test-harness/rls/fixtures';
import { clientIp, throttleKey } from '../../../../server/auth/throttle';
import { POST } from './route';

const address = () => `198.18.${randomInt(0, 256)}.${randomInt(1, 255)}`;
const keyOf = (x: string) => throttleKey('ip', clientIp(new Headers({ 'x-forwarded-for': x }), {}) as string);

async function prefill(key: string, n: number): Promise<void> {
  await harnessSql()`
    insert into public.error_tunnel_throttle (key_hash)
    select ${key} from generate_series(1, ${n})`;
}

async function slots(key: string): Promise<number> {
  const rows = await harnessSql()<{ n: number }[]>`
    select count(*)::int as n from public.error_tunnel_throttle where key_hash = ${key}`;
  return rows[0].n;
}

function resolve(x: string, body: unknown = { token: 'Z'.repeat(43), view: true }): Request {
  return new Request('http://localhost:3000/api/share-links/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': x },
    body: JSON.stringify(body),
  });
}

describe('EZD-2006 the client link resolve route is throttled per address', () => {
  let release: () => Promise<void>;
  const used: string[] = [];

  beforeAll(async () => {
    release = await holdErrorAlertLock();
  }, 60000);

  afterAll(async () => {
    if (used.length > 0) {
      await harnessSql()`delete from public.error_tunnel_throttle where key_hash in ${harnessSql()(used)}`;
    }
    await release();
    await closeHarness();
  });

  function fresh(): { x: string; key: string } {
    const x = address();
    const key = keyOf(x);
    used.push(key);
    return { x, key };
  }

  it('R1 each call takes one slot of the address and passes while slots are left', async () => {
    const { x, key } = fresh();
    await prefill(key, 59);
    const res = await POST(resolve(x));
    expect(res.status).toBe(404);
    expect(await slots(key)).toBe(60);
  });

  it('R2 past 60 calls in the hour the route answers 429 and takes no more slots', async () => {
    const { x, key } = fresh();
    await prefill(key, 60);
    const res = await POST(resolve(x));
    expect(res.status).toBe(429);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: { code: 'too_many_requests', message_key: 'error.too_many_requests' },
    });
    expect(await slots(key)).toBe(60);
  });

  it('R3 a malformed body counts too, and one address over the limit does not stop another', async () => {
    const a = fresh();
    await prefill(a.key, 60);
    expect((await POST(resolve(a.x, { nope: true }))).status).toBe(429);
    const b = fresh();
    expect((await POST(resolve(b.x, { nope: true }))).status).toBe(400);
    expect(await slots(b.key)).toBe(1);
  });

  it('R4 61 calls in a row from one address: 60 pass, the 61st is refused', async () => {
    const { x } = fresh();
    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) statuses.push((await POST(resolve(x))).status);
    expect(statuses.slice(0, 60).every((st) => st === 404)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});
