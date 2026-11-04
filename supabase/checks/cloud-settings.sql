-- EZD-171 (vault/plans/EZD-171.md; docs/runbook.md ## Cloud checks (EZD-171) J1): read-only checks of the
-- cloud database settings of runbook "Supabase cloud projects" steps 9-11. Paste all of it into the SQL
-- Editor of ezdraft-dev and press Run. Every row's ok must be true.
select check_id, ok
from (
  values
    (1, 'api_gate_registered', exists (select 1 from pg_roles r where r.rolname = 'authenticator' and 'pgrst.db_pre_request=private.api_request_gate' = any (r.rolconfig))),
    (2, 'api_gate_hash_stored', exists (select 1 from vault.secrets s where s.name = 'ezd_api_gate_sha256')),
    (3, 'token_hook_executable', has_function_privilege('supabase_auth_admin', 'private.custom_access_token_hook(jsonb)', 'execute')),
    (4, 'end_sessions_can_delete', (select has_table_privilege(p.proowner, 'auth.sessions', 'delete') from pg_proc p where p.oid = 'private.end_user_sessions(uuid)'::regprocedure)),
    (5, 'session_check_can_read', (select has_table_privilege(p.proowner, 'auth.sessions', 'select') from pg_proc p where p.oid = 'private.session_is_live()'::regprocedure)),
    (6, 'rls_on_every_table', not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity)),
    (7, 'anon_no_table_grants', not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = 'anon')),
    (8, 'no_default_table_grants', not exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r' and a.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)))
) as checks (ord, check_id, ok)
order by ord;
