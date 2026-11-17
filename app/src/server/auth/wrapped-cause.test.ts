// EZD-421 (Q-0753 (a)): modules that wrap a database error in their own Error keep it as `cause`, so the
// ended-session rule still sees a 42501 (sessionLossForm, server/auth/ended-session.ts). Stub clients; no
// database. 42501 is the denied privilege an anon call gets (EZD-395; Q-0052 (c)).
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '../db/database.types';
import { getMyAiKeyState, loadUserAiKeyForCall } from '../assistant/user-key';
import { sessionLossForm } from './ended-session';
import { throttleSettle, throttleTake } from './throttle';

const DENIED = { code: '42501', details: null, hint: null, message: 'permission denied' };
const failing = (error: unknown) =>
  ({ rpc: async () => ({ data: null, error }) }) as unknown as SupabaseClient<Database>;

async function thrown(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
}

describe('EZD-421 wrapped database errors keep their cause', () => {
  it('C1 the AI key reads: a denied get_my_ai_key is a session-loss form', async () => {
    expect(sessionLossForm(await thrown(getMyAiKeyState(failing(DENIED))))).toBe(true);
    expect(sessionLossForm(await thrown(loadUserAiKeyForCall(failing(DENIED))))).toBe(true);
  });

  it('C2 the throttle: a denied take or settle is a session-loss form; another failure is not', async () => {
    expect(sessionLossForm(await thrown(throttleTake(failing(DENIED), 'password', 'e', null)))).toBe(true);
    expect(sessionLossForm(await thrown(throttleSettle(failing(DENIED), 'a1', null)))).toBe(true);
    const down = { code: '57014', details: null, hint: null, message: 'canceling statement' };
    expect(sessionLossForm(await thrown(throttleTake(failing(down), 'password', 'e', null)))).toBe(false);
  });
});
