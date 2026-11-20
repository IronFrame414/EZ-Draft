// EZD-1102 (S15f; Q-0210; 13b R2; AC-EZD-1102-1): the server side of Settings > Render models. Tiers and the
// render allowance are read under the member's session (RLS: their own company) and written through
// save_render_settings, which checks settings_render_models again, needs see_company_costs for any dollar
// figure and refuses a save unless all three tiers have a model. Dollar figures leave the server only when the
// caller holds see_company_costs (`costs`).
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RENDER_TIERS,
  availableModels,
  modelByKey,
  modelOfRow,
  type RenderModelsPatch,
  type RenderModelsSettings,
  type TierSetting,
} from '../../lib/render-settings/models';
import type { Database } from '../db/database.types';

type Client = SupabaseClient<Database>;

// The stub model is offered outside production only (EZD-1103; ai/config.ts ai_stub_not_allowed).
export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production';
}

export async function loadRenderModelsSettings(
  client: Client,
  opts: { costs: boolean; production?: boolean },
): Promise<RenderModelsSettings> {
  const production = opts.production ?? isProduction();
  const tierRows = await client
    .from('render_tier_model')
    .select('tier, provider, model_id, output_size, cost_usd_per_render');
  if (tierRows.error) throw tierRows.error;
  const byTier = new Map((tierRows.data ?? []).map((r) => [r.tier, r]));
  const models = availableModels(production);
  const tiers: TierSetting[] = RENDER_TIERS.map((tier) => {
    const row = byTier.get(tier);
    const model = row ? modelOfRow(row) : null;
    const offered = model !== null && modelByKey(model.key, models) !== null;
    const setting: TierSetting = { tier, model: offered ? model.key : null };
    if (opts.costs) {
      const cost = row?.cost_usd_per_render;
      setting.costUsdPerRender = cost === null || cost === undefined ? null : Number(cost);
    }
    return setting;
  });
  const settings: RenderModelsSettings = { tiers, models, costs: opts.costs };
  if (opts.costs) {
    const a = await client
      .from('render_allowance')
      .select('amount_usd, balance_usd, refill_amount_usd, last_refilled_at')
      .maybeSingle();
    if (a.error) throw a.error;
    settings.allowance = a.data
      ? {
          amountUsd: Number(a.data.amount_usd),
          balanceUsd: Number(a.data.balance_usd),
          refillAmountUsd: Number(a.data.refill_amount_usd),
          lastRefilledAt: a.data.last_refilled_at,
        }
      : null;
  }
  return settings;
}

export type SaveRenderModelsResult =
  | { ok: true; tenantId: string; changed: string[] }
  | { ok: false; code: 'permission_denied' | 'invalid_input' | 'tier_model_required' };

export async function saveRenderModelsSettings(
  client: Client,
  patch: RenderModelsPatch,
): Promise<SaveRenderModelsResult> {
  const tiers = patch.tiers.map((t) => {
    const m = modelByKey(t.model);
    if (m === null) throw new Error('render_model_unknown');
    const item: Record<string, unknown> = {
      tier: t.tier,
      provider: m.provider,
      model_id: m.modelId,
      output_size: m.outputSize,
    };
    if ('costUsdPerRender' in t) item.cost_usd_per_render = t.costUsdPerRender;
    return item;
  });
  const allowance = patch.allowance
    ? { amount_usd: patch.allowance.amountUsd, refill_amount_usd: patch.allowance.refillAmountUsd }
    : null;
  const args = {
    p_tiers: tiers,
    p_allowance: allowance,
  } as unknown as Database['public']['Functions']['save_render_settings']['Args'];
  const { data, error } = await client.rpc('save_render_settings', args);
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === '22023') {
      return {
        ok: false,
        code: error.message === 'tier_model_required' ? 'tier_model_required' : 'invalid_input',
      };
    }
    throw error;
  }
  const row = data?.[0];
  if (!row) throw new Error('save_render_settings_no_row');
  return { ok: true, tenantId: row.tenant_id, changed: row.changed };
}
