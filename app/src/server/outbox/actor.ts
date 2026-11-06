// EZD-120d Build step 7 (vault/plans/EZD-120d.md section 3 and Decided "loadOutboxActor"; Q-0503): who is
// signed in, as the device outbox knows them (app user, company, membership). Null when signed out or without
// an active membership; a failed read rejects.
import type { Actor } from '../../lib/outbox/outbox';
import { getSession } from '../auth/session';
import { createSessionClient } from '../auth/supabase-server';
import { currentTenantId } from '../company/company';
import { getPermissionContext } from '../permissions';

export async function loadOutboxActor(): Promise<Actor | null> {
  const session = await getSession();
  if (session === null) return null;
  const ctx = await getPermissionContext();
  if (ctx === null) return null;
  const tenantId = await currentTenantId(createSessionClient());
  if (tenantId === null) return null;
  return { appUserId: session.appUserId, tenantId, membershipId: ctx.membershipId };
}
