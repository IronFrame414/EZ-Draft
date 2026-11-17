// EZD-126 R3 (AC-EZD-126-5): fetchPeople asks the people route once, no-store, and accepts only a 200 whose body
// is `{ people: [{ appUserId, name, initials }] }`.
import { describe, expect, it, vi } from 'vitest';
import { fetchPeople } from './people-api';

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('EZD-126 fetchPeople', () => {
  it('EZD-126 R3 calls the route with the ids and reads only a valid 200', async () => {
    const good = reply(200, { people: [{ appUserId: 'a', name: null, initials: 'B' }] });
    expect(await fetchPeople('p/1', ['a', 'b'], { fetchImpl: good as never })).toEqual({
      ok: true,
      people: [{ appUserId: 'a', name: null, initials: 'B' }],
    });
    expect(good).toHaveBeenCalledTimes(1);
    expect(good.mock.calls[0]).toEqual(['/api/projects/p%2F1/people?ids=a,b', { cache: 'no-store' }]);

    const bad = reply(200, { people: [{ appUserId: 1 }] });
    expect(await fetchPeople('p', ['a'], { fetchImpl: bad as never })).toEqual({ ok: false });
    const fail = reply(500, { error: {} });
    expect(await fetchPeople('p', ['a'], { fetchImpl: fail as never })).toEqual({ ok: false });
    const thrown = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await fetchPeople('p', ['a'], { fetchImpl: thrown as never })).toEqual({ ok: false });
  });
});
