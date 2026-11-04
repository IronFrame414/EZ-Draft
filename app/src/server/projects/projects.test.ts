// EZD-117a U1, U2 (vault/plans/EZD-117a.md section 4; AC-EZD-117a-1, -3, -6). Expected values: Decided
// "Query params" (status in PROJECT_TABS, absent = all; sort in PROJECT_SORTS, absent = edited; empty or other
// values refuse; after = a cursor) and "Cursor" (base64url of the JSON; null over 8,200 characters, outside
// [A-Za-z0-9_-], not JSON, or failing the strict shape; n and c at most 1,000 JS characters; u at most 32).
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, parseProjectListQuery, type ProjectCursor } from './projects';

// A cursor in the shape of the plan's section 3 `next` (P1 of fixture S: Zed Co, approved).
const CURSOR: ProjectCursor = {
  id: '3f2b8c1e-5d4a-4e7b-9c3a-1a2b3c4d5e6f',
  u: '2026-10-05T12:00:00+00:00',
  n: 'bravo',
  m: false,
  c: 'zed co',
  r: 4,
  o: 0,
};
const params = (s: string) => new URLSearchParams(s);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('EZD-117a project list query and cursor', () => {
  it('U1 parseProjectListQuery: defaults, valid values, and null for anything else', () => {
    expect(parseProjectListQuery(params(''))).toEqual({ tab: 'all', sort: 'edited', after: null });
    expect(parseProjectListQuery(params('status=draft&sort=name'))).toEqual({
      tab: 'draft',
      sort: 'name',
      after: null,
    });
    expect(parseProjectListQuery(params('status=bogus'))).toBeNull();
    expect(parseProjectListQuery(params('sort='))).toBeNull();
    expect(parseProjectListQuery(params('status=complete'))).toBeNull();
    expect(parseProjectListQuery(params(`after=${encodeCursor(CURSOR)}`))).toEqual({
      tab: 'all',
      sort: 'edited',
      after: CURSOR,
    });
    expect(parseProjectListQuery(params('after=!!'))).toBeNull();
  });

  it('U2 cursor: round trips at the expected lengths, and null for each of 11 bad strings', () => {
    const K: ProjectCursor = {
      id: '3f2a6c1e-8b4d-4e2a-9c1f-0a1b2c3d4e5f',
      u: '2026-10-01T12:00:00.123456+00:00',
      n: 'alpha',
      m: false,
      c: 'acme',
      r: 5,
      o: 2147483647,
    };
    expect(decodeCursor(encodeCursor(K))).toEqual(K);
    const long: [string, number][] = [
      ['漢', 4172],
      ['\u0001', 8172],
      ['\u{20000}', 5506],
    ];
    for (const [ch, length] of long) {
      const k = { ...K, n: ch.repeat(500), c: ch.repeat(500) };
      const s = encodeCursor(k);
      expect(s.length).toBe(length);
      expect(decodeCursor(s)).toEqual(k);
    }
    const bad: string[] = [
      '',
      '!!',
      b64({ id: 'x' }),
      encodeCursor({ ...K, n: 'x'.repeat(1001) }),
      'A'.repeat(8201),
      encodeCursor({ ...K, o: 2147483648 }),
      encodeCursor({ ...K, u: '0000-01-01T00:00:00Z' }),
      encodeCursor({ ...K, u: '2026-10-01T12:00:00+16:00' }),
      encodeCursor({ ...K, n: 'a\u0000b' }),
      encodeCursor({ ...K, n: 'a\ud800b' }),
      encodeCursor({ ...K, u: '2026-10-01T12:00:00.1234567+00:00' }),
    ];
    expect(bad).toHaveLength(11);
    for (const s of bad) expect(decodeCursor(s)).toBeNull();
  });
});
