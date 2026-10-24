-- EZD-101 Step 4 (vault/plans/EZD-101.md): the role a membership holds. No action on delete: a held role
-- cannot be deleted (S15 Role card).
alter table public.membership add column role_id uuid;

alter table public.membership
  add constraint membership_role_id_fkey
  foreign key (role_id, tenant_id) references public.role (id, tenant_id);

create index membership_role_id_idx on public.membership (role_id);
