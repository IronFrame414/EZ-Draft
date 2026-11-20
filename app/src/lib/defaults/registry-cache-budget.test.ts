// EZD-134 (03b Architecture rule 10 "a size budget in Defaults"): the device cache budget row. Default and
// bounds are the assumption recorded in vault/build/assumptions.md (EZD-134): 500 MB, 100 to 10,000 MB.
import { describe, expect, it } from 'vitest';
import { STORABLE_KEYS, defaultRow } from './registry';
import { checkValue, refusalKey } from './values';

describe('EZD-134 device cache budget default', () => {
  const row = defaultRow('device_cache_budget')!;

  it('is a stored company default in megabytes, not copied to projects', () => {
    expect(row).toBeDefined();
    expect(row.group).toBe('history');
    expect(row.type).toBe('count');
    expect(row.unit).toBe('MB');
    expect(row.default).toBe(500);
    expect(row.perProject).toBe(false);
    expect(STORABLE_KEYS).toContain('device_cache_budget');
  });

  it('accepts whole numbers from 100 to 10,000 and names its own bounds when refused', () => {
    for (const v of [100, 500, 10000]) expect(checkValue(row, v).ok, String(v)).toBe(true);
    for (const v of [99, 10001, 150.5, '500', -1]) expect(checkValue(row, v).ok, String(v)).toBe(false);
    expect(refusalKey(row)).toBe('office.defaults.error.device_cache_budget');
  });
});
