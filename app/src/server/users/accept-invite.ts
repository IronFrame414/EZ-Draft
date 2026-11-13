// EZD-105 (Q-0695 decisions 10 row 61; Q-0043; AC-EZD-105-4, -7, -8): accepting an invite from its link.
// Order: the token is checked and looked up by its sha-256; accept_invite runs as the one database step
// (token, live for 7 days from the last send, no other active company, membership active, invite accepted,
// user.joined event_log row); only after it commits is the session made: an admin magic-link token for the
// person's email, verified on this request's session client so the cookies are set here, then completeSignIn
// (links the app_user and refreshes the token so it carries the company). user.joined is emitted with
// via invite_link (log_only; written in the accept transaction, so the sink skips it).
// 'refused' means nothing changed and no session: an unknown, expired, used or cancelled link, or an email
// active in another company. Any other failure rejects, and no session is left on this device.
import { errorType } from '../errors/fingerprint';
import { reportError } from '../errors/report';
import { emit } from '../events';
import { requestIp } from '../events/event-log';
import { acceptInviteByHash, magicLinkTokenHash } from '../auth/admin-auth';
import { completeSignIn } from '../auth/complete-sign-in';
import { createSessionClient } from '../auth/supabase-server';
import { inviteTokenHash, isInviteToken } from './invite-token';

export async function acceptInviteByToken(token: string): Promise<'accepted' | 'refused'> {
  if (!isInviteToken(token)) return 'refused';
  const accepted = await acceptInviteByHash(inviteTokenHash(token), await requestIp());
  if (accepted.status === 'refused') return 'refused';

  const client = createSessionClient();
  const link = await magicLinkTokenHash(accepted.email);
  const { error } = await client.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
  if (error) {
    await client.auth.signOut({ scope: 'local' });
    throw new Error('invite_session_failed');
  }
  if ((await completeSignIn(client)) !== 'ok') throw new Error('invite_session_failed');

  try {
    await emit(
      'user.joined',
      { membershipId: accepted.membershipId, appUserId: accepted.appUserId, via: 'invite_link' },
      { tenantId: accepted.tenantId, actorId: accepted.appUserId },
    );
  } catch (e) {
    // The acceptance is committed; a failed emit does not fail it (complete-sign-in.ts pattern).
    await reportError(new Error('user_joined_event_failed'), {
      source: 'function',
      location: 'invite.accept',
      tags: { 'ezd.cause': errorType(e) },
    });
  }
  return 'accepted';
}
