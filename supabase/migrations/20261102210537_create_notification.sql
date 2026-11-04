-- EZD-110a Step 2 (vault/plans/EZD-110a.md section 1 Data M2; Decided D1, D2, D3, D13; 04 Notifications):
-- one row per notification for one person. project_id has no foreign key, so a notification keeps its
-- project id after the project is deleted (AC-EZD-110-7, D3). link is a checked relative path with no
-- "//", "/\", spaces or control characters (D2: no open redirect). The payload holds the title params only
-- (strings shown to the recipient). Members read their own rows; rows are written only by definer
-- functions and the email job (no insert, update or delete policy).
create table public.notification (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  user_id uuid not null references public.app_user (id) on delete cascade,
  kind text not null check (kind in (
    'client_response', 'field_conflict', 'field_measurements_received', 'render_finished', 'edit_request',
    'sync_conflict', 'cleanup_due', 'render_allowance_refilled', 'field_pack_issued'
  )),
  project_id uuid,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4096),
  link text not null
    check (length(link) <= 2048 and link ~ '^/([^/\\].*)?$' and link !~ '[[:cntrl:][:space:]]'),
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_params_check check (
    case kind
      when 'edit_request' then coalesce(jsonb_typeof(payload -> 'name') = 'string', false)
      when 'client_response' then coalesce(payload ->> 'action' in ('approved', 'commented'), false)
        and coalesce(jsonb_typeof(payload -> 'version') = 'string', false)
      else true
    end
  )
);

create index notification_tenant_id_idx on public.notification (tenant_id);
create index notification_project_id_idx on public.notification (project_id);
create index notification_user_list_idx on public.notification (user_id, created_at desc, id desc);
create index notification_user_unread_idx on public.notification (user_id) where read_at is null;

alter table public.notification enable row level security;

create policy notification_select on public.notification for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and user_id = (select private.app_user_id())
    and (
      project_id is null
      or (select private.all_projects())
      or project_id = any ((select private.listed_project_ids())::uuid[])
    )
  );

create policy notification_api_gate on public.notification as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select on public.notification to authenticated;
grant select, insert, update, delete on public.notification to service_role;

comment on table public.notification is 'Data model entity: notification (EZD-110a)';

-- notification.created { notificationId } on user:<user_id> after each insert (D13; ARCH Realtime payload
-- rule: ids only). A failed send never rolls back the notification.
create function private.notification_broadcast_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.broadcast_user(
      new.user_id,
      'notification.created',
      jsonb_build_object('notificationId', new.id)
    );
  exception when others then
    raise warning 'notification_broadcast_failed';
  end;
  return null;
end
$$;

revoke all on function private.notification_broadcast_created() from public;

create trigger notification_broadcast_created
  after insert on public.notification
  for each row execute function private.notification_broadcast_created();
