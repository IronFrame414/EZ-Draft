// EZD-2020 (AC-EZD-2020-1, AC-EZD-2020-2; audit 2026-11-27 X3): the hourly digest of tunnel (browser) alerts.
// The subject says the errors were reported by a browser and are unverified and carries only a count, never a
// reported title; one email per digest, not one per report; a send that reaches nobody gives the rows back.
// The database is a stub (rpc only); email goes to the stub transport.
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/database.types';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import { DIGEST_LIST_MAX, digestContent, sendTunnelAlertDigest } from './tunnel-digest';

const ENV = {
  EMAIL_TRANSPORT: 'stub',
  EMAIL_FROM: 'EZ Draft Test <test@example.test>',
  ALERT_EMAIL_TO: 'owner@example.test',
};
const CLAIM = '11111111-1111-4111-8111-111111111111';
const MARK = 'reported by a browser (unverified)';

function rows(n: number, title = (i: number) => `Error: made up ${i}`) {
  return Array.from({ length: n }, (_, i) => ({
    claim: CLAIM,
    alert_id: `a${i}`,
    source: i % 2 === 0 ? 'browser' : 'worker',
    title: title(i),
    occurrences: i + 1,
    ref: null as unknown as string,
    first_seen_at: new Date(2026, 10, 27, 12, i).toISOString(),
  }));
}

function stubDb(claimed: ReturnType<typeof rows>) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_tunnel_alert_digest') return { data: claimed, error: null };
    return { data: claimed.length, error: null };
  });
  return { rpc, db: { rpc } as unknown as SupabaseClient<Database> };
}

describe('EZD-2020 tunnel alert digest', () => {
  beforeEach(() => clearStubOutbox());

  it('AC-EZD-2020-1 the subject marks the reports as from a browser and unverified, with a count and no reported text', () => {
    const { subject } = digestContent(rows(3, () => 'Error: Pay now at evil'), ENV);
    expect(subject).toBe('EZ Draft errors reported by a browser (unverified): 3 new');
    expect(subject).not.toContain('evil');
  });

  it('AC-EZD-2020-1 the body says the reports are unverified and lists at most 20 titles plus a count of the rest', () => {
    const { paragraphs } = digestContent(rows(DIGEST_LIST_MAX + 5), ENV);
    expect(DIGEST_LIST_MAX).toBe(20);
    expect(paragraphs[0]).toContain('unverified');
    expect(paragraphs[1]).toBe('Error: made up 0 (browser, seen 1 times)');
    expect(paragraphs[2]).toBe('Error: made up 1 (worker, seen 2 times)');
    expect(paragraphs).toHaveLength(1 + DIGEST_LIST_MAX + 1);
    expect(paragraphs[paragraphs.length - 1]).toBe('And 5 more.');
  });

  it('AC-EZD-2020-1 many reports in one claim are sent as one email, keyed by the claim', async () => {
    const { db, rpc } = stubDb(rows(30));
    const result = await sendTunnelAlertDigest({ db, env: ENV });
    expect(result).toEqual({ status: 'emailed', count: 30 });
    const box = readStubOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].to).toBe('owner@example.test');
    expect(box[0].subject).toContain(MARK);
    expect(box[0].idempotencyKey).toBe(`alert-digest-${CLAIM}`);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('claim_tunnel_alert_digest');
  });

  it('AC-EZD-2020-1 nothing claimed sends nothing', async () => {
    const { db, rpc } = stubDb([]);
    expect(await sendTunnelAlertDigest({ db, env: ENV })).toEqual({ status: 'none', count: 0 });
    expect(readStubOutbox()).toHaveLength(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('AC-EZD-2020-1 a digest that reaches nobody releases its claim', async () => {
    const { db, rpc } = stubDb(rows(2));
    const result = await sendTunnelAlertDigest({ db, env: { ...ENV, ALERT_EMAIL_TO: '' } });
    expect(result).toEqual({ status: 'email_failed', count: 2 });
    expect(readStubOutbox()).toHaveLength(0);
    expect(rpc).toHaveBeenLastCalledWith('release_tunnel_alert_digest', { p_claim: CLAIM });
  });

  it('AC-EZD-2020-1 a refused claim throws a fixed code', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'secret detail' } }));
    const db = { rpc } as unknown as SupabaseClient<Database>;
    await expect(sendTunnelAlertDigest({ db, env: ENV })).rejects.toThrow(
      'tunnel_digest_claim_failed',
    );
  });
});
