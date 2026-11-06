-- EZD-120a Build step 2 (vault/plans/EZD-120a.md section 1 M4; Q-0508; Q-0530; Q-0540; AC-EZD-120a-7): every
-- project starts with one floor, stored as a model_object like any other object (one row per floor), so it is
-- saved, versioned and migrated with the model. Runs after each project insert, whatever made the project; the
-- migration also gives each existing project without a floor its first one.
create function private.project_first_floor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by)
  values
    (new.id, gen_random_uuid(), new.tenant_id, 'floor', '{"name":"Floor 1","order":1}'::jsonb, 1, 1, null);
  return null;
end
$$;

revoke all on function private.project_first_floor() from public;

create trigger project_first_floor
  after insert on public.project
  for each row execute function private.project_first_floor();

insert into public.model_object
  (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by)
select p.id, gen_random_uuid(), p.tenant_id, 'floor', '{"name":"Floor 1","order":1}'::jsonb, 1, 1, null
from public.project p
where not exists (
  select 1 from public.model_object o where o.project_id = p.id and o.type = 'floor'
);
