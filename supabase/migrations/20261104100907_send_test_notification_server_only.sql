-- EZD-323 M1 (vault/plans/EZD-323.md section 1 Data M1; Decided D1, D2; AC-EZD-323-1): the /dev/notifications
-- sender is no longer executable by signed-in users. The EZD-110a version in
-- 20261102210539_create_notification_functions.sql (never edited) is dropped and replaced by one that takes
-- the recipient's membership id and is executable by service_role only. Tenant and person come from the
-- active membership row; scope checks stay in private.create_notification.

drop function public.send_test_notification(text, uuid, jsonb);

create function public.send_test_notification(
  p_membership_id uuid, p_kind text, p_project_id uuid, p_payload jsonb
)
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
  select m.tenant_id, m.user_id into v_tenant, v_user
  from public.membership m
  where m.id = p_membership_id and m.status = 'active';
  if v_tenant is null or v_user is null then
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

revoke all on function public.send_test_notification(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.send_test_notification(uuid, text, uuid, jsonb) to service_role;
