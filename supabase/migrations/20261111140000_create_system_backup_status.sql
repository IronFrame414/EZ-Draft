-- EZD-135 Build step 9 (vault/plans/EZD-135.md section 1 Database functions; Q-0664; Q-0672 (b); AC-EZD-135-4):
-- System status reads backup_run (system-wide; anon and authenticated cannot select it) only through this function, which
-- refuses a caller without the System status switch. It also indexes failed jobs for the failed-jobs list.
create function public.system_backup_status()
returns table (kind text, status text, finished_at timestamptz, bytes_copied bigint, location text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_membership uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'settings_system_status'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query select distinct on (b.kind) b.kind, b.status, b.finished_at, b.bytes_copied, b.location from public.backup_run b where b.scope = 'all' and ((b.kind = 'restore_drill' and b.status in ('succeeded', 'failed')) or (b.kind <> 'restore_drill' and b.status = 'succeeded')) order by b.kind, b.finished_at desc, b.id desc;
end
$$;

revoke all on function public.system_backup_status() from public, anon, service_role;
grant execute on function public.system_backup_status() to authenticated;

create index job_failed_finished_idx on public.job (tenant_id, finished_at desc) where status = 'failed';
