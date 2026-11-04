-- EZD-110a Step 3 (vault/plans/EZD-110a.md section 1 Data M3; Decided D4, D10, D11, D13, D14; Q-0413,
-- Q-0425): the functions that create, list, open and mark notifications. Each public definer function runs
-- private.require_api_gate() first (EZD-190) and takes the tenant and user from the claim, raising 42501
-- not_authorized when either is missing. Events carry ids only (ARCH Realtime payload rule).

-- create_notification: the one way a notification is written (later kinds call it from triggers). Returns
-- null and inserts nothing when the person has no active membership in the tenant, the project is not in
-- the tenant, or a listed membership does not list the project. Otherwise the row and its
-- notification_email job are inserted in the same transaction (D4: no lost email).
create function private.create_notification(
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

  insert into public.notification (tenant_id, user_id, kind, project_id, payload, link)
  values (p_tenant_id, p_user_id, p_kind, p_project_id, p_payload, p_link)
  returning id into v_id;

  insert into public.job (tenant_id, project_id, kind, payload, status, max_attempts, run_after)
  values (p_tenant_id, null, 'notification_email', jsonb_build_object('notificationId', v_id), 'queued', 5, now());

  return v_id;
end
$$;

revoke all on function private.create_notification(uuid, uuid, text, uuid, jsonb, text) from public;

-- send_test_notification: the development page's sender (Q-0413). The caller sends one notification of any
-- kind to themself, link '/'. A project the caller cannot see, or a refusal from create_notification, is
-- 42501.
create function public.send_test_notification(p_kind text, p_project_id uuid, p_payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_id uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  if v_tenant is null or v_user is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_project_id is not null and not coalesce(private.can_see_project(p_project_id), false) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_id := private.create_notification(
    v_tenant, v_user, p_kind, p_project_id, coalesce(p_payload, '{}'::jsonb), '/'
  );
  if v_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return v_id;
end
$$;

revoke all on function public.send_test_notification(text, uuid, jsonb) from public, anon, service_role;
grant execute on function public.send_test_notification(text, uuid, jsonb) to authenticated;

-- list_notifications: one page of 20 (Q-0425) newest first, keyed by (created_at, id), with the unread
-- count (D14) and whether an older page exists. Invoker, so RLS limits the rows to the caller's own in
-- scope, and hides projects (and so names) the caller cannot see.
create function public.list_notifications(p_before_created_at timestamptz, p_before_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with page as (
    select n.* from public.notification n
    where p_before_created_at is null or (n.created_at, n.id) < (p_before_created_at, p_before_id)
    order by n.created_at desc, n.id desc
    limit 21
  ),
  shown as (
    select pg.* from page pg order by pg.created_at desc, pg.id desc limit 20
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'params', s.payload, 'link', s.link, 'projectId', s.project_id,
        'projectName', p.name, 'clientName', c.name, 'readAt', s.read_at, 'createdAt', s.created_at)
      order by s.created_at desc, s.id desc)
      from shown s
      left join public.project p on p.id = s.project_id
      left join public.customer c on c.id = p.customer_id), '[]'::jsonb),
    'unreadCount', (select count(*) from public.notification n where n.read_at is null),
    'hasMore', (select count(*) from page) > 20);
$$;

revoke all on function public.list_notifications(timestamptz, uuid) from public, anon, service_role;
grant execute on function public.list_notifications(timestamptz, uuid) to authenticated;

-- open_notification: the caller's own row in scope, locked. The first open sets read_at and pushes
-- notification.read { notificationId }; a second open changes nothing. project_state is none (no project),
-- gone (no project row in the tenant) or visible.
create function public.open_notification(p_id uuid)
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

-- mark_all_notifications_read: the caller's own unread rows in scope; one notification.read
-- { notificationId: null } when any changed. Returns how many were marked.
create function public.mark_all_notifications_read()
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
    );
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
