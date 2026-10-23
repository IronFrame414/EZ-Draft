// EZD-031 test T3 (vault/plans/EZD-031.md Tests; Step 4; Interface contract src/cost.ts).
import { describe, expect, it } from 'vitest';
import { costFor } from '../src/cost';

const meta = { sourceUrl: 'https://example.test/prices', retrieved: '2026-10-11' };
const tokenPrice = (inputPerMTok: number | null, outputPerMTok: number | null) =>
  ({ provider: 'gemini', unit: 'per_token', inputPerMTok, outputPerMTok, ...meta }) as const;

describe('EZD-031 cost function', () => {
  it('T3 (a) per_token rounds the sum once: 125 + 1.5 = 126.5 -> 127', () => {
    const r = costFor({ inputTokens: 1000, outputTokens: 3, images: 1 }, tokenPrice(0.125, 0.5));
    expect(r.costMicroUsd).toBe(127);
    expect(r.costUsd).toBeCloseTo(0.000127, 12);
    expect(r.reason).toBeNull();
  });
  it('T3 (b) per_image: 2 images x 0.04 = 80,000', () => {
    const r = costFor({ inputTokens: null, outputTokens: null, images: 2 }, { provider: 'bfl', unit: 'per_image', perImage: 0.04, ...meta });
    expect(r.costMicroUsd).toBe(80000);
    expect(r.reason).toBeNull();
  });
  it('T3 (c) per_token with null token counts is usage_missing', () => {
    const r = costFor({ inputTokens: null, outputTokens: null, images: 1 }, tokenPrice(0.125, 0.5));
    expect(r.costMicroUsd).toBeNull();
    expect(r.reason).toBe('usage_missing');
  });
  it('T3 (d) a null rate is price_not_set', () => {
    const r = costFor({ inputTokens: 1000, outputTokens: 3, images: 1 }, tokenPrice(null, 0.5));
    expect(r.costMicroUsd).toBeNull();
    expect(r.reason).toBe('price_not_set');
  });
  it('T3 (e) a failed render (usage null) is render_failed', () => {
    const r = costFor(null, tokenPrice(0.125, 0.5));
    expect(r.costMicroUsd).toBeNull();
    expect(r.reason).toBe('render_failed');
  });
});
