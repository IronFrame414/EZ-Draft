-- EZD-612 (phase-06 EZD-612 row "accept a warning with a note (Edit model; no lock needed)"; AC-EZD-612-3; 03c
-- code_check_run accepted_notes; vault/build/assumptions.md EZD-612 "Accepted warnings on the next run"): writes to
-- code_check_run.accepted_notes. The table has only a select policy, so both writes are definer functions.
--
-- 1. accept_code_warning(p_run, p_rule, p_object, p_note): the caller needs Edit model (no edit lock) and sight of
--    the run's project (42501 otherwise, so a hidden run says nothing). The run must be the project's latest
--    (40001 run_not_latest), the note trimmed and 1 to 2,000 characters, and the run must hold a failing result of
--    that rule on that object (22023). The entry keeps the rule, object, edition, note, who (id and name at the time),
--    when, and the object's updated_seq then (null when the object is not stored). A second accept of the same
--    warning replaces the first. Returns the entry.
-- 2. carry_code_check_acceptances(p_run): the caller who recorded the run (Run code check and sight of the project)
--    copies the previous run's acceptances that still apply: the same rule, object and edition still fail, and the
--    object's updated_seq is unchanged (an edited object lifts its acceptance). Who and when are kept. Only a run with
--    no acceptances yet is filled. Returns the number carried.
create function public.accept_code_warning(
  p_run uuid,
  p_rule text,
  p_object uuid,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_user uuid := private.app_user_id();
  v_run public.code_check_run%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
  v_seq integer;
  v_name text;
  v_entry jsonb;
begin
  perform private.require_api_gate();
  if v_tenant is null or v_membership is null or p_run is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select * into v_run from public.code_check_run r where r.id = p_run and r.tenant_id = v_tenant;
  if not found or not exists (
    select 1 from public.user_permission up
    join public.membership m on m.id = up.membership_id and m.tenant_id = up.tenant_id
    where up.membership_id = v_membership and up.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'edit_model' and up.granted
  ) or not private.can_see_project(v_run.project_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.code_check_run r
    where r.project_id = v_run.project_id and r.tenant_id = v_tenant
      and (r.created_at > v_run.created_at or (r.created_at = v_run.created_at and r.id > v_run.id))
  ) then
    raise exception 'run_not_latest' using errcode = '40001';
  end if;
  if p_rule is null or p_object is null or char_length(v_note) < 1 or char_length(v_note) > 2000
    or not exists (
      select 1 from jsonb_array_elements(v_run.warnings) w
      where w ->> 'ruleId' = p_rule and w ->> 'objectId' = p_object::text and w ->> 'status' = 'fail'
    ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select o.updated_seq into v_seq from public.model_object o
  where o.project_id = v_run.project_id and o.object_id = p_object and o.tenant_id = v_tenant and not o.deleted;
  select u.name into v_name from public.app_user u where u.id = v_user;

  v_entry := jsonb_build_object(
    'ruleId', p_rule,
    'objectId', p_object::text,
    'edition', v_run.edition,
    'note', v_note,
    'by', v_user,
    'byName', v_name,
    'at', clock_timestamp(),
    'objectSeq', v_seq
  );
  update public.code_check_run r
  set accepted_notes = coalesce((
      select jsonb_agg(e) from jsonb_array_elements(r.accepted_notes) e
      where not (e ->> 'ruleId' = p_rule and e ->> 'objectId' = p_object::text)
    ), '[]'::jsonb) || jsonb_build_array(v_entry)
  where r.id = v_run.id;
  return v_entry;
end;
$$;

revoke all on function public.accept_code_warning(uuid, text, uuid, text) from public, anon, service_role;
grant execute on function public.accept_code_warning(uuid, text, uuid, text) to authenticated;

create function public.carry_code_check_acceptances(p_run uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_run public.code_check_run%rowtype;
  v_prev public.code_check_run%rowtype;
  v_kept jsonb;
begin
  perform private.require_api_gate();
  if v_tenant is null or v_membership is null or p_run is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select * into v_run from public.code_check_run r where r.id = p_run and r.tenant_id = v_tenant;
  if not found or v_run.created_by is distinct from private.app_user_id() or not exists (
    select 1 from public.user_permission up
    join public.membership m on m.id = up.membership_id and m.tenant_id = up.tenant_id
    where up.membership_id = v_membership and up.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'run_code_check' and up.granted
  ) or not private.can_see_project(v_run.project_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if jsonb_array_length(v_run.accepted_notes) > 0 then
    return 0;
  end if;

  select * into v_prev from public.code_check_run r
  where r.project_id = v_run.project_id and r.tenant_id = v_tenant and r.id <> v_run.id
    and (r.created_at < v_run.created_at or (r.created_at = v_run.created_at and r.id < v_run.id))
  order by r.created_at desc, r.id desc
  limit 1;
  if not found then
    return 0;
  end if;

  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_kept
  from jsonb_array_elements(v_prev.accepted_notes) e
  where exists (
      select 1 from jsonb_array_elements(v_run.warnings) w
      where w ->> 'ruleId' = e ->> 'ruleId' and w ->> 'objectId' = e ->> 'objectId'
        and w ->> 'edition' = e ->> 'edition' and w ->> 'status' = 'fail'
    )
    and (
      select o.updated_seq from public.model_object o
      where o.project_id = v_run.project_id and o.tenant_id = v_tenant and not o.deleted
        and o.object_id::text = e ->> 'objectId'
    ) is not distinct from (e ->> 'objectSeq')::integer;

  update public.code_check_run r set accepted_notes = v_kept where r.id = v_run.id;
  return jsonb_array_length(v_kept);
end;
$$;

revoke all on function public.carry_code_check_acceptances(uuid) from public, anon, service_role;
grant execute on function public.carry_code_check_acceptances(uuid) to authenticated;
