// EZD-293 T10 (vault/plans/EZD-293.md section 4; AC-EZD-293-1). Local stack plumbing only: no verdict is
// asserted (R-048: inferred). Fresh tenant and member from EZD-006's fixtures, removed in afterAll.
import { afterAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  claimsOf,
  closeHarness,
  createMember,
  createTenant,
  signIn,
} from '../../../test-harness/rls/fixtures';
import { closeAllRealtime } from '../../../test-harness/realtime/node-client';
import { classify, createLiveDeps, runCheck } from '../../../scripts/realtime-failover-check.mjs';

describe('EZD-293 T10 local plumbing', () => {
  afterAll(async () => {
    await closeAllRealtime();
    await cleanup();
    await closeHarness();
  });

  it('joins twice, sends 3 probes and prints no secret', async () => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    const { accessToken } = await signIn(member.email);
    const dbUrl = process.env.EZD_TEST_DB_URL as string;
    const token = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      apiKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
      accessToken,
      expiresAt: claimsOf(accessToken).exp as number,
      appUserId: member.appUserId,
    };
    const deps = createLiveDeps({ dbUrl, token, ask: async () => '' });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o: Record<string, any> = await runCheck(deps, {
        windowMs: 4_000,
        probeEveryMs: 2_000,
        stop: 'none',
      });
      expect(o.join).toBe('SUBSCRIBED');
      expect(o.control.join).toBe('SUBSCRIBED');
      expect(o.baseline.arrived).toBe(true);
      expect(o.probes.length).toBe(3);
      expect(o.control.received).toBe(true);
      expect(['baseline_failed', 'db_not_back'].includes(classify(o))).toBe(false);
      const json = JSON.stringify(o);
      const password = new URL(dbUrl).password;
      expect(json.includes(accessToken)).toBe(false);
      expect(password !== '' && json.includes(password)).toBe(false);
    } finally {
      await deps.db.end();
      deps.rt.close();
    }
  }, 120_000);
});
