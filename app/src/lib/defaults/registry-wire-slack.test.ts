// EZD-1611b (09i Takeoff rules "Wire | ... x (1 + slack) | Slack 15%"; vault/build/assumptions/EZD-1611b.md "Wire per
// circuit"): the Defaults row "Wire slack", a percent under Electrical after Device height notes, 15 by default,
// company only and stored as a number.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULTS_REGISTRY, PER_PROJECT_KEYS, STORABLE_KEYS, defaultRow } from './registry';
import { effectiveValue, parseFormValue } from './values';

const migrations = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../supabase/migrations',
);

describe('EZD-1611b Wire slack Defaults row', () => {
  it('sits under Electrical after Device height notes with the formulas table 15%', () => {
    const keys = DEFAULTS_REGISTRY.filter((r) => r.group === 'electrical').map((r) => r.key);
    expect(keys.indexOf('wire_slack')).toBe(keys.indexOf('device_height_notes') + 1);
    const r = defaultRow('wire_slack')!;
    expect(r.type).toBe('percent');
    expect(r.label).toBe('office.defaults.row.wire_slack');
    expect(effectiveValue('wire_slack', {})).toBe(15);
    expect(effectiveValue('wire_slack', { wire_slack: 20 })).toBe(20);
    expect(STORABLE_KEYS).toContain('wire_slack');
    expect(PER_PROJECT_KEYS).not.toContain('wire_slack');
    expect(parseFormValue(r, '10%')).toEqual({ ok: true, value: 10 });
    expect(parseFormValue(r, 'ten').ok).toBe(false);
  });

  it('the newest key-type definition stores it as a number', () => {
    const newest = readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(path.join(migrations, f), 'utf8'))
      .filter((sql) => sql.includes('function private.defaults_key_type'))
      .at(-1)!;
    const numbers = newest.slice(0, newest.indexOf("then 'number'"));
    expect(numbers).toContain("'wire_slack'");
  });
});
