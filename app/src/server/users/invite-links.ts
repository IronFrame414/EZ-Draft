// EZD-138 (S15 Users + permissions, board S15j pending row; Q-0216; Q-0695 decisions 10 row 61; Q-0706): the
// link and 6-digit code of the pending invites on one Users page, for the viewer who may see them (the last
// sender or an active Owner-preset member; invite_links_for_viewer decides). The random value never leaves this
// function and nothing here is logged. Any failure rejects (the database error as is, a bad row or a missing
// key with a fixed code), so the list fails closed.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { InviteShown } from '../../lib/users/users';
import type { Database } from '../db/database.types';
import { inviteCode, inviteLink, inviteToken } from './invite-token';

const rowsSchema = z.array(z.object({ membershipId: z.string(), secret: z.string().min(1) }));

export async function loadInviteLinks(
  client: SupabaseClient<Database>,
  membershipIds: readonly string[],
): Promise<Map<string, InviteShown>> {
  const out = new Map<string, InviteShown>();
  if (membershipIds.length === 0) return out;
  const { data, error } = await client.rpc('invite_links_for_viewer', {
    p_membership_ids: [...membershipIds],
  });
  // The database error as is (no secret in it), so an ended session still answers as one (EZD-421).
  if (error) throw error;
  try {
    for (const row of rowsSchema.parse(data)) {
      out.set(row.membershipId, {
        link: inviteLink(inviteToken(row.secret)),
        code: inviteCode(row.secret),
      });
    }
  } catch {
    throw new Error('invite_links_failed');
  }
  return out;
}
