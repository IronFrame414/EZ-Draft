// EZD-1102 (S15f; board S15fRender; AC-EZD-1102-1). Renders the Render models page inside MessagesProvider >
// StateHost > UnsavedChangesProvider as code-edition-form.test.tsx does. Expected values: board S15fRender (Tiers
// Fast / Standard / Photoreal with "Run fast renders" etc., Model, Output, Cost per render, Runs on; Render
// allowance with "No hard limit", Allowance amount, Auto-refill amount; footer note "Dollar figures shown with See
// company costs only"; the pending note), S15f Controls (Save disabled with no edits), S15f Validation (each tier
// must have a model) and 13b R2 (no dollar figure without See company costs).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/render-models',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import { availableModels, type RenderModelsSettings } from '../../../lib/render-settings/models';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import {
  RenderModelsLoadError,
  RenderModelsPage,
  changedKeys,
  formOf,
  parseDollarsText,
  patchOf,
} from './RenderModelsForm';
import Loading from '../../../app/(office)/settings/render-models/loading';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <UnsavedChangesProvider draftScope="m1">{el}</UnsavedChangesProvider>
      </StateHost>
    </MessagesProvider>,
  );
const openTag = (html: string, testId: string) =>
  new RegExp(`<[a-z]+\\b[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? null;
const isDisabled = (tag: string | null) => /\sdisabled(=""|\s|>|\/)/.test(tag ?? '');
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const MODELS = availableModels(true);
const EMPTY: RenderModelsSettings = {
  tiers: [
    { tier: 'fast', model: null, costUsdPerRender: null },
    { tier: 'standard', model: null, costUsdPerRender: null },
    { tier: 'photoreal', model: null, costUsdPerRender: null },
  ],
  models: MODELS,
  costs: true,
  allowance: null,
};
const SET: RenderModelsSettings = {
  tiers: [
    { tier: 'fast', model: 'gemini-3.1-flash-lite-image-1k', costUsdPerRender: 0.03 },
    { tier: 'standard', model: 'gemini-3.1-flash-image-1k', costUsdPerRender: 0.06 },
    { tier: 'photoreal', model: 'gemini-3.1-flash-image-4k', costUsdPerRender: 0.14 },
  ],
  models: MODELS,
  costs: true,
  // The board's example: $7.50 used of $50.00, refilled Oct 9.
  allowance: { amountUsd: 50, balanceUsd: 42.5, refillAmountUsd: 50, lastRefilledAt: '2026-10-09T15:00:00Z' },
};
const NO_COSTS: RenderModelsSettings = {
  tiers: SET.tiers.map(({ tier, model }) => ({ tier, model })),
  models: MODELS,
  costs: false,
};

describe('EZD-1102 Render models page markup', () => {
  it('shows the board tiers, columns, allowance card and notes; Save is off with no edits', () => {
    const html = render(<RenderModelsPage initial={SET} />);
    const plain = text(html);
    expect(html).toContain('data-settings-page="render_models"');
    for (const s of [
      'Render models',
      'Tiers',
      'Who can run each tier is set per role in Users + permissions',
      'Fast',
      'Run fast renders',
      'Standard',
      'Run standard renders',
      'Photoreal',
      'Run photoreal renders',
      'Model',
      'Output',
      'Cost per render',
      'Runs on',
      'Default models per tier are pending the render test (3 past jobs through 3 to 4 models). Target under $0.25 per render on every tier.',
      'Render allowance',
      'No hard limit',
      'Used since refill on Oct 9',
      '$7.50',
      '$50.00',
      '$42.50 left',
      'Allowance amount',
      'Auto-refill amount',
      'Dollar figures shown with See company costs only',
    ]) {
      expect(plain, s).toContain(s);
    }
    const tiers = [...html.matchAll(/data-tier="([a-z]+)"/g)].map((m) => m[1]);
    expect(tiers).toEqual(['fast', 'standard', 'photoreal']);
    expect(openTag(html, 'render-models-fast-cost')).toContain('value="0.03"');
    expect(openTag(html, 'render-models-amount')).toContain('value="50.00"');
    expect(/data-testid="render-models-photoreal-output"[^>]*>([^<]*)</.exec(html)?.[1]).toBe('4K');
    expect(/data-testid="render-models-fast-output"[^>]*>([^<]*)</.exec(html)?.[1]).toBe('1K');
    expect(isDisabled(openTag(html, 'render-models-save'))).toBe(true);
    expect(isDisabled(openTag(html, 'render-models-discard'))).toBe(true);
  });

  it('with no models chosen every select starts on "Choose a model"; the model list is the offered list', () => {
    const html = render(<RenderModelsPage initial={EMPTY} />);
    const select = /<select[^>]*data-testid="render-models-fast-model"[^>]*>([\s\S]*?)<\/select>/.exec(html)![1];
    const options = [...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
    expect(options[0]).toEqual(['', 'Choose a model']);
    expect(options.slice(1).map((o) => o[0])).toEqual(MODELS.map((m) => m.key));
    expect(text(html)).toContain('No allowance set yet. Renders still run.');
  });

  it('without See company costs no dollar figure or allowance card is drawn', () => {
    const html = render(<RenderModelsPage initial={NO_COSTS} />);
    const plain = text(html);
    expect(plain).not.toContain('Cost per render');
    expect(plain).not.toContain('Render allowance');
    expect(html).not.toContain('data-testid="render-models-fast-cost"');
    expect(html).not.toContain('data-testid="render-models-amount"');
    expect(plain).toContain('Dollar figures shown with See company costs only');
  });

  it('AC-EZD-1102-1: Save is refused until every tier has a model', () => {
    const form = formOf(EMPTY);
    form.tiers.fast.model = 'gemini-3.1-flash-lite-image-1k';
    form.tiers.standard.model = 'gemini-3.1-flash-image-1k';
    expect(changedKeys(formOf(EMPTY), form)).toEqual(['fast_model', 'standard_model']);
    expect(patchOf(form, true, false)).toEqual({ ok: false, problem: 'tier_model_required' });
    form.tiers.photoreal.model = 'gemini-3.1-flash-image-4k';
    expect(patchOf(form, true, false)).toEqual({
      ok: true,
      patch: {
        tiers: [
          { tier: 'fast', model: 'gemini-3.1-flash-lite-image-1k', costUsdPerRender: null },
          { tier: 'standard', model: 'gemini-3.1-flash-image-1k', costUsdPerRender: null },
          { tier: 'photoreal', model: 'gemini-3.1-flash-image-4k', costUsdPerRender: null },
        ],
      },
    });
  });

  it('dollars: costs and the allowance are sent only with See company costs; amounts must be positive', () => {
    const form = formOf(SET);
    expect(patchOf(form, false, false)).toEqual({
      ok: true,
      patch: { tiers: NO_COSTS.tiers.map((t) => ({ ...t, model: t.model! })) },
    });
    form.amount = '60';
    expect(changedKeys(formOf(SET), form)).toEqual(['amount']);
    const p = patchOf(form, true, true);
    expect(p.ok && p.patch.allowance).toEqual({ amountUsd: 60, refillAmountUsd: 50 });
    form.refill = '0';
    expect(patchOf(form, true, true)).toEqual({ ok: false, problem: 'allowance_invalid' });
    form.refill = '50';
    form.tiers.fast.cost = '0.035';
    expect(patchOf(form, true, true)).toEqual({ ok: false, problem: 'cost_invalid' });
    expect(parseDollarsText('$1,250.50')).toBe(1250.5);
    expect(parseDollarsText('')).toBeNull();
    expect(parseDollarsText('abc')).toBe('invalid');
  });

  it('loading shows skeletons; a failed load shows the error with Retry', () => {
    expect(render(<Loading />)).toContain('data-testid="render-models-loading"');
    const err = render(<RenderModelsLoadError />);
    expect(err).toContain('data-testid="render-models-load-error"');
    expect(text(err)).toContain("Couldn't load render model settings.");
  });
});
