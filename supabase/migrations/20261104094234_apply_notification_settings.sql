-- EZD-140 Step 3 (vault/plans/EZD-140.md section 1 Data M3; Decided D3, D4, D6; AC-EZD-140-2, -3; Q-0393,
-- Q-0453 (a)): notifications follow each person's settings. Redefines EZD-110a objects from
-- 20261102210537_create_notification.sql and 20261102210539_create_notification_functions.sql (never edited).
-- In app off: the row is stored with in_app = false, so it is not broadcast, not in notification_select (and
-- so not in list_notifications, which is security invoker), and not opened or marked by the two definer
-- functions. Email off: no notification_email job. Rows created before a change keep their in_app.

alter table public.notification add column in_app boolean not null default true;

alter policy notification_select on public.notification
  using (
    tenant_id = (select private.tenant_id())
    and user_id = (select private.app_user_id())
    and (
      project_id is null
      or (select private.all_projects())
      or project_id = any ((select private.listed_project_ids())::uuid[])
    )
    and in_app
  );

drop trigger notification_broadcast_created on public.notification;

create trigger notification_broadcast_created
  after insert on public.notification
  for each row when (new.in_app) execute function private.notification_broadcast_created();

create or replace function private.create_notification(
  p_tenant_id uuid,
  p_user_id uuid,
  p_kind text,
  p_project_id uuid,
  p_payload jsonb,
  p_link text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
  v_scope text;
  v_id uuid;
  v_in_app boolean;
  v_email boolean;
begin
  if p_tenant_id is null or p_user_id is null or p_kind is null or p_payload is null or p_link is null then
    raise exception 'invalid_notification' using errcode = '22023';
  end if;

  select m.id, m.scope into v_membership, v_scope
  from public.membership m
  where m.tenant_id = p_tenant_id and m.user_id = p_user_id and m.status = 'active';
  if v_membership is null then
    return null;
  end if;

  if p_project_id is not null then
    if not exists (
      select 1 from public.project p where p.id = p_project_id and p.tenant_id = p_tenant_id
    ) then
      return null;
    end if;
    if v_scope = 'listed' and not exists (
      select 1 from public.membership_project mp
      where mp.membership_id = v_membership and mp.project_id = p_project_id
    ) then
      return null;
    end if;
  end if;

  select s.in_app, s.email into v_in_app, v_email
  from public.notification_setting s
  where s.tenant_id = p_tenant_id and s.user_id = p_user_id and s.kind = p_kind;
  v_in_app := coalesce(v_in_app, true);
  v_email := coalesce(v_email, true);

  insert into public.notification (tenant_id, user_id, kind, project_id, payload, link, in_app)
  values (p_tenant_id, p_user_id, p_kind, p_project_id, p_payload, p_link, v_in_app)
  returning id into v_id;

  if v_email then
    insert into public.job (tenant_id, project_id, kind, payload, status, max_attempts, run_after)
    values (p_tenant_id, null, 'notification_email', jsonb_build_object('notificationId', v_id), 'queued', 5, now());
  end if;

  return v_id;
end
$$;

revoke all on function private.create_notification(uuid, uuid, text, uuid, jsonb, text) from public;

create or replace function public.open_notification(p_id uuid)
returns table (link text, project_id uuid, project_state text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid;
  v_user uuid;
  v_id uuid;
  v_link text;
  v_project uuid;
  v_read_at timestamptz;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  if v_tenant is null or v_user is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select n.id, n.link, n.project_id, n.read_at into v_id, v_link, v_project, v_read_at
  from public.notification n
  where n.id = p_id
    and n.tenant_id = v_tenant
    and n.user_id = v_user
    and (
      n.project_id is null
      or private.all_projects()
      or n.project_id = any (private.listed_project_ids())
    )
    and n.in_app
  for update;
  if v_id is null then
    return;
  end if;

  if v_read_at is null then
    update public.notification n set read_at = now() where n.id = v_id;
    begin
      perform private.broadcast_user(
        v_user,
        'notification.read',
        jsonb_build_object('notificationId', v_id)
      );
    exception when others then
      raise warning 'notification_broadcast_failed';
    end;
  end if;

  link := v_link;
  project_id := v_project;
  project_state := case
    when v_project is null then 'none'
    when exists (
      select 1 from public.project p where p.id = v_project and p.tenant_id = v_tenant
    ) then 'visible'
    else 'gone'
  end;
  return next;
end
$$;

revoke all on function public.open_notification(uuid) from public, anon, service_role;
grant execute on function public.open_notification(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_count integer;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  if v_tenant is null or v_user is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.notification n set read_at = now()
  where n.tenant_id = v_tenant
    and n.user_id = v_user
    and n.read_at is null
    and (
      n.project_id is null
      or private.all_projects()
      or n.project_id = any (private.listed_project_ids())
    )
    and n.in_app;
  get diagnostics v_count = row_count;

  if v_count > 0 then
    begin
      perform private.broadcast_user(
        v_user,
        'notification.read',
        jsonb_build_object('notificationId', null)
      );
    exception when others then
      raise warning 'notification_broadcast_failed';
    end;
  end if;
  return v_count;
end
$$;

revoke all on function public.mark_all_notifications_read() from public, anon, service_role;
grant execute on function public.mark_all_notifications_read() to authenticated;
