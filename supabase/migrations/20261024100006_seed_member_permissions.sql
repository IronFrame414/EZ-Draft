-- EZD-101 Step 6 (vault/plans/EZD-101.md): a new membership gets its preset's role and its 37 switches.
-- Existing rows are never changed.
create function private.seed_member_permissions(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
  select m.tenant_id, m.id, k, k = any (r.default_permissions)
  from public.membership m
  join public.role r on r.id = m.role_id and r.tenant_id = m.tenant_id
  cross join unnest(private.permission_keys()) as k
  where m.id = p_membership_id
  on conflict (membership_id, permission_key) do nothing;
end;
$$;

revoke all on function private.seed_member_permissions(uuid) from public;

create function private.membership_default_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role_id is null then
    select r.id into new.role_id
    from public.app_user u
    join public.role r on r.tenant_id = new.tenant_id and r.preset = u.role_preset
    where u.id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.membership_default_role() from public;

create trigger membership_default_role
  before insert on public.membership
  for each row execute function private.membership_default_role();

create function private.membership_seed_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_member_permissions(new.id);
  return null;
end;
$$;

revoke all on function private.membership_seed_permissions() from public;

create trigger membership_seed_permissions
  after insert on public.membership
  for each row execute function private.membership_seed_permissions();

update public.membership m
set role_id = r.id
from public.app_user u, public.role r
where m.role_id is null and u.id = m.user_id and r.tenant_id = m.tenant_id and r.preset = u.role_preset;

select private.seed_member_permissions(id) from public.membership;
