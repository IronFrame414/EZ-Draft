// EZD-151 · owner alert subject line (vault/plans/EZD-151.md section 4, T10; Scope: Q-0268 regression guard).
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/database.types';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import { sendOwnerAlert } from './alert-email';

const FROM = 'EZ Draft Test <test@example.test>';
const ENV_STUB = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: FROM };

describe('EZD-151 alert email subject', () => {
  beforeEach(() => {
    clearStubOutbox();
  });

  it('EZD-151 alert subject with a line break still emails the owner', async () => {
    const rpc = vi.fn();
    const result = await sendOwnerAlert({
      kind: 'error',
      alertId: 'a1',
      claim: 'c1',
      params: {
        kind: 'error',
        title: 'Error: first line\nsecond third',
        source: 'function',
        location: '/api/x',
        eventId: null,
      },
      tenantId: null,
      db: { rpc } as unknown as SupabaseClient<Database>,
      env: { ...ENV_STUB, ALERT_EMAIL_TO: 'owner@example.test' },
    });
    expect(result).toBe('emailed');
    const box = readStubOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].to).toBe('owner@example.test');
    expect(box[0].subject).toBe('New EZ Draft error: Error: first line second third');
    expect(rpc).not.toHaveBeenCalled();
  });
});
