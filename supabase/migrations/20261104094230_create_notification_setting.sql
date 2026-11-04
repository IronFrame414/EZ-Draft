-- EZD-140 Step 1 (vault/plans/EZD-140.md section 1 Data M1; Decided D1, D2; Q-0220, Q-0393): one row per
-- (tenant, user, notification kind) with the In app and Email switches. No row means both on (D1). Members
-- read their own rows; rows are written only by public.save_my_notification_settings (no insert, update or
-- delete policy). The primary key's first column serves as the tenant index.
create table public.notification_setting (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  user_id uuid not null references public.app_user (id) on delete cascade,
  kind text not null check (kind in (
    'client_response', 'field_conflict', 'field_measurements_received', 'render_finished', 'edit_request',
    'sync_conflict', 'cleanup_due', 'render_allowance_refilled', 'field_pack_issued'
  )),
  in_app boolean not null default true,
  email boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, kind)
);

alter table public.notification_setting enable row level security;

create policy notification_setting_select on public.notification_setting for select to authenticated
  using (tenant_id = (select private.tenant_id()) and user_id = (select private.app_user_id()));

create policy notification_setting_api_gate on public.notification_setting as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select on public.notification_setting to authenticated;
grant select, insert, update, delete on public.notification_setting to service_role;

comment on table public.notification_setting is 'Data model entity: notification_setting (EZD-140)';
