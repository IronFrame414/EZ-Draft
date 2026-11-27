-- EZD-2006 (AC-EZD-2006-1; security audit 2026-11-27 S3): resolve_share_link writes share_link.viewed at
-- most once per share link per rolling hour. Further views in that hour return the same result and write
-- nothing, so a holder of a live link cannot fill the company's append-only event_log by posting view: true
-- in a loop. Everything else is unchanged from 20261121130000_share_links.sql.

create or replace function public.resolve_share_link(p_token_hash text, p_view boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.sent_package;
  v_company text;
begin
  perform private.require_api_gate();

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_row from public.sent_package s
  where s.token_hash = p_token_hash and s.revoked_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select t.name into v_company from public.tenant t where t.id = v_row.tenant_id;

  if v_row.expires_at <= now() then
    -- Once per expiry: an anonymous caller cannot add a row per request to the append-only log.
    if not exists (
      select 1 from public.event_log e
      where e.tenant_id = v_row.tenant_id
        and e.at >= coalesce(v_row.renewed_at, v_row.created_at)
        and e.action = 'share_link.expired'
        and e.object_id = v_row.id
    ) then
      perform private.write_event_log_as('share_link.expired', v_row.tenant_id, null, 'sent_package', v_row.id,
        jsonb_build_object('projectId', v_row.project_id, 'expiresAt', v_row.expires_at), null);
    end if;
    return jsonb_build_object('status', 'expired', 'company', v_company);
  end if;

  if coalesce(p_view, false) then
    -- EZD-2006: at most once per link per rolling hour. One check per link at a time, so page opens at the
    -- same moment cannot each write a row.
    perform pg_advisory_xact_lock(hashtextextended('share_link.viewed:' || v_row.id::text, 0));
    if not exists (
      select 1 from public.event_log e
      where e.tenant_id = v_row.tenant_id
        and e.at > now() - interval '1 hour'
        and e.action = 'share_link.viewed'
        and e.object_id = v_row.id
    ) then
      perform private.write_event_log_as('share_link.viewed', v_row.tenant_id, null, 'sent_package', v_row.id,
        jsonb_build_object('projectId', v_row.project_id), null);
    end if;
  end if;

  return jsonb_build_object(
    'status', 'active',
    'sent_package_id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'project_id', v_row.project_id,
    'model_version_id', v_row.model_version_id,
    'kind', v_row.kind,
    'expires_at', v_row.expires_at,
    'company', v_company);
end
$$;

revoke all on function public.resolve_share_link(text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_share_link(text, boolean) to anon;
