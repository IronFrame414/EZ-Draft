-- EZD-190 Step 1 (vault/plans/EZD-190.md section 3; Q-0330): the database backstop of the API request
-- gate. private.require_api_gate() repeats private.api_request_gate()'s header check for a statement
-- that came through PostgREST (request.path set), so a request PostgREST served without its
-- pre-request hook (a config reload over a dead pooled connection) still gets no row and changes
-- nothing. Called by the <table>_api_gate restrictive policies and first in the gated definer RPCs.
-- Passes: a role other than anon or authenticated, no request.path, a Storage request
-- (storage.operation set; Storage is outside the gate), anon /rpc/health.

create function private.require_api_gate()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := current_setting('role', true);
  v_path text := coalesce(current_setting('request.path', true), '');
  v_hash text;
  v_header text;
begin
  if v_role is distinct from 'anon' and v_role is distinct from 'authenticated' then
    return true;
  end if;
  if v_path = '' then
    return true;
  end if;
  if coalesce(current_setting('storage.operation', true), '') <> '' then
    return true;
  end if;
  if v_role = 'anon' and v_path = '/rpc/health' then
    return true;
  end if;

  select decrypted_secret into v_hash
  from vault.decrypted_secrets
  where name = 'ezd_api_gate_sha256';
  if v_hash is null or v_hash = '' then
    raise exception 'api_gate_not_configured' using errcode = '42501';
  end if;

  v_header := nullif(current_setting('request.headers', true), '')::json ->> 'x-ezd-api-gate';
  if v_header is null or encode(sha256(convert_to(v_header, 'UTF8')), 'hex') <> v_hash then
    raise exception 'api_gate' using errcode = '42501';
  end if;

  return true;
end
$$;

revoke all on function private.require_api_gate() from public;
grant execute on function private.require_api_gate() to authenticated;
