// EZD-5602 T11-T13 (vault/plans/EZD-5602.md section 1 Data, section 3 SQL and table rows, section 4;
// AC-EZD-5602-6, -8). The ai_usage and ai_assistant_slot tables (no API grant; tenant isolation in the EZD-006
// harness with apiAccess 'none') and the take/release_ai_assistant_slot and record_ai_usage definer functions on
// the local stack. Expected values: Data (in flight = unfinished and started within 125 s; 30 per rolling minute;
// rows older than 5 minutes deleted; model ids and 0 <= cost < 10000 else 22023; 42501 without an active member).
// Copied pattern: app/src/server/assistant/user-ai-key.db.test.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  anonDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';

type SlotAnswer = { slot_id: string | null; refused: string | null };

const OPUS = 'claude-opus-5-5';

describe('EZD-5602 assistant tables and functions', () => {
  describeTenantIsolation('ai_usage', {
    apiAccess: 'none',
    makeRow: (tenantId, ctx) => ({
      tenant_id: tenantId,
      app_user_id: ctx.member.appUserId,
      model: 'claude-sonnet-5-5',
      cost_usd: 0.012,
    }),
  });
  describeTenantIsolation('ai_assistant_slot', {
    apiAccess: 'none',
    makeRow: (tenantId, ctx) => ({ tenant_id: tenantId, app_user_id: ctx.member.appUserId }),
  });

  describe('functions', () => {
    let tenant = '';
    let m: Member;
    let c: Member;
    let sm: Session;
    let sc: Session;

    beforeAll(async () => {
      tenant = await createTenant();
      m = await createMember({ tenantId: tenant, scope: 'all' });
      await setPermissions(tenant, m.membershipId, ['edit_model']);
      c = await createMember({ tenantId: tenant, scope: 'all' });
      sm = await signIn(m.email);
      sc = await signIn(c.email);
    }, 120000);

    afterAll(async () => {
      await cleanup();
      await closeHarness();
    });

    const db = (s: Session) => s.serverDb as SupabaseClient;

    async function take(s: Session): Promise<SlotAnswer> {
      const r = await db(s).rpc('take_ai_assistant_slot');
      expect(r.error).toBeNull();
      const rows = r.data as SlotAnswer[];
      expect(rows).toHaveLength(1);
      return rows[0];
    }

    const slotRows = (appUserId: string) =>
      harnessSql()<{ id: string; finished_at: Date | null }[]>`
        select id, finished_at from public.ai_assistant_slot
        where app_user_id = ${appUserId}::uuid order by started_at`;

    const insertSlots = async (n: number, ageSeconds: number, finished: boolean) => {
      const sql = harnessSql();
      await sql`
        insert into public.ai_assistant_slot (tenant_id, app_user_id, started_at, finished_at)
        select ${tenant}::uuid, ${m.appUserId}::uuid,
          now() - make_interval(secs => ${ageSeconds}),
          case when ${finished} then now() - make_interval(secs => ${ageSeconds}) else null end
        from generate_series(1, ${n})`;
    };

    const clearMine = async () => {
      await harnessSql()`delete from public.ai_assistant_slot where app_user_id = ${m.appUserId}::uuid`;
    };

    it('T11 ai_usage columns, and no select for a member or anon', async () => {
      const cols = await harnessSql()<
        { column_name: string; numeric_precision: number | null; numeric_scale: number | null }[]
      >`
        select column_name, numeric_precision, numeric_scale from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_usage' order by column_name`;
      expect(cols.map((c) => c.column_name)).toEqual([
        'app_user_id',
        'cost_usd',
        'created_at',
        'id',
        'model',
        'tenant_id',
      ]);
      const cost = cols.find((c) => c.column_name === 'cost_usd');
      expect(cost?.numeric_precision).toBe(10);
      expect(cost?.numeric_scale).toBe(6);

      const asMember = await db(sm).from('ai_usage').select('*');
      expect(asMember.error?.code).toBe('42501');
      const asAnon = await anonDb({ gate: true }).from('ai_usage').select('*');
      expect(asAnon.error?.code).toBe('42501');
    }, 60000);

    describe('slots', () => {
      beforeEach(clearMine);

      it('T12 slot functions: in flight, release, own rows only, 30 per minute, 125 s, 5-minute sweep', async () => {
        // take; take; release the first; take
        const first = await take(sm);
        expect(first.slot_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(first.refused).toBeNull();
        expect(await take(sm)).toEqual({ slot_id: null, refused: 'in_flight' });
        const released = await db(sm).rpc('release_ai_assistant_slot', {
          p_slot_id: first.slot_id,
        });
        expect(released.error).toBeNull();
        const second = await take(sm);
        expect(second.slot_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(second.slot_id).not.toBe(first.slot_id);
        expect(second.refused).toBeNull();

        // M releasing C's slot changes nothing
        await clearMine();
        const theirs = await take(sc);
        expect(theirs.slot_id).not.toBeNull();
        const foreign = await db(sm).rpc('release_ai_assistant_slot', {
          p_slot_id: theirs.slot_id,
        });
        expect(foreign.error).toBeNull();
        const cRows = await slotRows(c.appUserId);
        expect(cRows.find((r) => r.id === theirs.slot_id)?.finished_at).toBeNull();

        // 30 finished in the last minute: rate limited; 61 s old: a slot
        await clearMine();
        await insertSlots(30, 10, true);
        expect(await take(sm)).toEqual({ slot_id: null, refused: 'rate_limited' });
        await clearMine();
        await insertSlots(30, 61, true);
        const afterMinute = await take(sm);
        expect(afterMinute.slot_id).not.toBeNull();
        expect(afterMinute.refused).toBeNull();

        // an unfinished slot 100 s old is in flight; 126 s old it is not
        await clearMine();
        await insertSlots(1, 100, false);
        expect(await take(sm)).toEqual({ slot_id: null, refused: 'in_flight' });
        await harnessSql()`
          update public.ai_assistant_slot set started_at = now() - interval '126 seconds'
          where app_user_id = ${m.appUserId}::uuid`;
        const late = await take(sm);
        expect(late.slot_id).not.toBeNull();
        expect(late.refused).toBeNull();

        // a row 6 minutes old is deleted by the next take
        await clearMine();
        await insertSlots(1, 360, false);
        const [old] = await slotRows(m.appUserId);
        await take(sm);
        const left = await slotRows(m.appUserId);
        expect(left.some((r) => r.id === old.id)).toBe(false);
      }, 60000);
    });

    it('T13 record_ai_usage: one row for the caller; bad model or cost 22023; anon and a deactivated member 42501', async () => {
      const ok = await db(sm).rpc('record_ai_usage', {
        p_model: 'claude-sonnet-5-5',
        p_cost_usd: '0.012000',
      });
      expect(ok.error).toBeNull();
      const rows = await harnessSql()<
        { tenant_id: string; app_user_id: string; model: string; cost: string }[]
      >`
        select tenant_id, app_user_id, model, cost_usd::text as cost from public.ai_usage
        where app_user_id = ${m.appUserId}::uuid`;
      expect(rows).toEqual([
        {
          tenant_id: tenant,
          app_user_id: m.appUserId,
          model: 'claude-sonnet-5-5',
          cost: '0.012000',
        },
      ]);

      for (const [model, cost] of [
        ['claude-haiku-5-5', '0.01'],
        [OPUS, '-0.000001'],
        [OPUS, '10000'],
      ]) {
        const r = await db(sm).rpc('record_ai_usage', { p_model: model, p_cost_usd: cost });
        expect(r.error?.code, `${model} ${cost}`).toBe('22023');
      }

      const anon = await anonDb({ gate: true }).rpc('record_ai_usage', {
        p_model: OPUS,
        p_cost_usd: '0.01',
      });
      expect(anon.error?.code).toBe('42501');

      await harnessSql()`
        update public.membership set status = 'deactivated' where id = ${m.membershipId}::uuid`;
      const gone = await db(sm).rpc('record_ai_usage', { p_model: OPUS, p_cost_usd: '0.01' });
      expect(gone.error?.code).toBe('42501');
      expect(
        await harnessSql()`select 1 from public.ai_usage where app_user_id = ${m.appUserId}::uuid`,
      ).toHaveLength(1);
    }, 60000);
  });
});
