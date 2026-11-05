-- EZD-202 Build step 11 (vault/plans/EZD-202.md section 1 Decided "M1 SQL"; AC-EZD-202-5; Q-0530; Q-0540;
-- Q-0509; Q-0511 (c)): every live non-floor object names a live floor of its own project in `data.level`, and a
-- floor that live objects name is not deleted or retyped. Deferred to commit, so a floor added, restored or
-- deleted together with its objects in one save passes. The error carries the id of the object at fault.
create function private.model_object_level_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.model_object;
  v_level text;
  v_blocker uuid;
begin
  -- The row as it stands at commit, not as this event left it.
  select o.* into v_row from public.model_object o
  where o.project_id = new.project_id and o.object_id = new.object_id;
  if not found then
    return null;
  end if;

  -- (a) a live non-floor row names a live floor of the project; a missing or non-uuid level names none.
  if not v_row.deleted and v_row.type <> 'floor' then
    v_level := v_row.data ->> 'level';
    if coalesce(v_level !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true) then
      raise exception using errcode = '23503', message = 'level_not_found', detail = v_row.object_id::text;
    end if;
    if not exists (
      select 1 from public.model_object f
      where f.project_id = v_row.project_id
        and f.object_id = v_level::uuid
        and f.type = 'floor'
        and not f.deleted
    ) then
      raise exception using errcode = '23503', message = 'level_not_found', detail = v_row.object_id::text;
    end if;
  end if;

  -- (b) a floor deleted or retyped while a live non-floor row still names it: the lowest such id.
  if tg_op = 'UPDATE' and old.type = 'floor' and (v_row.deleted or v_row.type <> 'floor') then
    select o.object_id into v_blocker from public.model_object o
    where o.project_id = v_row.project_id
      and not o.deleted
      and o.type <> 'floor'
      and lower(o.data ->> 'level') = v_row.object_id::text
    order by o.object_id
    limit 1;
    if found then
      raise exception using errcode = '23503', message = 'level_not_found', detail = v_blocker::text;
    end if;
  end if;

  return null;
end
$$;

revoke all on function private.model_object_level_check() from public;

create constraint trigger model_object_level_check
  after insert or update on public.model_object
  deferrable initially deferred
  for each row execute function private.model_object_level_check();
