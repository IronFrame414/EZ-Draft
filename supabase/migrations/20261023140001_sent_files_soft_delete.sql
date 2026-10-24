-- EZD-025 Step 2 (vault/plans/EZD-025.md): sent-package files are permanent (11 Data retention; R24 #4a). They
-- live in bucket exports at <tenant_id>/<project_id>/sent/<sent_package_id>/<file>. This trigger refuses any
-- delete of such an object, and any update that moves it (bucket_id or name) or overwrites it (version), for
-- every caller, the secret key included, because Storage API calls end in SQL on storage.objects. A "delete" of a
-- sent package is a soft delete on its owning row; the object and its off-site copy stay. Inserts pass.

create function private.refuse_sent_file_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.bucket_id = 'exports' and old.name ~ '^[^/]+/[^/]+/sent/' then
    if tg_op = 'DELETE'
      or new.bucket_id is distinct from old.bucket_id
      or new.name is distinct from old.name
      or new.version is distinct from old.version then
      raise exception 'sent_file_change_refused' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.refuse_sent_file_change() from public;

create trigger sent_files_soft_delete
  before delete or update on storage.objects
  for each row execute function private.refuse_sent_file_change();
