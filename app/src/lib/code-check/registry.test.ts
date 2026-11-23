// EZD-611a (R19: a rule is unverified until a licensed person checks it; AC-EZD-611a-3): the verified rule ids come
// only from rows with verified_at set.
import { describe, expect, it } from 'vitest';
import { appRuleRegistry, verifiedRuleIdsOf } from './registry';

describe('EZD-611a app rule registry', () => {
  it('verified rule ids are the rows with verified_at set', () => {
    const rows = [
      { rule_id: 'R3-053', verified_at: '2026-11-23T00:00:00Z' },
      { rule_id: 'R3-037', verified_at: null },
    ];
    expect([...verifiedRuleIdsOf(rows)]).toEqual(['R3-053']);
  });

  it('builds a registry from the app rule sets', () => {
    expect(appRuleRegistry().ruleIds('fbc9_nec2023')).toEqual(expect.any(Array));
  });
});
