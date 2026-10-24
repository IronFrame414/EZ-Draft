-- EZD-101 Step 2 (vault/plans/EZD-101.md): roles. The four presets are fixed rows (preset not null); custom
-- roles have preset null and carry default_permissions, a set of keys that pre-ticks a new member's switches.
create table public.role (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  preset text check (preset in ('owner', 'designer', 'foreman', 'crew')),
  default_permissions text[] not null default '{}'
    check (default_permissions <@ array['view_projects','create_projects','edit_model','delete_projects','upload_references','add_markup','run_code_check','run_fast_renders','run_standard_renders','run_photoreal_renders','approve_renders','mark_client_ready','see_company_costs','see_sell_prices','edit_catalog','create_change_orders','flag_to_supplier','issue_permit_sets','issue_revisions','send_to_client','export','edit_field_tasks','check_off_tasks','photo_notes','flag_conflict','send_field_measurement','approve_field_measurements','settings_company','settings_users','settings_title_block','settings_sheet_presets','settings_defaults','settings_catalog','settings_render_models','settings_code_edition','settings_libraries','settings_system_status']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, preset)
);

create index role_tenant_id_idx on public.role (tenant_id);

create trigger role_set_updated_at
  before update on public.role
  for each row execute function public.set_updated_at();

-- A preset row can never be changed or deleted (S15 Decision 6). A delete that cascades from a tenant delete
-- passes, because the tenant row is already gone.
create function private.role_preset_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.preset is not null
      and exists (select 1 from public.tenant where id = old.tenant_id) then
      raise exception 'preset_role_change_refused' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.preset is not null or new.preset is not null then
    raise exception 'preset_role_change_refused' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.role_preset_guard() from public;

create trigger role_preset_guard
  before update or delete on public.role
  for each row execute function private.role_preset_guard();

alter table public.role enable row level security;

create policy role_select on public.role
  for select to authenticated
  using (tenant_id = (select private.tenant_id()));

create policy role_insert on public.role
  for insert to authenticated
  with check (tenant_id = (select private.tenant_id()) and preset is null);

create policy role_update on public.role
  for update to authenticated
  using (tenant_id = (select private.tenant_id()))
  with check (tenant_id = (select private.tenant_id()) and preset is null);

create policy role_delete on public.role
  for delete to authenticated
  using (tenant_id = (select private.tenant_id()));

comment on table public.role is 'Data model entity: role (EZD-101)';

grant select, insert, update, delete on public.role to authenticated;
grant select, insert, update, delete on public.role to service_role;
