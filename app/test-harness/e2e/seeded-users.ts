// EZD-180 (vault/plans/EZD-180.md section 1, Step 1; Q-0315): the five seeded people and the restore that hands
// them back unlinked after the browser tests. A browser sign-in links the seeded app_user row to its auth user;
// deleting that auth user sets auth_user_id back to null (supabase/migrations create_app_user). Ids only in messages.
import { adminDb, harnessSql } from '../rls/fixtures';
import {
  CREW_EMAIL,
  CREW_USER_ID,
  DESIGNER_EMAIL,
  DESIGNER_USER_ID,
  FOREMAN_EMAIL,
  FOREMAN_USER_ID,
  JOSH_EMAIL,
  JOSH_USER_ID,
  TENANT_2_OWNER_EMAIL,
  TENANT_2_OWNER_USER_ID,
} from '../../test-utils/seed-ids';

export type SeededUser = { readonly id: string; readonly email: string };
export type DeleteAuthUser = (authUserId: string) => Promise<void>;

// The seeded app_user rows, in this order (EZD-005b, EZD-016c, EZD-101). T5 ties this list to the database.
export const SEEDED_USERS: readonly SeededUser[] = Object.freeze([
  Object.freeze({ id: JOSH_USER_ID, email: JOSH_EMAIL }),
  Object.freeze({ id: DESIGNER_USER_ID, email: DESIGNER_EMAIL }),
  Object.freeze({ id: FOREMAN_USER_ID, email: FOREMAN_EMAIL }),
  Object.freeze({ id: CREW_USER_ID, email: CREW_EMAIL }),
  Object.freeze({ id: TENANT_2_OWNER_USER_ID, email: TENANT_2_OWNER_EMAIL }),
]);

export async function deleteAuthUserOrThrow(authUserId: string): Promise<void> {
  const { error } = await adminDb().auth.admin.deleteUser(authUserId);
  if (error) {
    throw new Error(`restore of seeded users failed: deleteUser ${error.code ?? error.status}`);
  }
}

// Deletes the auth users of the given people (found by their link and by their email), then checks that none
// of them is still linked and none of the emails has an auth user. Throws on the first failed delete.
export async function restoreSeededUsers(
  users: readonly SeededUser[],
  deleteAuthUser: DeleteAuthUser = deleteAuthUserOrThrow,
): Promise<void> {
  if (users.length === 0) return;
  const emails = users.map((u) => u.email.toLowerCase());
  const ids = users.map((u) => u.id);
  const sql = harnessSql();

  const found = await sql`
    select id::text as id from auth.users where lower(email) = any(${emails}::text[])
    union
    select auth_user_id::text as id from public.app_user
    where id = any(${ids}::uuid[]) and auth_user_id is not null`;
  const authUserIds = [...new Set(found.map((r) => String(r.id)))].sort();
  for (const authUserId of authUserIds) {
    await deleteAuthUser(authUserId);
  }

  const linked = await sql`
    select id::text as id from public.app_user
    where id = any(${ids}::uuid[]) and auth_user_id is not null
    order by id`;
  const left = await sql`
    select count(*)::int as n from auth.users where lower(email) = any(${emails}::text[])`;
  const linkedIds = linked.map((r) => String(r.id));
  const authLeft = Number(left[0].n);
  if (linkedIds.length > 0 || authLeft > 0) {
    throw new Error(
      `seeded users not restored: linked ${linkedIds.join(',') || 'none'}, auth users left ${authLeft}`,
    );
  }
}
