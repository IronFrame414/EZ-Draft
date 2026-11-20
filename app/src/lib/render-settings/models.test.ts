// EZD-1102 (AC-EZD-1102-1; S15f Validation; R26 R21). Expected values: S15f (tiers Fast, Standard, Photoreal;
// "Each tier must have a model selected. Allowance and refill amounts are positive dollar values"), R26 R21 (the
// v1 list is Gemini only) and assumptions EZD-1102 (the stub model outside production only).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RENDER_MODELS,
  RENDER_PROVIDERS,
  RENDER_TIERS,
  OUTPUT_SIZES,
  availableModels,
  formatDollars,
  isDollars,
  modelOfRow,
  parseRenderModelsPatch,
} from './models';

const ALL = availableModels(false);
const three = (fast = 'gemini-3.1-flash-lite-image-1k') => [
  { tier: 'fast', model: fast },
  { tier: 'standard', model: 'gemini-3.1-flash-image-1k' },
  { tier: 'photoreal', model: 'gemini-3.1-flash-image-4k' },
];

describe('EZD-1102 render tiers and models', () => {
  it('has the three S15f tiers in order and a Gemini-only production list', () => {
    expect(RENDER_TIERS).toEqual(['fast', 'standard', 'photoreal']);
    expect(availableModels(true).every((m) => m.provider === 'gemini')).toBe(true);
    expect(availableModels(true).some((m) => m.devOnly)).toBe(false);
    expect(availableModels(false).map((m) => m.key)).toContain('stub-image-1k');
  });

  it('every model fits the database checks (provider list, model id shape, output size) and keys are unique', () => {
    const keys = new Set(RENDER_MODELS.map((m) => m.key));
    expect(keys.size).toBe(RENDER_MODELS.length);
    for (const m of RENDER_MODELS) {
      expect(RENDER_PROVIDERS).toContain(m.provider);
      expect(OUTPUT_SIZES).toContain(m.outputSize);
      expect(m.modelId).toMatch(/^[a-z0-9][a-z0-9.-]{0,99}$/);
    }
    expect(modelOfRow({ provider: 'gemini', model_id: 'gemini-3.1-flash-image', output_size: '4k' })?.key).toBe(
      'gemini-3.1-flash-image-4k',
    );
    expect(modelOfRow({ provider: 'gemini', model_id: 'retired-model', output_size: '1k' })).toBeNull();
  });

  it('the migration checks the same provider and output-size lists', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(
      path.join(here, '../../../../supabase/migrations/20261120090000_create_render_tier_model.sql'),
      'utf8',
    );
    const list = (re: RegExp) => [...re.exec(sql)![1].matchAll(/'([a-z0-9]+)'/g)].map((x) => x[1]);
    expect(list(/provider text not null check \(provider in \(([^)]*)\)\)/)).toEqual([...RENDER_PROVIDERS]);
    expect(list(/output_size text not null check \(output_size in \(([^)]*)\)\)/)).toEqual([...OUTPUT_SIZES]);
    expect(list(/tier text not null check \(tier in \(([^)]*)\)\)/)).toEqual([...RENDER_TIERS]);
  });

  it('AC-EZD-1102-1: a PATCH without a model on every tier is tier_model_required', () => {
    expect(parseRenderModelsPatch({ tiers: three() }, ALL)).toEqual({
      ok: true,
      patch: { tiers: three() },
    });
    for (const tiers of [
      three().slice(0, 2),
      [...three().slice(0, 2), { tier: 'photoreal', model: null }],
      [...three().slice(0, 2), { tier: 'photoreal', model: '' }],
      [...three().slice(0, 2), { tier: 'photoreal' }],
      [],
    ]) {
      expect(parseRenderModelsPatch({ tiers }, ALL), JSON.stringify(tiers)).toEqual({
        ok: false,
        code: 'tier_model_required',
      });
    }
  });

  it('refuses unknown models, keys, duplicate tiers and bad dollars as invalid_input', () => {
    const bad = { ok: false, code: 'invalid_input' };
    expect(parseRenderModelsPatch(null, ALL)).toEqual(bad);
    expect(parseRenderModelsPatch({ tiers: three('flux-kontext-max') }, ALL)).toEqual(bad);
    expect(parseRenderModelsPatch({ tiers: three('stub-image-1k') }, availableModels(true))).toEqual(bad);
    expect(parseRenderModelsPatch({ tiers: [...three(), { tier: 'fast', model: 'stub-image-1k' }] }, ALL)).toEqual(
      bad,
    );
    expect(parseRenderModelsPatch({ tiers: three(), extra: 1 }, ALL)).toEqual(bad);
    const withCost = (c: unknown) => [{ ...three()[0], costUsdPerRender: c }, ...three().slice(1)];
    expect(parseRenderModelsPatch({ tiers: withCost(-0.01) }, ALL)).toEqual(bad);
    expect(parseRenderModelsPatch({ tiers: withCost(0.031) }, ALL)).toEqual(bad);
    expect(parseRenderModelsPatch({ tiers: withCost('0.03') }, ALL)).toEqual(bad);
    expect(parseRenderModelsPatch({ tiers: withCost(0.03) }, ALL).ok).toBe(true);
    expect(parseRenderModelsPatch({ tiers: withCost(null) }, ALL).ok).toBe(true);
    for (const allowance of [
      { amountUsd: 0, refillAmountUsd: 50 },
      { amountUsd: 50, refillAmountUsd: -1 },
      { amountUsd: 50 },
      { amountUsd: 50, refillAmountUsd: 50, other: 1 },
    ]) {
      expect(parseRenderModelsPatch({ tiers: three(), allowance }, ALL), JSON.stringify(allowance)).toEqual(bad);
    }
    expect(
      parseRenderModelsPatch({ tiers: three(), allowance: { amountUsd: 50, refillAmountUsd: 25.5 } }, ALL),
    ).toEqual({ ok: true, patch: { tiers: three(), allowance: { amountUsd: 50, refillAmountUsd: 25.5 } } });
  });

  it('dollars: zero or more with two decimals; shown as on the board', () => {
    expect(isDollars(0, false)).toBe(true);
    expect(isDollars(0, true)).toBe(false);
    expect(isDollars(0.07, true)).toBe(true);
    expect(isDollars(1.005, false)).toBe(false);
    expect(isDollars(Number.NaN, false)).toBe(false);
    expect(formatDollars(0.03)).toBe('$0.03');
    expect(formatDollars(50)).toBe('$50.00');
    expect(formatDollars(1250)).toBe('$1,250.00');
  });
});
