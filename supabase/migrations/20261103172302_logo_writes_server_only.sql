-- EZD-295 (vault/plans/EZD-295.md D1-D3; Q-0478, Q-0512 (a)): company logo files are written and deleted
-- only by the server. private.storage_request_from_server() is true when the request carries the API gate
-- header (the same secret require_api_gate checks), which only the server adds. It never raises.

create function private.storage_request_from_server()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select encode(sha256(convert_to(nullif(current_setting('request.headers', true), '')::json ->> 'x-ezd-api-gate', 'UTF8')), 'hex') = s.decrypted_secret
    from vault.decrypted_secrets s
    where s.name = 'ezd_api_gate_sha256' and s.decrypted_secret <> ''
  ), false);
$$;

revoke all on function private.storage_request_from_server() from public;
grant execute on function private.storage_request_from_server() to authenticated;

drop policy storage_media_insert on storage.objects;
create policy storage_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (select private.storage_request_from_server())
    and current_setting('storage.operation', true) = 'storage.object.upload'
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and (storage.foldername(name))[2] = 'tenant'
    and (storage.foldername(name))[3] = 'logo'
    and array_length(storage.foldername(name), 1) = 3
    and (select exists (
      select 1 from public.user_permission up
      where up.membership_id = (auth.jwt() ->> 'membership_id')::uuid
        and up.permission_key = 'settings_company'
        and up.granted))
  );

drop policy storage_media_delete on storage.objects;
create policy storage_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (select private.storage_request_from_server())
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and (storage.foldername(name))[2] = 'tenant'
    and (storage.foldername(name))[3] = 'logo'
    and array_length(storage.foldername(name), 1) = 3
    and (select exists (
      select 1 from public.user_permission up
      where up.membership_id = (auth.jwt() ->> 'membership_id')::uuid
        and up.permission_key = 'settings_company'
        and up.granted))
    and owner_id = (select auth.uid())::text
  );

update storage.buckets set file_size_limit = 4000000 where id = 'media';
