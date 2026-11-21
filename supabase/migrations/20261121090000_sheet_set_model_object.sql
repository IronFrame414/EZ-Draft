-- EZD-726 (03b Architecture rule 3; 13b R3; 03d sheet_set; S13 Set selector and Decision 10; AC-EZD-726-1): a
-- project's sheet sets are model objects (type sheet_set), saved, versioned, frozen and reverted with the model.
-- There is no sheet_set table: the 03d row gives the object's fields
-- (packages/geometry/src/schema/sheet-set.ts). No new table, policy or grant: a set is read and written as any
-- other model_object row, under that table's RLS and save functions.
--
-- The level check (20261105210000) lets a sheet_set row through without a level: a set belongs to the whole
-- project, as a floor does. Copied with that one change; part (b) is untouched (a set names no floor).
--
-- No set is stored when a project is made: a set that has never been changed is the default one, worked out on
-- read (app/src/server/sheets/sheets.ts), so every project, new or old, and every earlier version reads as exactly
-- one permit set and one client set (vault/build/assumptions.md EZD-726).
create or replace function private.model_object_level_check()
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

  -- (a) a live row that is neither a floor nor a sheet set names a live floor of the project; a missing or
  -- non-uuid level names none.
  if not v_row.deleted and v_row.type not in ('floor', 'sheet_set') then
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
