-- EZD-102 Step 2 (vault/plans/EZD-102.md): user_permission.updated {} on the user channel (EZD-018) after
-- any change to a member's switches, so the open page refetches its set (AC-EZD-102-4). Statement level
-- with transition tables: one event per distinct member per statement, however many rows changed (11 rule
-- 11). The payload is empty: a subscriber refetches through GET /api/permissions (EZD-018 payload rule).
-- A failed send never rolls back the permission write it reports. A membership deleted in the same
-- statement joins no row and sends nothing (its sessions end anyway, EZD-006).
create function private.user_permission_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct m.user_id
    from changed c
    join public.membership m on m.id = c.membership_id
  loop
    begin
      perform private.broadcast_user(r.user_id, 'user_permission.updated', '{}'::jsonb);
    exception when others then
      raise warning 'user_permission_broadcast_failed';
    end;
  end loop;
  return null;
end
$$;

revoke all on function private.user_permission_broadcast() from public;

create trigger user_permission_broadcast_insert
  after insert on public.user_permission
  referencing new table as changed
  for each statement execute function private.user_permission_broadcast();

create trigger user_permission_broadcast_update
  after update on public.user_permission
  referencing new table as changed
  for each statement execute function private.user_permission_broadcast();

create trigger user_permission_broadcast_delete
  after delete on public.user_permission
  referencing old table as changed
  for each statement execute function private.user_permission_broadcast();
