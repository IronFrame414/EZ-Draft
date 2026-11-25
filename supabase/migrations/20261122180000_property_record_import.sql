-- EZD-711 (S01 Property appraiser link "user confirms each field"; S13 Controls "Property appraiser import ... Edit
-- model"; S13 Decision 9; 03c property_record; AC-EZD-711-1, -2): the reviewed write path EZD-710 left for this
-- ticket. set_property_record saves the fields the member confirmed (unconfirmed fields are sent as null and stored
-- as null), records who confirmed them and the page link, and links the record to the project. A project holds one
-- record: a second import replaces the fields of the record it already has. There is still no member write policy
-- on property_record; this security definer function is the only member write. No foreign key from
-- project.property_record_id (vault/build/assumptions.md EZD-711): the function only ever stores the id of a record
-- of the same company that it wrote itself.
create function public.set_property_record(
  p_project uuid,
  p_parcel_no text,
  p_owner text,
  p_legal_description text,
  p_year_built integer,
  p_living_area integer,
  p_source_url text
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
  v_membership uuid;
  v_record uuid;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'edit_model'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  select p.property_record_id into v_record
    from public.project p
    where p.id = p_project and p.tenant_id = v_tenant
    for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- The project's id may name a record of another company or none at all (no foreign key): only a record of this
  -- company is updated, otherwise a new one is written.
  if v_record is not null and not exists (
    select 1 from public.property_record r where r.id = v_record and r.tenant_id = v_tenant
  ) then
    v_record := null;
  end if;

  begin
    if v_record is null then
      insert into public.property_record
        (tenant_id, parcel_no, owner, legal_description, year_built, living_area, source_url, confirmed_by)
      values
        (v_tenant, nullif(btrim(p_parcel_no), ''), nullif(btrim(p_owner), ''),
         nullif(btrim(p_legal_description), ''), p_year_built, p_living_area, nullif(btrim(p_source_url), ''), v_user)
      returning id into v_record;
      update public.project p set property_record_id = v_record where p.id = p_project and p.tenant_id = v_tenant;
    else
      update public.property_record r
        set parcel_no = nullif(btrim(p_parcel_no), ''),
            owner = nullif(btrim(p_owner), ''),
            legal_description = nullif(btrim(p_legal_description), ''),
            year_built = p_year_built,
            living_area = p_living_area,
            source_url = nullif(btrim(p_source_url), ''),
            confirmed_by = v_user
        where r.id = v_record and r.tenant_id = v_tenant;
    end if;
  exception when check_violation then
    raise exception 'invalid_input' using errcode = '22023';
  end;

  return v_record;
end
$$;

revoke all on function public.set_property_record(uuid, text, text, text, integer, integer, text)
  from public, anon, service_role;
grant execute on function public.set_property_record(uuid, text, text, text, integer, integer, text) to authenticated;

-- The appraiser read's progress on the reader's own user channel (11 rule 11 "Push, not poll"). job_broadcast pushes
-- only project jobs, and the New project wizard reads before the project exists (a job with no project), so each
-- property appraiser read is also pushed to the member who started it, from the wizard and from Sheets alike. Ids,
-- statuses and counters only (EZD-018 payload rule); a failed send never rolls back the job write.
create function private.appraiser_read_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'ai_read'
    and new.created_by is not null
    and coalesce(new.payload ->> 'purpose', '') like 'property\_appraiser.%'
    and (tg_op = 'INSERT'
      or new.status is distinct from old.status
      or new.progress is distinct from old.progress) then
    begin
      perform private.broadcast_user(
        new.created_by,
        'job.progress',
        jsonb_build_object(
          'jobId', new.id,
          'kind', new.kind,
          'status', new.status,
          'progress', new.progress,
          'attempts', new.attempts
        )
      );
    exception when others then
      raise warning 'appraiser_read_broadcast_failed';
    end;
  end if;
  return null;
end
$$;

revoke all on function private.appraiser_read_broadcast() from public;

create trigger appraiser_read_broadcast
  after insert or update on public.job
  for each row execute function private.appraiser_read_broadcast();
