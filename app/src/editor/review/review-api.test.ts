// EZD-127 A1 (04 Header card "N to review" pill): the browser reader of GET /api/projects/[id]/review. Expected
// values: the route's answers (`{ count }`, `{ count, groups }` with ?list=1); anything else reads as null.
import { describe, expect, it } from 'vitest';
import { readSummary, reviewHttpApi } from './review-api';

const P = '11111111-1111-4111-8111-111111111111';

describe('EZD-127 review api', () => {
  it('A1 reads the route answers and refuses anything else', async () => {
    expect(readSummary({ count: 1 })).toEqual({ count: 1 });
    expect(readSummary({ count: 2, groups: [{ source: 'field_conflict', count: 2 }] })).toEqual({
      count: 2,
      groups: [{ source: 'field_conflict', count: 2 }],
    });
    for (const bad of [
      null,
      {},
      { count: -1 },
      { count: 1.5 },
      { count: 1, groups: [{ source: 'x', count: 1 }] },
    ])
      expect(readSummary(bad)).toBeNull();

    const urls: string[] = [];
    const api = reviewHttpApi(async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ count: 1 }), { status: 200 });
    });
    expect(await api.summary(P, false)).toEqual({ count: 1 });
    expect(await api.summary(P, true)).toEqual({ count: 1 });
    expect(urls).toEqual([`/api/projects/${P}/review`, `/api/projects/${P}/review?list=1`]);
    const failing = reviewHttpApi(async () => new Response('{}', { status: 500 }));
    expect(await failing.summary(P, false)).toBeNull();
    const offline = reviewHttpApi(async () => {
      throw new TypeError('offline');
    });
    expect(await offline.summary(P, false)).toBeNull();
  });
});
