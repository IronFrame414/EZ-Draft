-- EZD-320 (vault/plans/EZD-320.md): only the starter changes a pending row; uploaded_by changes only when its user is removed; uploaded_at is stamped only over its object.

drop policy source_file_update on public.source_file;
create policy source_file_update on public.source_file
  for update to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
    and (uploaded_at is not null or uploaded_by = (select private.app_user_id()))
  )
  with check (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
    and (uploaded_at is not null or uploaded_by = (select private.app_user_id()))
  );

create or replace function private.source_file_keep_original()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
    or new.project_id is distinct from old.project_id or new.kind is distinct from old.kind
    or new.storage_path is distinct from old.storage_path or new.original_name is distinct from old.original_name
    or new.content_type is distinct from old.content_type or new.size_bytes is distinct from old.size_bytes
    or new.created_at is distinct from old.created_at
    or (new.uploaded_by is distinct from old.uploaded_by
      and (new.uploaded_by is not null or exists (select 1 from public.app_user u where u.id = old.uploaded_by)))
    or (old.uploaded_at is not null and new.uploaded_at is distinct from old.uploaded_at) then
    raise exception 'source_file_original_refused' using errcode = 'P0001';
  end if;
  if old.uploaded_at is null and new.uploaded_at is not null then
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'sources' and o.name = new.storage_path
        and (o.metadata ->> 'size')::bigint = new.size_bytes
    ) then
      raise exception 'source_file_upload_missing' using errcode = 'P0001';
    end if;
    new.uploaded_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.source_file_keep_original() from public;
