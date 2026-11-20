// EZD-1102 (S15f; Q-0210; 13b R2; AC-EZD-1102-1): Settings > Render models.
// GET: settings_render_models (403 without it); the tiers with their models and the models offered; the cost per
// render and the render allowance only with see_company_costs (without it the keys are never sent).
// PATCH: settings_render_models, then the body `{ tiers, allowance? }` (400 tier_model_required unless every
// tier has a model; 400 invalid_input otherwise), then dollar figures need see_company_costs (403), then
// save_render_settings under the member's session (it checks all of this again). `render.model_config_updated`
// is emitted when something changed; a failed emit is reported and does not fail the save.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { errorType } from '../../../../server/errors/fingerprint';
import { reportError } from '../../../../server/errors/report';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { emit } from '../../../../server/events';
import { can, requireApiPermission } from '../../../../server/permissions';
import {
  isProduction,
  loadRenderModelsSettings,
  saveRenderModelsSettings,
} from '../../../../server/render-settings/render-settings';
import {
  availableModels,
  isRenderTier,
  parseRenderModelsPatch,
} from '../../../../lib/render-settings/models';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/render-models';
const EMIT_FAILED = 'render_models_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_render_models');
    if (p instanceof Response) return p;
    const settings = await loadRenderModelsSettings(createSessionClient(), {
      costs: can(p.ctx, 'see_company_costs'),
    });
    return Response.json(settings, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_render_models');
    if (p instanceof Response) return p;
    const costs = can(p.ctx, 'see_company_costs');

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseRenderModelsPatch(raw, availableModels(isProduction()));
    if (!parsed.ok) return fail(400, parsed.code);
    const sendsDollars =
      parsed.patch.allowance !== undefined || parsed.patch.tiers.some((t) => 'costUsdPerRender' in t);
    if (sendsDollars && !costs) return fail(403, 'permission_denied', 'error.not_authorized');

    const client = createSessionClient();
    const saved = await saveRenderModelsSettings(client, parsed.patch);
    if (!saved.ok) {
      return saved.code === 'permission_denied'
        ? fail(403, 'permission_denied', 'error.not_authorized')
        : fail(400, saved.code);
    }

    if (saved.changed.length > 0) {
      try {
        await emit(
          'render.model_config_updated',
          {
            tiers: saved.changed.filter(isRenderTier),
            allowance: saved.changed.includes('allowance'),
          },
          { tenantId: saved.tenantId, actorId: p.session.appUserId },
        );
      } catch (e) {
        try {
          await reportError(new Error(EMIT_FAILED), {
            source: 'function',
            location: ROUTE,
            tags: { 'ezd.cause': errorType(e) },
          });
        } catch {
          /* reportError never throws; guarded as route-failure.ts does */
        }
      }
    }

    return Response.json(await loadRenderModelsSettings(client, { costs }), { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
