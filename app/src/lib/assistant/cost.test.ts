// EZD-5602 T1 (vault/plans/EZD-5602.md section 1 step 5, Decided "D-Cost", section 4; AC-EZD-5602-7). Expected
// values: the eight rows of vault/spec/sections/09l-ai-assistant-cost-examples.md (micro-dollars = the 09l Cost
// column x 1,000,000; Shows column for formatUsd); tokens that are not safe non-negative integers throw RangeError.
import { describe, expect, it } from 'vitest';
import { assistantCostMicroUsd, formatUsd, sessionTotalMicroUsd } from './cost';

describe('EZD-5602 assistant cost', () => {
  it('T1 the 09l rows: micro-dollars, the shown line, the session total and a bad token count', () => {
    const rows: Array<[string, 'sonnet' | 'opus', number, number, number, string]> = [
      ['Zero', 'sonnet', 0, 0, 0, '$0.00'],
      ['Typical sonnet', 'sonnet', 3000, 1400, 20000, '$0.02'],
      ['Typical opus', 'opus', 3000, 1400, 40000, '$0.04'],
      ['Rounding down', 'sonnet', 1000, 1000, 12000, '$0.01'],
      ['Rounding, half up', 'sonnet', 2500, 1000, 15000, '$0.02'],
      ['Above zero, under half a cent', 'sonnet', 100, 0, 200, '$0.01'],
      ['Maximum', 'opus', 200000, 8192, 963840, '$0.96'],
    ];
    for (const [name, model, inputTokens, outputTokens, micro, shows] of rows) {
      const cost = assistantCostMicroUsd(model, { inputTokens, outputTokens });
      expect(cost, name).toBe(micro);
      expect(formatUsd(cost), name).toBe(shows);
    }

    // Session: unrounded sum, then rounded once ($0.04; rounding each first would give $0.03).
    const total = sessionTotalMicroUsd([12000, 12000, 12000]);
    expect(total).toBe(36000);
    expect(formatUsd(total)).toBe('$0.04');

    expect(() => assistantCostMicroUsd('sonnet', { inputTokens: -1, outputTokens: 0 })).toThrow(
      RangeError,
    );
  });
});
