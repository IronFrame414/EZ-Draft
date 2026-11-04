-- EZD-101 Step 5 (vault/plans/EZD-101.md): one row per switch per membership (03c). Keyed by membership because
-- app_user is tenant-less. Members read; EZD-106 adds the reviewed write path.
create table public.user_permission (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  membership_id uuid not null,
  permission_key text not null check (permission_key = any (array['view_projects','create_projects','edit_model','delete_projects','upload_references','add_markup','run_code_check','run_fast_renders','run_standard_renders','run_photoreal_renders','approve_renders','mark_client_ready','see_company_costs','see_sell_prices','edit_catalog','create_change_orders','flag_to_supplier','issue_permit_sets','issue_revisions','send_to_client','export','edit_field_tasks','check_off_tasks','photo_notes','flag_conflict','send_field_measurement','approve_field_measurements','settings_company','settings_users','settings_title_block','settings_sheet_presets','settings_defaults','settings_catalog','settings_render_models','settings_code_edition','settings_libraries','settings_system_status']::text[])),
  granted boolean not null,
  primary key (membership_id, permission_key),
  foreign key (membership_id, tenant_id) references public.membership (id, tenant_id) on delete cascade
);

create index user_permission_tenant_id_idx on public.user_permission (tenant_id);

alter table public.user_permission enable row level security;

create policy user_permission_select on public.user_permission
  for select to authenticated
  using (tenant_id = (select private.tenant_id()));

comment on table public.user_permission is 'Data model entity: user_permission (EZD-101)';

grant select on public.user_permission to authenticated;
grant select, insert, update, delete on public.user_permission to service_role;
