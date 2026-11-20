// EZD-1102 (S15f; R26 R21; Q-0016; vault/build/assumptions.md EZD-1102): the render tiers, the image models a
// tier may use and the Settings > Render models data. Browser and server.
// The v1 list is Gemini only (R26 R21), plus the stub model outside production (EZD-1103 builds the adapters and
// confirms the model ids; vault/research/R-014.md). The database checks only the provider list and the model id
// shape (20261120090000_create_render_tier_model.sql), so this list can change without a migration.
import type { MessageKey } from '../../server/messages/catalog';

export const RENDER_TIERS = ['fast', 'standard', 'photoreal'] as const;
export type RenderTier = (typeof RENDER_TIERS)[number];

export const RENDER_PROVIDERS = ['gemini', 'openai', 'bfl', 'stub'] as const;
export type RenderProvider = (typeof RENDER_PROVIDERS)[number];

export const OUTPUT_SIZES = ['1k', '2k', '4k'] as const;
export type OutputSize = (typeof OUTPUT_SIZES)[number];

export type RenderModel = {
  key: string;
  provider: RenderProvider;
  modelId: string;
  outputSize: OutputSize;
  label: string;
  // Only outside production (the stub adapter, EZD-1103).
  devOnly: boolean;
};

export const RENDER_MODELS: readonly RenderModel[] = [
  {
    key: 'gemini-3.1-flash-lite-image-1k',
    provider: 'gemini',
    modelId: 'gemini-3.1-flash-lite-image',
    outputSize: '1k',
    label: 'Gemini 3.1 Flash Lite Image',
    devOnly: false,
  },
  {
    key: 'gemini-3.1-flash-image-1k',
    provider: 'gemini',
    modelId: 'gemini-3.1-flash-image',
    outputSize: '1k',
    label: 'Gemini 3.1 Flash Image 1K',
    devOnly: false,
  },
  {
    key: 'gemini-3.1-flash-image-2k',
    provider: 'gemini',
    modelId: 'gemini-3.1-flash-image',
    outputSize: '2k',
    label: 'Gemini 3.1 Flash Image 2K',
    devOnly: false,
  },
  {
    key: 'gemini-3.1-flash-image-4k',
    provider: 'gemini',
    modelId: 'gemini-3.1-flash-image',
    outputSize: '4k',
    label: 'Gemini 3.1 Flash Image 4K',
    devOnly: false,
  },
  {
    key: 'stub-image-1k',
    provider: 'stub',
    modelId: 'stub-image',
    outputSize: '1k',
    label: 'Stub image (test only)',
    devOnly: true,
  },
];

// The models the page offers: the stub only outside production.
export function availableModels(production: boolean): RenderModel[] {
  return RENDER_MODELS.filter((m) => !production || !m.devOnly);
}

export function modelByKey(key: string | null | undefined, models: readonly RenderModel[] = RENDER_MODELS) {
  return models.find((m) => m.key === key) ?? null;
}

// The registry entry a stored row names; null when the row names a model no longer in the list.
export function modelOfRow(row: { provider: string; model_id: string; output_size: string }): RenderModel | null {
  return (
    RENDER_MODELS.find(
      (m) => m.provider === row.provider && m.modelId === row.model_id && m.outputSize === row.output_size,
    ) ?? null
  );
}

export const tierLabel = (t: RenderTier): MessageKey => `office.render_models.tier.${t}`;
export const tierHint = (t: RenderTier): MessageKey => `office.render_models.tier_hint.${t}`;
export const outputLabel = (s: OutputSize): string => s.toUpperCase();

export function isRenderTier(v: unknown): v is RenderTier {
  return typeof v === 'string' && (RENDER_TIERS as readonly string[]).includes(v);
}

// One tier as the page shows it. costUsdPerRender is sent only with See company costs (13b R2).
export type TierSetting = { tier: RenderTier; model: string | null; costUsdPerRender?: number | null };

export type AllowanceSetting = {
  amountUsd: number;
  balanceUsd: number;
  refillAmountUsd: number;
  lastRefilledAt: string;
};

// GET and PATCH answer of /api/settings/render-models. `allowance` is present only with See company costs
// (null: never saved).
export type RenderModelsSettings = {
  tiers: TierSetting[];
  models: RenderModel[];
  costs: boolean;
  allowance?: AllowanceSetting | null;
};

export type RenderModelsPatch = {
  tiers: { tier: RenderTier; model: string; costUsdPerRender?: number | null }[];
  allowance?: { amountUsd: number; refillAmountUsd: number };
};

export type PatchParse =
  | { ok: true; patch: RenderModelsPatch }
  | { ok: false; code: 'invalid_input' | 'tier_model_required' };

// A dollar figure: a finite number of zero or more (more than zero when `positive`) with at most two decimals,
// below $1,000,000 (S15f Validation "positive dollar values").
export function isDollars(v: unknown, positive: boolean): v is number {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= 0 &&
    v < 1_000_000 &&
    (!positive || v > 0) &&
    Math.abs(Math.round(v * 100) - v * 100) < 1e-6
  );
}

// The PATCH body `{ tiers, allowance? }`: every tier once with a model from `models` (AC-EZD-1102-1).
export function parseRenderModelsPatch(body: unknown, models: readonly RenderModel[]): PatchParse {
  const bad = { ok: false, code: 'invalid_input' } as const;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return bad;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => k !== 'tiers' && k !== 'allowance')) return bad;
  if (!Array.isArray(b.tiers)) return bad;
  const seen = new Set<RenderTier>();
  const tiers: RenderModelsPatch['tiers'] = [];
  let missingModel = false;
  for (const raw of b.tiers as unknown[]) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad;
    const t = raw as Record<string, unknown>;
    if (Object.keys(t).some((k) => k !== 'tier' && k !== 'model' && k !== 'costUsdPerRender')) return bad;
    if (!isRenderTier(t.tier) || seen.has(t.tier)) return bad;
    seen.add(t.tier);
    if (t.model === null || t.model === undefined || t.model === '') {
      missingModel = true;
      continue;
    }
    if (typeof t.model !== 'string' || modelByKey(t.model, models) === null) return bad;
    const item: RenderModelsPatch['tiers'][number] = { tier: t.tier, model: t.model };
    if ('costUsdPerRender' in t) {
      if (t.costUsdPerRender !== null && !isDollars(t.costUsdPerRender, false)) return bad;
      item.costUsdPerRender = t.costUsdPerRender as number | null;
    }
    tiers.push(item);
  }
  if (missingModel || seen.size !== RENDER_TIERS.length) return { ok: false, code: 'tier_model_required' };
  const patch: RenderModelsPatch = { tiers };
  if ('allowance' in b) {
    const a = b.allowance;
    if (typeof a !== 'object' || a === null || Array.isArray(a)) return bad;
    const r = a as Record<string, unknown>;
    if (Object.keys(r).some((k) => k !== 'amountUsd' && k !== 'refillAmountUsd')) return bad;
    if (!isDollars(r.amountUsd, true) || !isDollars(r.refillAmountUsd, true)) return bad;
    patch.allowance = { amountUsd: r.amountUsd, refillAmountUsd: r.refillAmountUsd };
  }
  return { ok: true, patch };
}

// Dollars as the board shows them: $0.03, $50.00, $1,250.00.
export function formatDollars(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
