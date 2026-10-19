-- EZD-006 Step 1b (vault/plans/EZD-006.md; Q-0087 (ii), security-reviewer Stage 2): PostgREST runs
-- private.api_request_gate() before every request (pgrst.db_pre_request on role authenticator). It
-- refuses every anon or authenticated request whose x-ezd-api-gate header does not hash to the stored
-- digest; allow-list: anon /rpc/health; service_role passes; no stored digest fails closed.
-- Only the SHA-256 hex digest of the secret is stored, in Supabase Vault (supabase_vault 0.3.1:
-- vault.create_secret, vault.update_secret, view vault.decrypted_secrets) under ezd_api_gate_sha256.
-- The secret itself lives only in the server environment (SUPABASE_API_GATE_SECRET, EZD-007).

create function private.set_api_gate_hash(p_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'api_gate_hash_invalid' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = 'ezd_api_gate_sha256';
  if v_id is null then
    perform vault.create_secret(
      p_hash,
      'ezd_api_gate_sha256',
      'SHA-256 hex digest of the PostgREST request gate secret (EZD-006)'
    );
  else
    perform vault.update_secret(v_id, p_hash);
  end if;
end
$$;

revoke all on function private.set_api_gate_hash(text) from public;

create function private.api_request_gate()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The request's role is the role GUC PostgREST sets per request, not current_user (inside a
  -- security definer function current_user is the owner).
  v_role text := current_setting('role', true);
  v_hash text;
  v_header text;
begin
  if v_role = 'service_role' then
    return;
  end if;
  if v_role = 'anon' and current_setting('request.path', true) = '/rpc/health' then
    return;
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

  if v_role is distinct from 'anon' and v_role is distinct from 'authenticated' then
    raise exception 'api_gate' using errcode = '42501';
  end if;
end
$$;

revoke all on function private.api_request_gate() from public;
grant execute on function private.api_request_gate() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'private.api_request_gate';
notify pgrst, 'reload config';
