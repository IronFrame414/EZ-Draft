// EZD-5605 T2 (vault/plans/EZD-5605.md section 4; D-Flag bound; L-061; AC-EZD-5605-1): the save body takes
// `assistant` only as the JSON literal true; any other value makes the body invalid.
import { describe, expect, it } from 'vitest';
import { parseSaveRequest } from './model';

const body = (extra: Record<string, unknown>) => ({
  lockEpoch: 0,
  changes: [{ id: '00000000-0000-4000-8000-000000000001', baseSeq: 1, deleted: true }],
  ...extra,
});

describe('EZD-5605 parseSaveRequest assistant flag', () => {
  it('T2 true is kept, absent is absent, anything else is refused', () => {
    expect(parseSaveRequest(body({ assistant: true }))).toMatchObject({ assistant: true });
    const plain = parseSaveRequest(body({}));
    expect(plain).not.toBeNull();
    expect(plain).not.toHaveProperty('assistant');
    for (const v of [false, 'true', 1, null]) {
      expect(parseSaveRequest(body({ assistant: v })), String(v)).toBeNull();
    }
  });
});
