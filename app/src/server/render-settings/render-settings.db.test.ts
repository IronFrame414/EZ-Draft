// EZD-1102 (AC-EZD-1102-1; CLAUDE.md rule 4). Expected values: S15f (Validation "Each tier must have a model
// selected. Allowance and refill amounts are positive dollar values"; Permissions: Manage users and settings, here
// the page switch settings_render_models (Q-0210), and dollar figures need See company costs (13b R2)), 03d
// render_allowance and the migration header (20261120090002_create_save_render_settings.sql: the first allowance save
// sets balance = amount). Calls go through the gated serverDb of `signIn`, as the routes do.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

type Row = { tenant_id: string; changed: string[] };

const tier = (t: string, model_id = 'gemini-3.1-flash-image', output_size = '1k', cost?: number | null) => ({
  tier: t,
  provider: 'gemini',
  model_id,
  output_size,
  ...(cost === undefined ? {} : { cost_usd_per_render: cost }),
});

describe('EZD-1102 render settings', () => {
  describeTenantIsolation('render_tier_model', {
    makeRow: (tenantId) => ({
      tenant_id: tenantId,
      tier: 'fast',
      provider: 'gemini',
      model_id: 'gemini-3.1-flash-lite-image',
      output_size: '1k',
      cost_usd_per_render: 0.03,
    }),
    update: { cost_usd_per_render: 0.04 },
  });
  describeTenantIsolation('render_allowance', {
    makeRow: (tenantId) => ({
      tenant_id: tenantId,
      amount_usd: 50,
      balance_usd: 42.5,
      refill_amount_usd: 50,
    }),
    update: { amount_usd: 60 },
  });

  describe('save_render_settings', () => {
    let tenantA = '';
    let tenantB = '';
    let owner: Session; // settings_render_models, see_company_costs
    let noCosts: Session; // settings_render_models only
    let plain: Session; // see_company_costs, no settings_render_models
    let ownerB: Session; // another company, both

    const save = (s: Session, tiers: unknown, allowance: unknown = null) =>
      s.serverDb.rpc('save_render_settings', { p_tiers: tiers as never, p_allowance: allowance as never });
    const tierRows = async (tenant: string) =>
      harnessSql()<{ tier: string; model_id: string; output_size: string; cost_usd_per_render: string | null }[]>`
        select tier, model_id, output_size, cost_usd_per_render::text
        from public.render_tier_model where tenant_id = ${tenant}::uuid order by tier`;
    const allowanceRow = async (tenant: string) =>
      (
        await harnessSql()<{ amount_usd: string; balance_usd: string; refill_amount_usd: string }[]>`
          select amount_usd::text, balance_usd::text, refill_amount_usd::text
          from public.render_allowance where tenant_id = ${tenant}::uuid`
      )[0] ?? null;

    beforeAll(async () => {
      tenantA = await createTenant();
      tenantB = await createTenant();
      const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
      await setPermissions(tenantA, m1.membershipId, ['settings_render_models', 'see_company_costs']);
      const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
      await setPermissions(tenantA, m2.membershipId, ['settings_render_models']);
      const m3 = await createMember({ tenantId: tenantA, scope: 'all' });
      await setPermissions(tenantA, m3.membershipId, ['see_company_costs']);
      const m4 = await createMember({ tenantId: tenantB, scope: 'all' });
      await setPermissions(tenantB, m4.membershipId, ['settings_render_models', 'see_company_costs']);
      owner = await signIn(m1.email);
      noCosts = await signIn(m2.email);
      plain = await signIn(m3.email);
      ownerB = await signIn(m4.email);
    }, 120000);

    afterAll(async () => {
      await cleanup();
      await closeHarness();
    });

    it('AC-EZD-1102-1: each tier must have a model to save; a partial set never lands', async () => {
      // Two tiers only.
      const two = await save(owner, [tier('fast'), tier('standard')]);
      expect(two.error?.code).toBe('22023');
      expect(two.error?.message).toBe('tier_model_required');
      // All three, but Photoreal with no model.
      const blank = await save(owner, [tier('fast'), tier('standard'), { tier: 'photoreal', provider: 'gemini', model_id: '', output_size: '4k' }]);
      expect(blank.error?.code).toBe('22023');
      expect(blank.error?.message).toBe('tier_model_required');
      const noModel = await save(owner, [tier('fast'), tier('standard'), { tier: 'photoreal' }]);
      expect(noModel.error?.message).toBe('tier_model_required');
      // Nothing.
      const none = await save(owner, []);
      expect(none.error?.message).toBe('tier_model_required');
      expect(await tierRows(tenantA)).toEqual([]);

      // All three: saved.
      const ok = await save(owner, [
        tier('fast', 'gemini-3.1-flash-lite-image', '1k', 0.03),
        tier('standard', 'gemini-3.1-flash-image', '1k', 0.06),
        tier('photoreal', 'gemini-3.1-flash-image', '4k', 0.14),
      ]);
      expect(ok.error).toBeNull();
      expect((ok.data as Row[])[0]).toEqual({ tenant_id: tenantA, changed: ['fast', 'standard', 'photoreal'] });
      expect(await tierRows(tenantA)).toEqual([
        { tier: 'fast', model_id: 'gemini-3.1-flash-lite-image', output_size: '1k', cost_usd_per_render: '0.03' },
        { tier: 'photoreal', model_id: 'gemini-3.1-flash-image', output_size: '4k', cost_usd_per_render: '0.14' },
        { tier: 'standard', model_id: 'gemini-3.1-flash-image', output_size: '1k', cost_usd_per_render: '0.06' },
      ]);

      // Saving the same again changes nothing.
      const same = await save(owner, [
        tier('fast', 'gemini-3.1-flash-lite-image', '1k', 0.03),
        tier('standard', 'gemini-3.1-flash-image', '1k', 0.06),
        tier('photoreal', 'gemini-3.1-flash-image', '4k', 0.14),
      ]);
      expect((same.data as Row[])[0].changed).toEqual([]);
    });

    it('refuses a bad tier, provider, model id, output size or duplicate tier (22023)', async () => {
      const bad = [
        [tier('fast'), tier('fast'), tier('photoreal')],
        [tier('fast'), tier('standard'), tier('photoreal'), tier('turbo')],
        [{ ...tier('fast'), provider: 'acme' }, tier('standard'), tier('photoreal')],
        [tier('fast', 'Gemini 3.1'), tier('standard'), tier('photoreal')],
        [tier('fast', 'gemini-3.1-flash-image', '8k'), tier('standard'), tier('photoreal')],
        [tier('fast', 'gemini-3.1-flash-image', '1k', -1), tier('standard'), tier('photoreal')],
        [tier('fast', 'gemini-3.1-flash-image', '1k', 0.033), tier('standard'), tier('photoreal')],
        { fast: 'x' },
      ];
      for (const tiers of bad) {
        const r = await save(owner, tiers);
        expect(r.error?.code, JSON.stringify(tiers)).toBe('22023');
      }
    });

    it('needs settings_render_models (42501); dollars also need see_company_costs (42501)', async () => {
      const three = [tier('fast'), tier('standard'), tier('photoreal')];
      expect((await save(plain, three)).error?.code).toBe('42501');
      expect((await save(noCosts, [tier('fast', 'gemini-3.1-flash-image', '1k', 0.05), tier('standard'), tier('photoreal')])).error?.code).toBe('42501');
      expect((await save(noCosts, three, { amount_usd: 50, refill_amount_usd: 50 })).error?.code).toBe('42501');
      expect((await tierRows(tenantA)).map((r) => r.cost_usd_per_render)).toEqual(['0.03', '0.14', '0.06']);

      // Without costs, models save and the stored costs stay.
      const r = await save(noCosts, [
        tier('fast', 'gemini-3.1-flash-image', '1k'),
        tier('standard', 'gemini-3.1-flash-image', '1k'),
        tier('photoreal', 'gemini-3.1-flash-image', '4k'),
      ]);
      expect(r.error).toBeNull();
      expect((r.data as Row[])[0].changed).toEqual(['fast']);
      expect(await tierRows(tenantA)).toEqual([
        { tier: 'fast', model_id: 'gemini-3.1-flash-image', output_size: '1k', cost_usd_per_render: '0.03' },
        { tier: 'photoreal', model_id: 'gemini-3.1-flash-image', output_size: '4k', cost_usd_per_render: '0.14' },
        { tier: 'standard', model_id: 'gemini-3.1-flash-image', output_size: '1k', cost_usd_per_render: '0.06' },
      ]);
    });

    it('allowance: positive dollars; the first save fills the balance; later saves keep what was spent', async () => {
      // The tiers as the last test left them, so only the allowance changes.
      const three = [tier('fast'), tier('standard'), tier('photoreal', 'gemini-3.1-flash-image', '4k')];
      for (const a of [
        { amount_usd: 0, refill_amount_usd: 50 },
        { amount_usd: 50, refill_amount_usd: -5 },
        { amount_usd: 50.001, refill_amount_usd: 50 },
        { amount_usd: '50', refill_amount_usd: 50 },
        { amount_usd: 50 },
      ]) {
        expect((await save(owner, three, a)).error?.code, JSON.stringify(a)).toBe('22023');
      }
      expect(await allowanceRow(tenantA)).toBeNull();

      const first = await save(owner, three, { amount_usd: 50, refill_amount_usd: 50 });
      expect(first.error).toBeNull();
      expect((first.data as Row[])[0].changed).toEqual(['allowance']);
      expect(await allowanceRow(tenantA)).toEqual({
        amount_usd: '50.00',
        balance_usd: '50.00',
        refill_amount_usd: '50.00',
      });

      // $7.50 spent (the board's example), then the owner raises the allowance to $60.
      await harnessSql()`update public.render_allowance set balance_usd = 42.50 where tenant_id = ${tenantA}::uuid`;
      const raised = await save(owner, three, { amount_usd: 60, refill_amount_usd: 25 });
      expect((raised.data as Row[])[0].changed).toEqual(['allowance']);
      expect(await allowanceRow(tenantA)).toEqual({
        amount_usd: '60.00',
        balance_usd: '52.50',
        refill_amount_usd: '25.00',
      });
    });

    it('another company neither sees nor changes these rows', async () => {
      const before = await tierRows(tenantA);
      const seen = await ownerB.serverDb.from('render_tier_model').select('tenant_id');
      expect(seen.error).toBeNull();
      expect((seen.data ?? []).every((r) => r.tenant_id === tenantB)).toBe(true);
      const allowance = await ownerB.serverDb.from('render_allowance').select('tenant_id');
      expect(allowance.data ?? []).toEqual([]);

      const r = await save(ownerB, [
        tier('fast', 'gemini-3.1-flash-lite-image', '1k', 0.01),
        tier('standard', 'gemini-3.1-flash-lite-image', '1k', 0.01),
        tier('photoreal', 'gemini-3.1-flash-lite-image', '1k', 0.01),
      ]);
      expect((r.data as Row[])[0].tenant_id).toBe(tenantB);
      expect(await tierRows(tenantA)).toEqual(before);
      expect((await tierRows(tenantB)).length).toBe(3);

      // A member writes neither table directly: no write policy, so RLS changes no row.
      const direct = await owner.serverDb
        .from('render_tier_model')
        .update({ cost_usd_per_render: 9 })
        .eq('tenant_id', tenantA)
        .select('tier');
      expect(direct.data ?? []).toEqual([]);
      const inserted = await owner.serverDb
        .from('render_allowance')
        .insert({ tenant_id: tenantA, amount_usd: 1, balance_usd: 1, refill_amount_usd: 1 });
      expect(inserted.error?.code).toBe('42501');
      expect(await tierRows(tenantA)).toEqual(before);
    });
  });
});
