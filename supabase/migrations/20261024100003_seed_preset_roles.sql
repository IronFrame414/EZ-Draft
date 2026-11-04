-- EZD-101 Step 3 (vault/plans/EZD-101.md): every company gets the four preset roles. Idempotent.
create function private.seed_preset_roles(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.role (tenant_id, name, preset, default_permissions)
  select p_tenant_id, v.name, v.preset, private.preset_permissions(v.preset)
  from (values ('Owner', 'owner'), ('Designer', 'designer'), ('Foreman', 'foreman'), ('Crew', 'crew'))
    as v (name, preset)
  on conflict (tenant_id, preset) do nothing;
end;
$$;

revoke all on function private.seed_preset_roles(uuid) from public;

create function private.tenant_seed_preset_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_preset_roles(new.id);
  return null;
end;
$$;

revoke all on function private.tenant_seed_preset_roles() from public;

create trigger tenant_seed_preset_roles
  after insert on public.tenant
  for each row execute function private.tenant_seed_preset_roles();

select private.seed_preset_roles(id) from public.tenant;
