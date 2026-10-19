# EZD-005a · Tenancy tables

- **ACs:** AC-EZD-005a-1, AC-EZD-005a-2, AC-EZD-005a-3 (`vault/spec/acceptance-criteria.md` lines 22–24; generated from Done-when, KNOWN-LIMITS "Acceptance criteria for Phase 0")
- **Complexity:** high (section 8)
- **User-visible result:** nothing on screen yet; the database now has the company, user, membership and project tables that sign-in and the project list will use.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

Planned from `vault/plans/EZD-005.md` "Split proposal · Part EZD-005a", its "Re-validation findings" V1–V8 and its "Re-validated plan text" (Q-0150, answered-agent: each part is planned from that text; every interface name other plans cite is kept). Choices the sources do not make are marked *planner's choice* there and were confirmed by EZD-006's planner (vault/plans/EZD-006.md "EZD-005 choices: confirmed or challenged", lines 33–41); the security-reviewer confirms them at plan review.

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 15):
- **Scope:** tenant (name, logo, license\_no, contact, title\_block, code\_edition, defaults json); user as app\_user (name, email required, language, ipad\_input\_mode, role\_preset); membership (status invited / active / deactivated, invited\_at, last\_active\_at, scope all or listed projects; role\_id is added by EZD-101); membership\_project (the listed projects of a scoped user); project (fields per Data model, plus archived\_at, thumbnail\_path, open\_items\_count). Six migrations with row-level security on, indexes, checks and composite foreign keys; generated database types; Tenancy tables in docs/architecture.md. Split from EZD-005 (Q-0150); plan Part EZD-005a.
- **Done when:** The tenant, user (app\_user), project, membership and membership\_project tables exist in the local database with row-level security on and the planned columns, defaults and allowed values; a membership's listed project can never belong to another company; the committed database types match the local database.
- **Depends on:** EZD-004a, EZD-004b · **Spec ref:** Data model · Tables

### Steps
1. **Shape decisions** (EZD-005.md Step 1; confirmed in EZD-006.md lines 36–41):
   - The `user` entity is table `public.app_user` (`user` is reserved in PostgreSQL).
   - Keys are `uuid` default `gen_random_uuid()`.
   - `tenant` and `app_user` carry no `tenant_id`: `tenant` is the tenant; `app_user` is one person across tenants, linked by `membership (user_id, tenant_id)` (03 Tables membership).
   - `app_user.auth_user_id uuid null unique references auth.users(id) on delete set null`; EZD-007 fills it at first sign-in.
   - Cross-tenant links blocked by composite foreign keys: `membership` and `project` get `unique (id, tenant_id)`; `membership_project` references `(membership_id, tenant_id)` and `(project_id, tenant_id)` (03 intro; 11 Security and audit).
   - Enumerated values are `text` + `check`, lower snake case (11 Operations "add before remove").
   - Every table has `created_at timestamptz not null default now()`; the four edited tables also have `updated_at`, kept by trigger function `public.set_updated_at()` (`security invoker`, `set search_path = ''`); `membership_project` has no `updated_at`.
   - RLS enabled on all five tables, **no policies** (03 intro "row-level security from day one"); EZD-006 adds policies, token hook and grants. Supabase default grants unchanged (`supabase/config.toml` leaves `auto_expose_new_tables` unset, finding V6).
2. **Migrations** in `supabase/migrations/`, created with `pnpm supabase migration new <name>`, timestamps ascending and all after `20261019153713` (EZD-004a's health migration; docs/architecture.md `## Migrations`, check C5), one concern per file, in this order: `create_set_updated_at`, `create_tenant`, `create_app_user`, `create_project`, `create_membership`, `create_membership_project`. Each table file: `create table public.<name>`, constraints, indexes, `alter table public.<name> enable row level security`, the `updated_at` trigger where step 1 applies, and `comment on table` naming its Data model entity and EZD-005a. Columns in **Data** below.
3. **Types:** `pnpm db:types`, commit `app/src/server/db/database.types.ts` (docs/architecture.md `### Local database`; EZD-004a T9).
4. **No app code, no route, no seed rows, no new dependency** (EZD-005.md Step 5; seed rows are EZD-005b). Tests use `@supabase/supabase-js` 2.118.0, already in `app/package.json` (EZD-004b, finding V2).
5. **`docs/architecture.md`:** new `### Tenancy tables (EZD-005)` under `## Migrations`, after `### Local database` and its "Cloud dev:" paragraph, before `## Errors and logging` (the next `##` heading in the file today, line 200; EZD-005.md Step 6 named `## Server-only data access and can()`, which in fact precedes `## Migrations`). The heading keeps the base ID because EZD-006 line 14 cites it (Split proposal). Content:
   - `user` is `app_user`, with the reason.
   - Tenant-less tables with reasons: `tenant` (key `id`), `app_user` (one person across tenants, linked by `membership`); the list EZD-006's CI test starts from (EZD-006.md line 37: every later exemption needs its own reason).
   - The composite-FK pattern for tenant-owned rows pointing at other tenant-owned rows.
   - `text` + `check` for enumerated values; `set_updated_at()` for `updated_at`.
   - `tenant.contact` keys `phone`, `email`, `website`, `address` (S15a Contact); `contact.email` is the company email replies go to (Q-0036; EZD-008).
   - `app_user.language` defaults to `en`; inviter or user switches to `es` (Q-0029 (a); Q-0121 (a)).
   - `app_user.auth_user_id` is filled at first sign-in by EZD-007.
   - Not in this part: seed ids and `supabase/bootstrap/tenant-1.sql` (EZD-005b adds those lines).
   - `### Local database` stays unchanged (EZD-004a T18 reads it with `sectionOf`, which stops at the next `###`; `scripts/db/__tests__/db.test.mjs` lines 116–126, 326–338). No Dependencies or Machine checks row changes.

### Files
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `supabase/migrations/<ts>_create_set_updated_at.sql` | New | builder | Step 1 timestamps |
| `supabase/migrations/<ts>_create_tenant.sql` | New | builder | 03 tenant |
| `supabase/migrations/<ts>_create_app_user.sql` | New | builder | 03 user |
| `supabase/migrations/<ts>_create_project.sql` | New | builder | 03 project + Round 26 added fields + ticket Scope |
| `supabase/migrations/<ts>_create_membership.sql` | New | builder | 03 membership + ticket Scope |
| `supabase/migrations/<ts>_create_membership_project.sql` | New | builder | Ticket Scope |
| `app/src/server/db/database.types.ts` | Change (regenerated) | builder | Step 3 |
| `docs/architecture.md` | Change (one new `###` subsection only) | builder | Step 5 |
| `app/src/server/db/tenancy.test.ts` | New | test-author | T2–T11 (Vitest, local DB; env from `app/test-harness/supabase-env.global-setup.ts`) |
| `scripts/db/__tests__/tenancy-migrations.test.mjs` | New | test-author | T13, T14, T15a (node:test, found by the root `node --test "scripts/**/*.test.mjs"`) |
| `supabase/seed.sql`, `scripts/gate.mjs`, `.github/workflows/ci.yml`, `vault/**`, `CLAUDE.md` | Not touched | — | Seed is EZD-005b; the rest Josh/orchestrator owned |

### Data
All in schema `public`. No money fields (03 rule 2: none is a cost, sell, markup or total). No model `schema_version` change.

**`tenant`** (03 tenant; S15a; S15g; EZD-116)
| Column | Type | Null / default | Source |
| --- | --- | --- | --- |
| `id` | uuid | PK, `gen_random_uuid()` | Step 1 |
| `name` | text | not null; `check (length(btrim(name)) > 0)` | S15a "Company name required" |
| `logo_path` | text | null | 03 `logo`; Storage path (docs/architecture.md Storage: logo in `media`) |
| `license_no` | text | null | 03; S15a |
| `contact` | jsonb | not null, `'{}'` | 03; S15a; keys in Step 5; Q-0036 (no separate reply-email column) |
| `title_block` | jsonb | not null, `'{}'` | 03 |
| `code_edition` | text | null | 03; S15g; null until EZD-613 (EZD-118 row) |
| `defaults` | jsonb | not null, `'{}'` | 03 "defaults (json)"; EZD-116 |
| `created_at`, `updated_at` | timestamptz | not null, `now()` | Step 1 |

**`app_user`** (03 user; S15; S15d)
| Column | Type | Null / default | Source |
| --- | --- | --- | --- |
| `id` | uuid | PK, `gen_random_uuid()` | Step 1 |
| `auth_user_id` | uuid | null; unique; FK `auth.users(id) on delete set null` | Step 1 |
| `name` | text | null | S15 Invite user (name optional) |
| `email` | text | not null; unique; `check (email = lower(email) and length(btrim(email)) > 0)` | 03 "Email required"; R24 #15; S15 Decision 9; lower-case for case-insensitive uniqueness (*planner's choice*, EZD-005.md Data) |
| `language` | text | not null, default `'en'`; `check (language in ('en','es'))` | 03 "language (en/es)"; Q-0029 (a); Q-0121 (a) |
| `ipad_input_mode` | text | null; `check (ipad_input_mode in ('pencil','finger'))` | 10 Company settings Input "Pencil only or finger" (line 58); null = company default (S15d Decision 5) |
| `role_preset` | text | null; `check (role_preset in ('owner','designer','foreman','crew'))` | 03 user; R24 presets; S15 Decision 3 (Client is not a preset) |
| `created_at`, `updated_at` | timestamptz | not null, `now()` | Step 1 |

**`project`** (03 project; 03 Round 26 added fields; ticket Scope)
| Column | Type | Null / default | Source |
| --- | --- | --- | --- |
| `id` | uuid | PK; `unique (id, tenant_id)` | Step 1 |
| `tenant_id` | uuid | not null; FK `tenant(id)` | 03 intro |
| `name` | text | not null; non-blank check | S01 line 109 "name, address and type required" |
| `client_name` | text | null | 03; S01 line 109 "client optional at creation" |
| `address` | text | not null; non-blank check | S01 line 109 |
| `type` | text | not null; `check (type in ('kitchen','bath','whole_home_interior'))` | S01 line 67 "Kitchen, Bath, Whole-home interior · v1 types only" |
| `status` | text | not null, default `'draft'`; `check (status in ('draft','client_review','permit_submitted','approved','in_build'))` | 03 project Status list; S01 line 124 "Draft on create" |
| `ezbinder_job_id`, `ezbinder_job_no` | text | null | 03 |
| `property_record_id` | uuid | null, no FK (EZD-711 adds it) | 03 |
| `submittal_profile_id` | uuid | null, no FK (EZD-712 adds it) | 03 |
| `code_edition` | text | null | 03; EZD-118 row |
| `phase_default` | text | null, no check | 03 (no source defines its values) |
| `scope_of_work` | text | null | 03 Round 26 added fields; R26 R28 |
| `settings` | jsonb | not null, `'{}'` | 03 Round 26 added fields |
| `thumbnail_path` | text | null | 03; ticket Scope |
| `open_items_count` | integer | not null, default `0`; `check (open_items_count >= 0)` | 03 "stored counter"; 11 rule 9 |
| `archived_at` | timestamptz | null | Ticket Scope; EZD-124 row |
| `created_at`, `updated_at` | timestamptz | not null, `now()` | Step 1 |

Index `project_tenant_id_idx (tenant_id)` (11 rule 10). The EZD-620 code fields (03 Round 26) are not added.

**`membership`** (03 membership; ticket Scope)
| Column | Type | Null / default | Source |
| --- | --- | --- | --- |
| `id` | uuid | PK, `gen_random_uuid()`; `unique (id, tenant_id)` | Step 1 |
| `tenant_id` | uuid | not null; FK `tenant(id)` | 03 |
| `user_id` | uuid | not null; FK `app_user(id)` | 03 |
| `status` | text | not null, no default; `check (status in ('invited','active','deactivated'))` | Ticket Scope |
| `scope` | text | not null, no default; `check (scope in ('all','listed'))` | 03 "scope (all projects / listed projects)"; inviter chooses (S15 Decision 13) |
| `invited_at` | timestamptz | null | Ticket Scope |
| `last_active_at` | timestamptz | null | Ticket Scope |
| `created_at`, `updated_at` | timestamptz | not null, `now()` | Step 1 |

`unique (tenant_id, user_id)` (S15 Validation "not already a member of the tenant"; leads with `tenant_id`, 11 rule 10); index `membership_user_id_idx (user_id)` (EZD-006 token hook, EZD-006.md line 72). No `role_id` (EZD-101). One active company per person (Q-0043 (a)) is enforced by EZD-105 and EZD-006's hook, not here.

**`membership_project`** (ticket Scope)
| Column | Type | Null / default | Source |
| --- | --- | --- | --- |
| `tenant_id` | uuid | not null; FK `tenant(id)` | 03 intro |
| `membership_id` | uuid | not null; FK `(membership_id, tenant_id) → membership(id, tenant_id) on delete cascade` | Step 1 |
| `project_id` | uuid | not null; FK `(project_id, tenant_id) → project(id, tenant_id) on delete cascade` | Step 1 |
| `created_at` | timestamptz | not null, `now()` | Step 1 |

Primary key `(membership_id, project_id)`; indexes `membership_project_tenant_id_idx (tenant_id)`, `membership_project_project_id_idx (project_id)` (11 rule 10).

## 2. Sources
- `vault/spec/sections/03-data-model.md`: intro (line 3, "Every table carries `tenant_id` with row-level security from day one"); Architecture rules 1, 2, 5; Tables tenant, user, membership, project (lines 31–35); Round 26 project added fields (line 96).
- `vault/spec/sections/11-non-functional-requirements.md`: Performance rules 9 (stored counters) and 10 (index on `tenant_id` and `project_id`) (lines 33–34); Operations (add before remove); Security and audit.
- `vault/spec/sections/04-app-shell-and-global-ui.md`: read; no shell work here.
- `vault/spec/sections/10-permissions-and-settings.md` line 58 (Input). Screens under `vault/spec/sections/screens/`: `S01-projects.md` lines 67, 109, 124; `S15-settings-users-permissions.md` (Invite user; Validation; Decisions 3, 9, 13); `S15a-settings-company.md` (Company name required; Contact); `S15d-settings-defaults.md` Decision 5; `S15g-settings-code-edition.md`.
- Decisions: R24 #15 and presets (`decisions/13a-rounds-24-25.md`); R26 R1, R28 (`decisions/13b-round-26.md`); Q-0029 (a), Q-0043 (a), Q-0121 (a) (`decisions/10-permissions-and-settings.md`); Q-0036 (`decisions/07-hooks-events-and-integrations.md`); Q-0150 (split; answered-agent).
- Plans: `vault/plans/EZD-005.md` (Split proposal, V1–V8, re-validated text); `EZD-004a.md`, `EZD-004b.md` (merged contracts); `EZD-006.md` lines 14, 33–41, 63, 72 (what it reads from this ticket).
- Code read 2026-10-19: `supabase/migrations/20261019153713_create_health_function.sql` (only migration); `app/vitest.config.ts` (globalSetup, `testTimeout: 15000`, `maxWorkers: 4`); `app/src/server/db/local-services.test.ts` (client pattern); `scripts/db/__tests__/db.test.mjs` (T18 `sectionOf`); `docs/architecture.md` lines 178–200; `.claude/hooks/guard-paths.mjs` line 15 (test paths) and lines 81–82.
- Mockup: none (`tickets.json` `mockups: []`). Non-goals and glossary: nothing applies beyond `user` → `app_user` (recorded in Step 5).
- Research reports: none cover this ticket.

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| table | `public.tenant`, `public.app_user`, `public.project`, `public.membership`, `public.membership_project` | Columns, types, defaults, checks exactly as **Data**; RLS enabled, no policies. Names cited by EZD-006 (line 14), EZD-016a, EZD-023b, EZD-025 |
| function | `public.set_updated_at() returns trigger` | `security invoker`, `set search_path = ''`; sets `new.updated_at = now()`; `before update` trigger on `tenant`, `app_user`, `project`, `membership` |
| constraint | `unique (id, tenant_id)` on `membership` and `project` | Targets of `membership_project`'s composite FKs |
| constraint | `membership unique (tenant_id, user_id)`; `app_user unique (email)`, `unique (auth_user_id)`; `membership_project primary key (membership_id, project_id)` | T7, T13 |
| index | `project_tenant_id_idx`, `membership_user_id_idx`, `membership_project_tenant_id_idx`, `membership_project_project_id_idx` | Names fixed (EZD-006 line 14 cites `membership_user_id_idx`); T13 checks first columns |
| file | `supabase/migrations/<14-digit ts>_create_{set_updated_at,tenant,app_user,project,membership,membership_project}.sql` | One `create table` per file; timestamps after `20261019153713`, ascending in that order |
| file | `app/src/server/db/database.types.ts` | Generated; `Database['public']['Tables']` has keys `tenant`, `app_user`, `project`, `membership`, `membership_project` |
| docs | `docs/architecture.md` `### Tenancy tables (EZD-005)` under `## Migrations` | Names `app_user`, `tenant`, `membership_project`, `contact.email`, `Q-0036` (T15a); EZD-005b appends the seed ids and bootstrap file |
| error codes | supabase-js `error.code` = SQLSTATE | `23502` not null, `23503` FK, `23505` unique, `23514` check, `42501` privilege / RLS |
| test files | `app/src/server/db/tenancy.test.ts` (top-level `describe('EZD-005a tenancy tables', …)`, check C9); `scripts/db/__tests__/tenancy-migrations.test.mjs` (test titles start `EZD-005a`) | Phase 0 grep matches `EZD-005a` (finding V8) |

Done-when titles (docs/architecture.md Tests): T2 `EZD-005a done when: the five tenancy tables exist with the planned columns` (AC-1); T9 `EZD-005a done when: a listed project can never belong to another company` (AC-2); T15a `EZD-005a done when: committed database types match the local database` (AC-3).

## 4. Tests
Common setup (EZD-005.md Tests, adapted to part a): the root `test` runs `pnpm run db:up` first (fresh reset; root `package.json`). Vitest builds two clients as `local-services.test.ts` does: **admin** (`SUPABASE_SECRET_KEY`) and **anon** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), `auth: { persistSession: false }`. Inserted rows use a per-run random suffix (tenant name `EZD-005a test <suffix>`, emails `ezd005a-<suffix>-n@example.com`) and are deleted in `afterAll` (auth users too). Tests match codes and values, never message text. Test IDs keep the EZD-005 numbering (T1, T12, T15b–T18 belong to EZD-005b).

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T2 Planned columns present (done when) | AC-1 | unit (Vitest, local DB) | Admin inserts one row per table with every **Data** column set to a valid value, then `select('*')` that row | `Object.keys(row)` contains every **Data** column: tenant 10, app\_user 9, project 20, membership 9, membership\_project 4. Superset allowed (EZD-101 adds `membership.role_id`) | Data; ticket Scope; EZD-005.md T2 (plan review finding 32) |
| T3 Defaults | AC-1 | unit (Vitest) | Admin inserts: tenant with only `name`; app\_user with only `email`; project with only `tenant_id`, `name`, `address`, `type`; membership with only `tenant_id`, `user_id`, `status`, `scope` | Tenant: `contact`, `title_block`, `defaults` deep-equal `{}`; `logo_path`, `license_no`, `code_edition` null. User: `language === 'en'`; `ipad_input_mode`, `role_preset`, `name`, `auth_user_id` null. Project: `status === 'draft'`, `settings` deep-equals `{}`, `open_items_count === 0`, `archived_at` null. Membership: `invited_at`, `last_active_at` null. All: `created_at` and (where present) `updated_at` non-null | Data (S01 line 124; Q-0029 (a); S15d Decision 5) |
| T4 Required columns | AC-1 | unit (Vitest) | Admin inserts each missing one required column: tenant w/o `name`; app\_user w/o `email`; project w/o each of `tenant_id`, `name`, `address`, `type`; membership w/o each of `tenant_id`, `user_id`, `status`, `scope` | Each: `23502` | Data (03 "Email required"; S01 line 109; S15a) |
| T5 Refused values | AC-1 | unit (Vitest) | `app_user.language = 'fr'`; `ipad_input_mode = 'mouse'`; `role_preset = 'client'`; `email = 'Upper@Example.com'`; `email = ' '`; `tenant.name = '  '`; `membership.status = 'pending'`; `membership.scope = 'some'`; `project.status = 'archived'`; `project.type = 'office'`; `project.open_items_count = -1`; `project.name = ''`; `project.address = ''` | Each: `23514` | 03 language; 10 Input; S15 Decision 3; ticket Scope; 03 project statuses; S01 line 67; 11 rule 9 |
| T6 Allowed values accepted | AC-1 | unit (Vitest) | One row per value: language `en`, `es`; ipad `pencil`, `finger`; role\_preset `owner`, `designer`, `foreman`, `crew`; membership status `invited`, `active`, `deactivated`; scope `all`, `listed`; project status `draft`, `client_review`, `permit_submitted`, `approved`, `in_build`; type `kitchen`, `bath`, `whole_home_interior` | Each: `error === null` | Same as T5 |
| T7 Uniqueness | AC-1 | unit (Vitest) | (a) two app\_users, same email; (b) two memberships, same `tenant_id` + `user_id`; (c) admin `auth.admin.createUser({ email, email_confirm: true })`, then two app\_users with that `auth_user_id`; (d) one user's memberships in two tenants | (a)(b)(c) second insert `23505`; (d) both succeed | Data; S15 Validation; Step 1 (one person, many tenants) |
| T8 Auth link follows the auth user | AC-1 | unit (Vitest) | Continue T7 (c): `auth.admin.deleteUser(authId)`; read the first app\_user | `auth_user_id === null`; row still exists | Step 1 (`on delete set null`) |
| T9 Tenant boundary (done when) | AC-2 | unit (Vitest) | Tenants A, B; membership M in A; project P in B. Insert `membership_project (A, M, P)`, then `(B, M, P)`; also a project with a random `tenant_id` | All three: `23503` | Step 1 composite FKs; 03 intro; 11 Security and audit |
| T10 Cascade; RLS on | AC-1 | unit (Vitest) | (a) In A: project P2, membership M, `membership_project (A, M, P2)`; delete P2; count rows for M. Insert again with P3; delete M; count rows for P3. (b) Admin first inserts one row in each of the five tables (part a has no seed rows); then anon `select('*')` on each table; anon `insert` into `tenant` | (a) both counts `0`. (b) each select: `error === null` and `data` deep-equals `[]`, or error code `42501`; anon insert: `42501` | Data cascades; 03 intro; Step 1 RLS; EZD-006.md line 63 relies on `42501` being accepted |
| T11 `updated_at` moves | AC-1 | unit (Vitest) | Admin inserts a tenant, reads `updated_at` (u0), updates `license_no` in a separate request, reads u1 | `Date.parse(u1) > Date.parse(u0)`; `created_at` unchanged | Step 1 (`set_updated_at()`) |
| T13 Indexes | AC-1 | unit (node) | Text of every `supabase/migrations/*.sql`, case-insensitive, whitespace collapsed; collect `create [unique] index … on [public.]<table> [using btree] (<cols>)`, `primary key (<cols>)`, `unique (<cols>)` per table | `project`: one with first column `tenant_id`. `membership`: first column `tenant_id`, and one with first column `user_id`. `membership_project`: first column `tenant_id`, and one with first column `project_id`. `app_user`: unique on `email` and on `auth_user_id` | 11 rule 10; Data |
| T14 RLS; one table per file | AC-1 | unit (node) | Same texts | For each of the five tables exactly one file contains `create table [public.]<name>`, and it also contains `alter table [public.]<name> enable row level security`. No file creates more than one table. No file contains `create table public.user` or `create table "user"` | 03 intro; docs/architecture.md Migrations "one concern per file"; Step 1 |
| T15a Types and docs (done when) | AC-3 | unit (node) | `app/src/server/db/database.types.ts`; `docs/architecture.md`; spawn `node scripts/db/gen-types.mjs --check` and `node scripts/conventions/check.mjs .` | Types file contains keys `tenant`, `app_user`, `project`, `membership`, `membership_project`; `gen-types.mjs --check` exits 0. A `### Tenancy tables (EZD-005)` heading between `## Migrations` and the next `##` whose section names `app_user`, `tenant`, `membership_project`, `contact.email`, `Q-0036`. `check.mjs .` exits 0 (C5) | Steps 3, 5; EZD-004a T9; EZD-000 C5; Q-0036 |
| T16 Gate (orchestrator) | all | gate | Docker running; `node scripts/gate.mjs <worktree>` | Exit 0; typecheck, lint, test, build pass | CLAUDE.md rule 12 |

## 5. Visual checklist
None (no screen; `mockups: []`).

## 6. Proposed wording
None (no user-visible text).

## 7. Security review
security-review: yes. Areas: data access, migrations (new tables with tenant and user data; tenant-less `tenant` and `app_user`; the auth link column; cross-tenant composite FKs; RLS on with no policies until EZD-006). Gate SECURITY_PATHS matches `migrations` and `db/` (`scripts/gate.mjs` line 14).
Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation
High: a data model with RLS, cross-tenant foreign keys and an auth link that every later ticket builds on (PROCESS.md section 4 "data model"). Test-author Fable 5.1, builder Fable 5.1; code-reviewer and security-reviewer Fable 5.1. Size: 8 builder files + 2 test files and 13 tests + gate, at the upper edge of the size rule; the orchestrator accepted this split (Q-0150), and T5, T6 are value tables and T13–T15a text checks; test IDs are kept because EZD-006 cites them (line 63).

## 9. Dependencies
- Ticket row: EZD-004a (migrations folder, `db:up` reset, `db:types` / `gen-types.mjs --check`, `database.types.ts`; finding V1), EZD-004b (`@supabase/supabase-js`, Vitest global setup; finding V2).
- Not in the row, used directly: EZD-000 (migration naming, C5, test naming, docs/architecture.md), EZD-001 (app Vitest project, check C9). Both transitive and done. Docker running (docs/architecture.md `### Local database`).
- No EZD-016a: no visual checklist.
- Dependents: EZD-005b (seed rows and bootstrap use these tables), EZD-006 (policies, hook, tenant-less list), and every ticket depending on EZD-005 (Q-0150).
- Risks: names and shapes are a contract for EZD-006 and later (renaming after merge fails add-before-remove, 11 Operations); RLS with no policy means nothing reads these tables through the API until EZD-006; `phase_default` has no defined values (first reader defines them); `property_record_id` / `submittal_profile_id` FKs wait for EZD-711 / EZD-712; widening a check constraint later is drop + add (EZD-023a must treat it as non-destructive); tests share one local database with Vitest `maxWorkers: 4`, so every test row uses the random suffix and nothing counts whole tables. No performance budget effect (indexes per 11 rule 10).

## 10. Open questions
None. EZD-005's QP-1 (Q-0151, seed comment-only check) belongs to EZD-005b; this part writes no seed rows.
