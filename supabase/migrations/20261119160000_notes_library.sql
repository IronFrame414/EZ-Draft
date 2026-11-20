-- EZD-714 (S15h Notes; S15c Required notes; AC-EZD-714-1): the company notes library and a profile's required
-- notes.
--
-- 1. A note is a library_item of kind 'note'. Its name is the note text, so a note may be longer than the
--    120-character name of the other kinds (up to 1000). data holds { group: 'general' | 'code',
--    projectTypes: [...] } (project types as project.type). Notes keep the order they were added in (created_at,
--    id), which is the order a set prints them (assumptions EZD-714).
-- 2. submittal_profile.required_notes may hold only ids of the profile's own company's notes: a trigger checks
--    every insert and update (23514, which update_submittal_profile turns into invalid_input).
-- 3. A deleted note leaves every profile's required notes (a definer trigger; members cannot update profiles).
-- 4. Every company starts with the seven general notes of the S13 board for every project type (assumptions
--    EZD-714): companies that exist now here, local ones in supabase/seed.sql (the EZD-401 / EZD-712 pattern;
--    no tenant trigger).

alter table public.library_item drop constraint if exists library_item_name_check;
alter table public.library_item add constraint library_item_name_check check (
  length(btrim(name)) > 0
  and length(name) <= case when kind = 'note' then 1000 else 120 end
);
create index library_item_note_order_idx on public.library_item (tenant_id, created_at, id)
  where kind = 'note';

-- 2. Required notes are notes of the profile's company, each once.
create function private.check_submittal_profile_required_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cardinality(new.required_notes) > 0 and (
    cardinality(array(select distinct n from unnest(new.required_notes) as n)) <> cardinality(new.required_notes)
    or exists (
      select 1 from unnest(new.required_notes) as n
      where not exists (
        select 1 from public.library_item i
        where i.id = n and i.tenant_id = new.tenant_id and i.kind = 'note'))
  ) then
    raise exception 'required_notes_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.check_submittal_profile_required_notes() from public, anon, authenticated, service_role;
create trigger submittal_profile_required_notes_check
  before insert or update of required_notes on public.submittal_profile
  for each row execute function private.check_submittal_profile_required_notes();

-- 3. A deleted note leaves the profiles that required it.
create function private.drop_deleted_required_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A company being deleted takes its profiles with it; nothing to tidy.
  if old.kind = 'note' and exists (select 1 from public.tenant t where t.id = old.tenant_id) then
    update public.submittal_profile s set required_notes = array_remove(s.required_notes, old.id)
    where s.tenant_id = old.tenant_id and old.id = any (s.required_notes);
  end if;
  return old;
end
$$;
revoke all on function private.drop_deleted_required_note() from public, anon, authenticated, service_role;
create trigger library_item_drop_required_note
  after delete on public.library_item
  for each row execute function private.drop_deleted_required_note();

-- 4. The starting general notes (S13 board GENERAL NOTES, in board order), once per company.
create function private.seed_general_notes(p_tenant uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.library_item (tenant_id, kind, name, data, created_at, updated_at)
  select p_tenant, 'note', v.text,
    jsonb_build_object('group', 'general', 'projectTypes',
      jsonb_build_array('kitchen', 'bath', 'whole_home_interior')),
    -- In board order and before anything the company adds later.
    now() - (8 - v.ord) * interval '1 millisecond', now() - (8 - v.ord) * interval '1 millisecond'
  from (values
    (1, 'Verify all dimensions in field before ordering cabinets.'),
    (2, 'All work to comply with the Florida Building Code in effect at time of permit, and local amendments.'),
    (3, 'Dimensions are to face of finished wall or face of cabinet box unless noted otherwise.'),
    (4, 'Cabinet codes per cabinet schedule. See A4.0.'),
    (5, 'Details per A5.0. Reflected ceiling per A6.0.'),
    (6, 'Electrical, lighting and load calc per E1.0 and E2.0.'),
    (7, 'Protect existing finishes to remain. Contractor to patch and match at all disturbed surfaces.')
  ) as v(ord, text)
  where not exists (
    select 1 from public.library_item i where i.tenant_id = p_tenant and i.kind = 'note');
$$;
revoke all on function private.seed_general_notes(uuid) from public, anon, authenticated, service_role;

select private.seed_general_notes(id) from public.tenant;
