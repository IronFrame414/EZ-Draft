// EZD-120a U1 (vault/plans/EZD-120a.md section 4; AC-EZD-120a-1, -3). Expected values: Decided
// "parseSaveRequest" (zod strictObject; lockEpoch int >= 0; changes an array, min 1; delete: baseSeq >= 1;
// upsert: baseSeq >= 0, type /^[a-z][a-z0-9_]*$/, schemaVersion >= 1, data an object; a repeated id -> null).
import { describe, expect, it } from 'vitest';
import { parseSaveRequest } from './model';

const ID1 = '3f2b8c1e-5a4d-4e6f-8a7b-9c0d1e2f3a4b';
const ID2 = '4a3c9d2f-6b5e-4f70-9b8c-0d1e2f3a4b5c';
const upsertChange = (extra: Record<string, unknown> = {}) => ({
  id: ID1,
  baseSeq: 0,
  deleted: false,
  type: 'wall',
  schemaVersion: 1,
  data: { length: 10 },
  ...extra,
});
const deleteChange = (extra: Record<string, unknown> = {}) => ({
  id: ID1,
  baseSeq: 1,
  deleted: true,
  ...extra,
});
const body = (changes: unknown, extra: Record<string, unknown> = {}) => ({
  lockEpoch: 0,
  changes,
  ...extra,
});

describe('EZD-120a parseSaveRequest', () => {
  it('U1 parses an upsert, a delete and an upper-case uuid', () => {
    const a = parseSaveRequest(body([upsertChange()]));
    expect(a).not.toBeNull();
    expect(a).toEqual(body([upsertChange()]));
    const b = parseSaveRequest(body([deleteChange()], { lockEpoch: 3 }));
    expect(b).toEqual(body([deleteChange()], { lockEpoch: 3 }));
    const c = parseSaveRequest(body([upsertChange({ id: ID1.toUpperCase() })]));
    expect(c).not.toBeNull();
  });

  it('U1 returns null for every refused body', () => {
    const refused: [string, unknown][] = [
      ['empty object', {}],
      ['empty changes', body([])],
      ['extra top-level key', body([upsertChange()], { extra: 1 })],
      ['extra change key', body([upsertChange({ extra: 1 })])],
      ['baseSeq 1.5', body([upsertChange({ baseSeq: 1.5 })])],
      ['delete baseSeq 0', body([deleteChange({ baseSeq: 0 })])],
      ['type Wall', body([upsertChange({ type: 'Wall' })])],
      ['schemaVersion 0', body([upsertChange({ schemaVersion: 0 })])],
      ['data an array', body([upsertChange({ data: [] })])],
      ['repeated id', body([upsertChange(), deleteChange()])],
      [
        'repeated id, three changes',
        body([upsertChange(), upsertChange({ id: ID2 }), upsertChange()]),
      ],
    ];
    for (const [name, input] of refused) expect(parseSaveRequest(input), name).toBeNull();
  });
});
