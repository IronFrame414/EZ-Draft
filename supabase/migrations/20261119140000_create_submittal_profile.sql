-- EZD-712 (S15c; 03c submittal_profile; 08 Department submittal rules; Q-0193; Q-0203; Q-0399; AC-EZD-712-1):
-- submittal profiles (Settings > Sheet presets) and the company default for new projects.
--
-- 1. public.submittal_profile: every 03c column with the S15c defaults, so EZD-713 adds controls, not columns.
--    One default per company (partial unique index), the department name unique per company ignoring case,
--    archived_at for "archive instead". Members read their own company's rows; there is no insert, update or delete
--    policy, so every write goes through the definer functions below, which check settings_sheet_presets.
-- 2. Every company has one default profile: existing companies get one here and supabase/seed.sql seeds local
--    ones (the EZD-401 catalog pattern; no tenant trigger, see below). Seed: Palm Beach County (Q-0193 builds unincorporated PBC first), 10 MB
--    and 80 characters (08 PBC row), every other value the S15c default (assumptions EZD-712).
-- 3. A new project stores the company default (AC-EZD-712-1): a before-insert trigger on project fills a null
--    submittal_profile_id, so create_project, create_project_with_objects and any later path agree. The id is
--    stored, so a later "Set as default" changes new projects only. project (submittal_profile_id, tenant_id)
--    references submittal_profile (id, tenant_id): a project never points at another company's profile.
-- 4. Projects that exist now take their company's default (backfill below). set_project_submittal_profile is the
--    Project settings pick (Edit model, an active profile of the caller's company).
-- 5. Writes: create_submittal_profile (New profile copies the default; Duplicate copies the given one),
--    update_submittal_profile (field changes; the table checks the values), set_default_submittal_profile,
--    archive_submittal_profile and delete_submittal_profile. The default cannot be archived or deleted; a deleted
--    profile's projects move to the default. "Used by a sent set" waits for sheet sets (EZD-726; assumptions).

create table public.submittal_profile (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  department text not null check (length(btrim(department)) between 1 and 200 and department = btrim(department)),
  is_default boolean not null default false,
  submittal_type text not null default 'electronic' check (submittal_type in ('electronic', 'paper')),
  -- Permit profiles are fixed at 24x36 (S15c Decision 3; Round 25).
  sheet_size text not null default '24x36' check (sheet_size = '24x36'),
  file_split text not null default 'combined' check (file_split in ('combined', 'per_discipline', 'per_sheet')),
  max_file_mb numeric check (max_file_mb is null or (max_file_mb > 0 and max_file_mb <= 10000)),
  naming_template text not null default '{address} {description}'
    check (length(naming_template) between 1 and 200 and position('{address}' in naming_template) > 0),
  naming_max_length integer check (naming_max_length is null or naming_max_length between 1 and 255),
  naming_upper boolean not null default false,
  revision_naming text not null default 'version_in_name'
    check (revision_naming in ('version_in_name', 'same_name')),
  flatten boolean not null default false,
  stamp_box_width_in numeric not null default 3 check (stamp_box_width_in > 0 and stamp_box_width_in <= 24),
  stamp_box_height_in numeric not null default 3 check (stamp_box_height_in > 0 and stamp_box_height_in <= 24),
  stamp_box_position text not null default 'bottom_right'
    check (stamp_box_position in ('bottom_right', 'bottom_left', 'top_right', 'top_left')),
  bookmarks boolean not null default true,
  toc_sheet boolean not null default false,
  resubmittal_mode text not null default 'changed_sheets'
    check (resubmittal_mode in ('changed_sheets', 'full_set_narrative')),
  transmittal boolean not null default false,
  min_scale_in_per_ft numeric check (min_scale_in_per_ft is null or (min_scale_in_per_ft > 0 and min_scale_in_per_ft <= 12)),
  export_unsigned boolean not null default false,
  required_notes uuid[] not null default '{}',
  signer text not null default 'none'
    check (signer in ('none', 'electrical_contractor', 'architect', 'engineer')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  check (not (is_default and archived_at is not null))
);
create unique index submittal_profile_one_default on public.submittal_profile (tenant_id) where is_default;
create unique index submittal_profile_tenant_department_key
  on public.submittal_profile (tenant_id, lower(department));
create index submittal_profile_tenant_id_idx on public.submittal_profile (tenant_id);
alter table public.submittal_profile enable row level security;
create trigger submittal_profile_set_updated_at before update on public.submittal_profile
  for each row execute function public.set_updated_at();
create policy submittal_profile_select on public.submittal_profile for select to authenticated
  using (tenant_id = (select private.tenant_id()));
create policy submittal_profile_api_gate on public.submittal_profile as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));
-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.submittal_profile to authenticated;
grant select, insert, update, delete on public.submittal_profile to service_role;
comment on table public.submittal_profile is 'Data model entity: submittal_profile (EZD-712)';

-- The company default for new projects, seeded once per company.
create function private.seed_submittal_profile(p_tenant uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.submittal_profile (tenant_id, department, is_default, max_file_mb, naming_max_length)
  select p_tenant, 'Palm Beach County', true, 10, 80
  where not exists (select 1 from public.submittal_profile s where s.tenant_id = p_tenant);
$$;
revoke all on function private.seed_submittal_profile(uuid) from public, anon, authenticated, service_role;

-- Every company that exists now (cloud: Worth Properties, tenant 1). No tenant trigger, the EZD-401 catalog
-- pattern: companies are created only by supabase/bootstrap/tenant-1.sql and supabase/seed.sql (which calls this
-- function), and the locked EZD-006 gate test fixes the tables a tenant trigger may seed. A company with no
-- profile gets its first one, as the default, from New profile.
select private.seed_submittal_profile(id) from public.tenant;

-- A project points only at its own company's profile; a deleted profile leaves the id empty (the delete function
-- moves its projects to the default first).
alter table public.project
  add constraint project_submittal_profile_fkey foreign key (submittal_profile_id, tenant_id)
  references public.submittal_profile (id, tenant_id) on delete set null (submittal_profile_id);
create index project_submittal_profile_id_idx on public.project (submittal_profile_id);

-- Projects made before profiles existed take their company's default (S15c Decision 2: a project defaults to the
-- company default). A function, so the database test runs the same statement for its own company (p_tenant);
-- null means every company. No API role executes it.
create function private.backfill_project_submittal_profiles(p_tenant uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.project p set submittal_profile_id = s.id
  from public.submittal_profile s
  where s.tenant_id = p.tenant_id and s.is_default and p.submittal_profile_id is null
    and (p_tenant is null or p.tenant_id = p_tenant);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke all on function private.backfill_project_submittal_profiles(uuid) from public, anon, authenticated, service_role;
-- updated_at is left alone here, so the project lists keep their order (recently edited first).
alter table public.project disable trigger project_set_updated_at;
select private.backfill_project_submittal_profiles();
alter table public.project enable trigger project_set_updated_at;

create function private.project_default_submittal_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.submittal_profile_id is null then
    select s.id into new.submittal_profile_id from public.submittal_profile s
    where s.tenant_id = new.tenant_id and s.is_default;
  end if;
  return new;
end;
$$;
revoke all on function private.project_default_submittal_profile() from public, anon, authenticated, service_role;
create trigger project_default_submittal_profile
  before insert on public.project
  for each row execute function private.project_default_submittal_profile();

-- The caller's company when they hold settings_sheet_presets as an active member; 42501 otherwise.
create function private.sheet_presets_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
begin
  if v_tenant is null or v_membership is null or not exists (
    select 1 from public.user_permission up
    join public.membership m on m.id = up.membership_id and m.tenant_id = up.tenant_id
    where up.membership_id = v_membership and up.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'settings_sheet_presets' and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return v_tenant;
end
$$;
revoke all on function private.sheet_presets_tenant() from public, anon, authenticated, service_role;

-- New profile (p_source null: copied from the default) and Duplicate (p_source: copied from that profile). The
-- copy is never the default and never archived; with no default yet, the new profile is the default. 23505 name_taken; 22023 invalid_input; P0002 not found.
create function public.create_submittal_profile(p_department text, p_source uuid default null)
returns setof public.submittal_profile
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_src public.submittal_profile;
  v_name text := btrim(coalesce(p_department, ''));
begin
  perform private.require_api_gate();
  v_tenant := private.sheet_presets_tenant();
  if length(v_name) = 0 or length(v_name) > 200 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_src from public.submittal_profile s
  where s.tenant_id = v_tenant and (case when p_source is null then s.is_default else s.id = p_source end);
  if not found and p_source is not null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if not found then
    -- No default yet: the first profile takes the S15c defaults and becomes the default.
    perform 1 from public.tenant t where t.id = v_tenant for update;
    if not exists (select 1 from public.submittal_profile s where s.tenant_id = v_tenant and s.is_default) then
      if exists (select 1 from public.submittal_profile s
                 where s.tenant_id = v_tenant and lower(s.department) = lower(v_name)) then
        raise exception 'name_taken' using errcode = '23505';
      end if;
      return query insert into public.submittal_profile as s (tenant_id, department, is_default)
        values (v_tenant, v_name, true) returning s.*;
      return;
    end if;
    select * into v_src from public.submittal_profile s where s.tenant_id = v_tenant and s.is_default;
  end if;
  if exists (select 1 from public.submittal_profile s
             where s.tenant_id = v_tenant and lower(s.department) = lower(v_name)) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  v_src.id := gen_random_uuid();
  v_src.department := v_name;
  v_src.is_default := false;
  v_src.archived_at := null;
  v_src.created_at := now();
  v_src.updated_at := now();
  insert into public.submittal_profile select v_src.*;
  return query select * from public.submittal_profile s where s.id = v_src.id;
end
$$;
revoke all on function public.create_submittal_profile(text, uuid) from public, anon, service_role;
grant execute on function public.create_submittal_profile(text, uuid) to authenticated;

-- The inspector's Save: p_changes holds column names and new values. Not settable here: id, tenant_id,
-- is_default, archived_at, created_at, updated_at (22023). Values are checked by the table (22023 on a wrong type
-- or a failed check); a department name another profile has is 23505 name_taken. Returns the row and the
-- columns whose value changed; nothing changed means no update.
create function public.update_submittal_profile(p_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_old public.submittal_profile;
  v_new public.submittal_profile;
  v_key text;
  v_changed text[];
begin
  perform private.require_api_gate();
  v_tenant := private.sheet_presets_tenant();
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_key in select k from jsonb_object_keys(p_changes) as k loop
    if v_key not in ('department', 'submittal_type', 'sheet_size', 'file_split', 'max_file_mb',
        'naming_template', 'naming_max_length', 'naming_upper', 'revision_naming', 'flatten',
        'stamp_box_width_in', 'stamp_box_height_in', 'stamp_box_position', 'bookmarks', 'toc_sheet',
        'resubmittal_mode', 'transmittal', 'min_scale_in_per_ft', 'export_unsigned', 'required_notes', 'signer') then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end loop;

  select * into v_old from public.submittal_profile s where s.id = p_id and s.tenant_id = v_tenant for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  begin
    v_new := jsonb_populate_record(v_old, p_changes);
  exception when others then
    raise exception 'invalid_input' using errcode = '22023';
  end;
  if p_changes ? 'department' then
    v_new.department := btrim(coalesce(v_new.department, ''));
    if exists (select 1 from public.submittal_profile s where s.tenant_id = v_tenant and s.id <> p_id
               and lower(s.department) = lower(v_new.department)) then
      raise exception 'name_taken' using errcode = '23505';
    end if;
  end if;

  select coalesce(array_agg(n.key order by n.key), array[]::text[]) into v_changed
  from jsonb_each(to_jsonb(v_new)) n
  where (to_jsonb(v_old) -> n.key) is distinct from n.value;

  if cardinality(v_changed) > 0 then
    begin
      update public.submittal_profile s set
        department = v_new.department, submittal_type = v_new.submittal_type, sheet_size = v_new.sheet_size,
        file_split = v_new.file_split, max_file_mb = v_new.max_file_mb, naming_template = v_new.naming_template,
        naming_max_length = v_new.naming_max_length, naming_upper = v_new.naming_upper,
        revision_naming = v_new.revision_naming, flatten = v_new.flatten,
        stamp_box_width_in = v_new.stamp_box_width_in, stamp_box_height_in = v_new.stamp_box_height_in,
        stamp_box_position = v_new.stamp_box_position, bookmarks = v_new.bookmarks, toc_sheet = v_new.toc_sheet,
        resubmittal_mode = v_new.resubmittal_mode, transmittal = v_new.transmittal,
        min_scale_in_per_ft = v_new.min_scale_in_per_ft, export_unsigned = v_new.export_unsigned,
        required_notes = v_new.required_notes, signer = v_new.signer
      where s.id = p_id and s.tenant_id = v_tenant;
    exception
      when check_violation or not_null_violation then
        raise exception 'invalid_input' using errcode = '22023';
      when unique_violation then
        raise exception 'name_taken' using errcode = '23505';
    end;
  end if;

  return jsonb_build_object(
    'profile', (select to_jsonb(s) from public.submittal_profile s where s.id = p_id),
    'changed', to_jsonb(v_changed));
end
$$;
revoke all on function public.update_submittal_profile(uuid, jsonb) from public, anon, service_role;
grant execute on function public.update_submittal_profile(uuid, jsonb) to authenticated;

-- Set as default: the company default for new projects. An archived profile cannot be the default (22023).
-- Returns the previous default's id (null when the profile already was the default).
create function public.set_default_submittal_profile(p_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_row public.submittal_profile;
  v_old uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.sheet_presets_tenant();
  -- Every profile row of the company, in id order, so two Set as default calls cannot deadlock.
  perform 1 from public.submittal_profile s where s.tenant_id = v_tenant order by s.id for update;
  select * into v_row from public.submittal_profile s where s.id = p_id and s.tenant_id = v_tenant;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_row.is_default then
    return null;
  end if;
  if v_row.archived_at is not null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select s.id into v_old from public.submittal_profile s where s.tenant_id = v_tenant and s.is_default;
  update public.submittal_profile s set is_default = false where s.tenant_id = v_tenant and s.is_default;
  update public.submittal_profile s set is_default = true where s.id = p_id and s.tenant_id = v_tenant;
  return v_old;
end
$$;
revoke all on function public.set_default_submittal_profile(uuid) from public, anon, service_role;
grant execute on function public.set_default_submittal_profile(uuid) to authenticated;

-- Archive (p_archived true) or restore. The default cannot be archived (P0001 profile_is_default). Returns
-- whether the row changed.
create function public.archive_submittal_profile(p_id uuid, p_archived boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_row public.submittal_profile;
begin
  perform private.require_api_gate();
  v_tenant := private.sheet_presets_tenant();
  if p_archived is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_row from public.submittal_profile s where s.id = p_id and s.tenant_id = v_tenant for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if p_archived and v_row.is_default then
    raise exception 'profile_is_default' using errcode = 'P0001';
  end if;
  if (v_row.archived_at is not null) = p_archived then
    return false;
  end if;
  update public.submittal_profile s set archived_at = case when p_archived then now() else null end
  where s.id = p_id and s.tenant_id = v_tenant;
  return true;
end
$$;
revoke all on function public.archive_submittal_profile(uuid, boolean) from public, anon, service_role;
grant execute on function public.archive_submittal_profile(uuid, boolean) to authenticated;

-- Delete: never the default (P0001 profile_is_default). Projects that used the profile move to the default.
-- Returns how many projects moved.
create function public.delete_submittal_profile(p_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_row public.submittal_profile;
  v_default uuid;
  v_moved integer;
begin
  perform private.require_api_gate();
  v_tenant := private.sheet_presets_tenant();
  perform 1 from public.submittal_profile s where s.tenant_id = v_tenant order by s.id for update;
  select * into v_row from public.submittal_profile s where s.id = p_id and s.tenant_id = v_tenant;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_row.is_default then
    raise exception 'profile_is_default' using errcode = 'P0001';
  end if;
  select s.id into v_default from public.submittal_profile s where s.tenant_id = v_tenant and s.is_default;
  update public.project p set submittal_profile_id = v_default
  where p.tenant_id = v_tenant and p.submittal_profile_id = p_id;
  get diagnostics v_moved = row_count;
  delete from public.submittal_profile s where s.id = p_id and s.tenant_id = v_tenant;
  return v_moved;
end
$$;
revoke all on function public.delete_submittal_profile(uuid) from public, anon, service_role;
grant execute on function public.delete_submittal_profile(uuid) to authenticated;

-- Project settings: the project's profile (S15c Decision 2; Q-0399 lifted by EZD-712). Edit model, as the other
-- project details (update_project_settings), and no edit lock (it does not change the model). The profile must be
-- one of the caller's company's active profiles (22023 profile_unavailable); 42501 without Edit model; P0002 when
-- the project is not visible. Returns whether the project changed.
create function public.set_project_submittal_profile(p_project uuid, p_profile uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_old uuid;
begin
  perform private.require_api_gate();
  if v_tenant is null or v_membership is null or not exists (
    select 1 from public.user_permission up
    join public.membership m on m.id = up.membership_id and m.tenant_id = up.tenant_id
    where up.membership_id = v_membership and up.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'edit_model' and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if p_profile is null or not exists (
    select 1 from public.submittal_profile s
    where s.id = p_profile and s.tenant_id = v_tenant and s.archived_at is null
  ) then
    raise exception 'profile_unavailable' using errcode = '22023';
  end if;
  select p.submittal_profile_id into v_old from public.project p
  where p.id = p_project and p.tenant_id = v_tenant for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_old is not distinct from p_profile then
    return false;
  end if;
  update public.project p set submittal_profile_id = p_profile where p.id = p_project and p.tenant_id = v_tenant;
  return true;
end
$$;
revoke all on function public.set_project_submittal_profile(uuid, uuid) from public, anon, service_role;
grant execute on function public.set_project_submittal_profile(uuid, uuid) to authenticated;
