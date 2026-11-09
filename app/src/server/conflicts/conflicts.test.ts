// EZD-299a T8 (vault/plans/EZD-299a.md section 4; AC-EZD-299-15). Expected values: Decided D-Fit (labels cut to
// 100 code points, joined with ', ' while the JSON of { count, names, more } stays within 4080 bytes; values
// computed 2026-11-07 with that rule) and D-Cap (1 to 1000 changes, data at most 65,536 bytes of JSON).
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fitConflictNames, parseRecordRequest } from './conflicts';

const walls = (n: number) => Array.from({ length: n }, (_, i) => `Wall ${i + 1}`);
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

describe('EZD-299a fitConflictNames', () => {
  it('EZD-299a T8 names every object when they fit', () => {
    expect(fitConflictNames(['Wall 4', 'Door 2', 'Window 3', 'Wall 6', 'Wall 7'])).toEqual({
      count: '5',
      names: 'Wall 4, Door 2, Window 3, Wall 6, Wall 7',
      more: '0',
    });
    const four = fitConflictNames(walls(400));
    expect(four.count).toBe('400');
    expect(four.more).toBe('0');
    expect(four.names).toBe(walls(400).join(', '));
  });

  it('EZD-299a T8 cuts the list at 4,080 bytes and counts the rest as more', () => {
    const fit = fitConflictNames(walls(1000));
    expect(fit.count).toBe('1000');
    expect(fit.more).toBe('585');
    expect(fit.names).toBe(walls(415).join(', '));
    expect(fit.names.endsWith('Wall 415')).toBe(true);
    expect(bytes(fit)).toBe(4080);
  });

  it('EZD-299a T8 cuts one label to 100 code points', () => {
    expect(fitConflictNames(['R'.repeat(150)])).toEqual({
      count: '1',
      names: 'R'.repeat(100),
      more: '0',
    });
  });
});

describe('EZD-299a parseRecordRequest', () => {
  const del = (extra: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    baseSeq: 1,
    reason: 'conflict',
    deleted: true,
    ...extra,
  });
  const upsert = (data: unknown, extra: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    baseSeq: 0,
    reason: 'conflict',
    deleted: false,
    type: 'wall',
    schemaVersion: 3,
    data,
    ...extra,
  });

  it('EZD-299a T8 accepts a delete change', () => {
    const body = { changes: [del()] };
    expect(parseRecordRequest(body)).toEqual(body);
  });

  it('EZD-299a T8 refuses an extra key, 1001 changes, a missing reason and an upsert without data', () => {
    expect(parseRecordRequest({ changes: [del({ extra: 1 })] })).toBeNull();
    expect(parseRecordRequest({ changes: Array.from({ length: 1001 }, () => del()) })).toBeNull();
    const noReason = del();
    delete (noReason as Record<string, unknown>).reason;
    expect(parseRecordRequest({ changes: [noReason] })).toBeNull();
    const noData = upsert({});
    delete (noData as Record<string, unknown>).data;
    expect(parseRecordRequest({ changes: [noData] })).toBeNull();
  });

  it('EZD-299a T8 allows 1000 changes and data of 65,536 bytes, refuses one byte more', () => {
    expect(
      parseRecordRequest({ changes: Array.from({ length: 1000 }, () => del()) }),
    ).not.toBeNull();
    const atCap = { pad: 'a'.repeat(65526) };
    expect(bytes(atCap)).toBe(65536);
    expect(parseRecordRequest({ changes: [upsert(atCap)] })).not.toBeNull();
    expect(parseRecordRequest({ changes: [upsert({ pad: 'a'.repeat(65527) })] })).toBeNull();
  });
});
