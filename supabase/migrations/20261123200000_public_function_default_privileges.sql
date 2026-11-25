-- EZD-1932 (audit 2026-11-23 S3; AC-EZD-1932-1): a function created in public from here on is executable by
-- nobody but its owner and service_role until its migration grants execute by name, so a forgotten revoke
-- fails closed. Functions that exist already keep the grants their own migrations gave them.
--
-- 1. The schema default for role postgres (migrations run as postgres) stops granting to anon and authenticated.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- 2. PUBLIC's execute on new functions is a global default, and a per-schema default can only add to it
-- (Postgres ALTER DEFAULT PRIVILEGES), so it is revoked in the global form. The per-schema form the ticket
-- names is kept for the record; on its own it changes nothing.
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- 3. private keeps its current default: a new private function starts executable by PUBLIC (the private schema
-- migration's per-schema revoke never removed the global grant), and each private function revokes by name.
-- The EZD-168 audit tests pin that default (rls.audit.test.ts, locked), so this restates it and loosens nothing.
-- Migrations create functions only in public and private, so no other schema's behaviour changes.
alter default privileges for role postgres in schema private
  grant execute on functions to public;
