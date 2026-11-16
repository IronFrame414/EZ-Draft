// EZD-125 (S15d:45; Q-0188; Q-0697 decisions 03 "Auto release"): the server lock module's minutes reader and
// its error mapping with a stub client. Expected values: the registry default 5 (S15d:45) and a stored value
// (09o deadline row 2: 1 minute); 42501 / P0002 / 22023 as the EZD-120a mapping.
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { acquireLock, autoReleaseMinutes, readLock, releaseLock } from './lock';

const clientAnswering = (data: unknown, error: { code: string } | null = null) =>
  ({ rpc: vi.fn(async () => ({ data, error })) }) as unknown as SupabaseClient<Database>;

describe('EZD-125 server lock module', () => {
  it('AC-EZD-125-7 the auto-release minutes are the stored value, else the registry default', () => {
    expect(autoReleaseMinutes({})).toBe(5);
    expect(autoReleaseMinutes({ edit_lock_auto_release: 1 })).toBe(1);
    expect(autoReleaseMinutes({ edit_lock_auto_release: 1440 })).toBe(1440);
  });

  it('maps the function codes and parses the answers', async () => {
    expect(await acquireLock(clientAnswering(null, { code: '42501' }), 'p', null, null)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(
      await releaseLock(clientAnswering(null, { code: 'P0002' }), 'p', 'closed', 1, null),
    ).toEqual({ ok: false, code: 'project_not_found' });
    expect(
      await acquireLock(
        clientAnswering({ status: 'held', holder_app_user_id: 'b', since: 's', lock_epoch: 3 }),
        'p',
        'd',
        null,
      ),
    ).toEqual({ ok: true, status: 'held', holderAppUserId: 'b', since: 's', lockEpoch: 3 });
    const read = await readLock(
      clientAnswering({
        lock_epoch: 2,
        holder_app_user_id: null,
        holder_name: null,
        since: null,
        offline: false,
        my_request: null,
        requests: [],
        now: 'n',
      }),
      'p',
    );
    expect(read).toEqual({
      ok: true,
      lock: {
        lockEpoch: 2,
        holder: null,
        since: null,
        offline: false,
        myRequest: null,
        requests: [],
        now: 'n',
      },
    });
    await expect(
      releaseLock(clientAnswering(null, { code: '57014' }), 'p', 'closed', 1, null),
    ).rejects.toMatchObject({ code: '57014' });
  });
});
