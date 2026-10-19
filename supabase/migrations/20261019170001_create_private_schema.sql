-- EZD-006 Step 1 (vault/plans/EZD-006.md): schema private holds the security definer helpers, the token
-- hook and the request gate. It is not in [api] schemas (supabase/config.toml), so nothing in it is
-- callable through the REST API. anon and service_role get usage only because PostgREST runs the
-- request gate as the request's role (Q-0087 (ii)); supabase_auth_admin runs the token hook.
-- Default privileges grant execute to nobody; each function grants execute explicitly.
create schema private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role, supabase_auth_admin;

alter default privileges in schema private revoke execute on functions from public;
