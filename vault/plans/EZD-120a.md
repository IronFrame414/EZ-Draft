# EZD-120a · Model tables, save function and checkpoints

- **ACs:** AC-EZD-120a-1 to AC-EZD-120a-7
- **Complexity:** high
- **Areas:** data-model, migrations, security, testing
- **User-visible result:** none on screen; the working copy, save and checkpoints EZD-120b uses.
- Phase: 3 · Planned by: planner · Date: 2026-11-04 · Status: planned · Plan gap 2026-11-05: migration layout, seq type, harness edits E5–E8

## 1. What to build

No money field. SQL probed on pinned PostgreSQL 17.11 (L-009). NN = `not null`. "Tenant fk" = columns `project_id`, `tenant_id` uuid NN; `tenant_id` → tenant on delete cascade; `(project_id, tenant_id)` → `project (id, tenant_id)` on delete cascade; index `tenant_id`.
- **M1 `edit_lock`** (03e; 00d): `project_id uuid` pk; tenant fk; `lock_epoch bigint NN default 0 check (>= 0)`. EZD-125 adds the holder columns.
- **M2 `model_object`** (03d; 03e): pk `(project_id, object_id uuid)`; tenant fk; `type text NN check (type ~ '^[a-z][a-z0-9_]*$')`; `data jsonb NN` (object); `schema_version integer NN (>= 1)`; `updated_seq integer NN (>= 1)` (Decided "Seq type"); `updated_by uuid` → app_user on delete set null; `deleted boolean NN default false`; `created_at`, `updated_at timestamptz NN default now()`.
- **M3 `model_version`** (03c; 03b rule 7; Q-0507 gap 16): `id uuid` pk default `gen_random_uuid()`; tenant fk; `model_json jsonb NN` (object); `schema_version integer NN (>= 1)`; `parent_version_id uuid` → model_version on delete set null; `label`, `sent_to`, `preview_path text`; `is_snapshot`, `is_sent`, `keep boolean NN default false`; `sent_at`, `cleanup_shown_at timestamptz`; `version_no integer`; `created_by uuid` (no fk); `created_at timestamptz NN default clock_timestamp()`; index `(project_id, created_at desc, id desc)`. Trigger (before update, row; invoker) `private.model_version_immutable`: 55000, same name, when `id`, `tenant_id`, `project_id`, `model_json`, `schema_version`, `created_by` or `created_at` changes, or `parent_version_id` changes to non-null.
- **Access M1–M3**: RLS; `<table>_select` to authenticated, template of 20261019170006 lines 7–9; restrictive `<table>_api_gate` and grants as 20261102210537; no write policy.
- **M4** (Q-0508; Q-0530): after-insert row trigger `project_first_floor` on project (`private.project_first_floor()`, definer) inserts one model_object: `object_id gen_random_uuid()`, `type 'floor'`, `data {"name":"Floor 1","order":1}`, `schema_version 1`, `updated_seq 1`, `updated_by null`; the migration adds it to each existing project lacking one.
- **M5 `public.save_objects(p_project uuid, p_lock_epoch bigint, p_changes jsonb) returns jsonb`** (03b rules 6, 9; plpgsql, volatile, definer, `search_path ''`; first failing step decides): (1) `perform private.require_api_gate()`; (2) `private.tenant_id()`, `private.app_user_id()` or claim `membership_id` null → 42501 `permission_denied`; (3) no granted `edit_model` row in `user_permission` → 42501 (as 20261026130000 lines 39–48); (4) null or `not private.can_see_project(p_project)` → P0002 `project_not_found`; (5) 22023 `invalid_input` when `p_lock_epoch` is null or < 0, or `p_changes` breaks a rule of Decided "parseSaveRequest" (snake keys `id`, `base_seq`, `deleted`, `type`, `schema_version`, `data`; exact key sets; `id` checked by `~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`; `base_seq` a whole JSON number from its minimum to 2147483647, then cast `::integer`; loop as 20261104094232); (6) `select lock_epoch … for update`; no row: `p_lock_epoch <> 0` → stale, else insert on conflict do nothing and select again; (7) stored ≠ `p_lock_epoch` → `{"status":"stale_lock_epoch"}`; (8) changes whose `base_seq` ≠ `coalesce(stored updated_seq, 0)` → `{"status":"conflict","conflicts":[{"object_id","server_seq"}]}` (by object_id; 0 when no row); (9) no count cap; insert `base_seq` 0 changes at seq 1; update the rest (`type`, `data`, `schema_version` when sent, `deleted`, `updated_seq + 1`, `updated_at now()`); `updated_by` = user; (10) `{"status":"saved","tenant_id","objects":[{"object_id","updated_seq"}]}` by object_id. (7) and (8) write no model_object row.
- **M6** (03b rule 7; Q-0507 gap 16): `private.make_checkpoint(p_project uuid, p_actor uuid) returns uuid` (invoker): no project → P0002; edit_lock row ensured and locked as M5 (6); parent = newest version by `(created_at desc, id desc)`; inserts one version: `model_json {"objects":[{"id","type","schema_version","data"}]}` from non-deleted rows by object_id (`[]` when none), `schema_version` their min (1 when none), `created_by p_actor`, other columns at their defaults (null, false); returns its id. `public.create_checkpoint(p_project uuid) returns uuid` (definer): M5 (1)–(4), then `private.make_checkpoint(p_project, v_user)`.
- **Grants**: each function `revoke all … from public` (L-016); public ones also from anon, service_role, then execute to authenticated.

### Build steps
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1a | `supabase/migrations/20261105200000_create_edit_lock.sql` | new | M1 + its access | `20261102210537_create_notification.sql` | `pnpm db:up`; D5 |
| 1b | `supabase/migrations/20261105200001_create_model_object.sql` | new | M2 + its access | step 1a | D5; T14 |
| 1c | `supabase/migrations/20261105200002_create_model_version.sql` | new | M3 with its trigger function and trigger + its access | step 1a | D4, D5; T14 |
| 2 | `supabase/migrations/20261105200003_create_project_first_floor.sql` | new | M4 | `notification_broadcast_created` (20261102210537) | D7 |
| 3 | `supabase/migrations/20261105200004_create_model_save_functions.sql` | new | M5, M6 | `20261104094232_create_save_my_notification_settings.sql` | D1–D4, D6 |
| 4 | `app/src/server/db/database.types.ts` | change | regenerated | `pnpm db:types` | typecheck |
| 5 | `app/src/lib/events/registry.ts` | change | replaces `EventPayloads['model.saved']` (line 94) with `{ objectIds: string[] }`; see E4 | `'customer.created'` | typecheck |
| 6 | `app/src/server/model/model.ts` | new | section 3 types; `parseSaveRequest(body: unknown): SaveRequest \| null`; `saveObjects(client: SupabaseClient<Database>, projectId: string, req: SaveRequest): Promise<SaveResult>`; `createCheckpoint(client: SupabaseClient<Database>, projectId: string): Promise<CheckpointResult>` | `app/src/server/customers/customers.ts` | U1, R1 |
| 7 | `app/src/app/api/projects/[id]/objects/route.ts` | new | `POST`; `dynamic = 'force-dynamic'` | `app/src/app/api/notifications/[id]/open/route.ts`; emit as `app/src/app/api/settings/company/route.ts` lines 77–98 | R1 |
| 8 | `app/src/app/api/projects/[id]/checkpoints/route.ts` | new | `POST`; `dynamic = 'force-dynamic'` | step 7 | R2 |
| 9 | `app/src/server/messages/catalogs/en.ts`, `es.ts` | change | section 6 keys; Spanish by the builder (Q-0030 (a)) | `error.project_not_found` | `message-keys.test.ts` |
| 10 | `docs/architecture.md` | change | `### Model working copy (EZD-120a)` after `### Notification settings (EZD-140)` | that section | review |

### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Migration layout | One table per file (steps 1a–1c, each with its RLS, policies, grants); the builder's `20261105200000_create_model_tables.sql` is split into them and steps 2, 3 renamed to the timestamps above; no exemption | `scripts/db/__tests__/tenancy-migrations.test.mjs` T14 ("creates at most one table"); ARCH Migrations "One concern per file" |
| Seq type | `updated_seq` is `integer`, every bound and cast on it and on `base_seq` (M5 (5), (8), (9)) `integer`; `lock_epoch` and `p_lock_epoch` stay `bigint` | Section 3 types `updatedSeq`/`serverSeq: number`: `integer` is the column type whose every value is a JS number exactly, so the harness client, PostgREST and jsonb all return a number (the harness returns `bigint` as a string); overflow at 2147483647 raises 22003, never a silent wrap; spec fixes no type (03b rules 6, 9; 00d) |
| Floor list | One `model_object` per floor (M4): saved, versioned, migrated like any object; EZD-202 checks `level` against it | Q-0508; Q-0530; Q-0540; 03b rule 5 |
| Lock generation | `edit_lock.lock_epoch`, row made at first save or checkpoint; fixed until EZD-125 | 00d; 03e; AC-2 |
| Seq and conflicts | Per object, +1 per save; a conflict refuses the whole save, listing all | 03b rules 6, 9; AC-3; Q-0502 |
| Object checks | Shape only (per-type schema: EZD-202); other M3 columns' rules: EZD-121/122 | EZD-202 row; Q-0507 gap 16 |
| Route order | `await params` → `requireApiPermission('edit_model')` → id not `z.uuid()` → 404 → `requirePermission(p.ctx, 'edit_model', { projectId: id })` → (objects) bad JSON or `parseSaveRequest` null → 400 → rpc | ARCH Permission enforcement |
| Error mapping | 401 `not_signed_in` (guard); guard 403 and rpc 42501 → 403 `permission_denied` / `error.not_authorized`; P0002 → 404 `project_not_found`; 22023 → 400 `invalid_input`; other → throw; catch → `reportRouteFailure(e, ROUTE)`, 500 `db_unavailable`; both 400s `invalid_input`; key `error.<code>` unless named (existing but section 6's); all `Cache-Control: no-store` | company route; ARCH Errors and logging |
| parseSaveRequest | zod `strictObject`; `lockEpoch` int ≥ 0; `changes` an array, min 1, union on `deleted`: `{ id: z.uuid(), baseSeq: int 1–2147483647, deleted: true }` or `{ id, baseSeq: int 0–2147483647, deleted: false, type: /^[a-z][a-z0-9_]*$/, schemaVersion: int ≥ 1, data: z.record(z.string(), z.unknown()) }`; a repeated id → null | 03b rule 5; M2 |
| Event | On `saved` only: section 3 event, ids as returned, `actorId: p.session.appUserId`; kind `internal`; a throw → `reportError(new Error('model_saved_event_failed'), …)`; still 200 | AC-6; 07; EZD-283 |

### Do not touch
`project` table; `create_project`; `can`; existing migrations; tests other than E1–E8 and the EZD-120a test files.

Ticket row: phase-01.md:29.

## 2. Sources
`vault/spec/sections/` 03a; 03b rules 1, 5–9; 03c model_version, edit_lock; 03d model_object; 03e; 03f; 00d; 07 `model.saved`; 11 Performance rule 10. `decisions/03-data-model.md` Q-0502, Q-0507, Q-0508, Q-0530, Q-0540; Q-0201 (cascade). Gate checks: `scripts/db/__tests__/tenancy-migrations.test.mjs` T14; `app/src/server/db/rls.api-gate.test.ts`; `app/src/server/db/money-routes.test.ts` C1; `app/test-harness/errors/alert-lock.ts` (EZD-024 V7). No mockup; no research report.
Architecture: Events; Permission enforcement (EZD-102); Migrations; Row-level security (EZD-006); Policy test harness (EZD-006); Messages and language (t())

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| SQL | `public.save_objects(p_project uuid, p_lock_epoch bigint, p_changes jsonb) returns jsonb` | M5; tables M1–M3 |
| SQL | `public.create_checkpoint(p_project uuid) returns uuid`; `private.make_checkpoint(p_project uuid, p_actor uuid) returns uuid` | M6; the private one is for later callers |
| types | `app/src/server/model/model.ts` | `ObjectChange` = the two shapes of Decided "parseSaveRequest"; `SaveRequest = { lockEpoch: number; changes: ObjectChange[] }`; `SaveResult = { ok: true; tenantId: string; objects: { id: string; updatedSeq: number }[] } \| { ok: false; code: 'permission_denied' \| 'project_not_found' \| 'invalid_input' \| 'stale_lock_epoch' } \| { ok: false; code: 'save_conflict'; conflicts: { id: string; serverSeq: number }[] }`; `CheckpointResult = { ok: true; versionId: string } \| { ok: false; code: 'permission_denied' \| 'project_not_found' }` |
| route | `POST /api/projects/[id]/objects` | body `{ lockEpoch, changes }`; 200 `{ objects: [{ id, updatedSeq }] }`; 409 `{ error: { code: 'stale_lock_epoch', message_key: 'error.stale_lock_epoch' } }`; 409 `{ error: { code: 'save_conflict', message_key: 'error.save_conflict' }, conflicts: [{ id, serverSeq }] }`; others per Decided "Error mapping" |
| route | `POST /api/projects/[id]/checkpoints` | no body; 201 `{ version: { id } }`; others as above |
| event | `model.saved` | `{ objectIds: string[] }`; ctx `{ tenantId, projectId, actorId }` |
| harness | `GATED_RPC_CALLS` | `save_objects` args `{ p_project: N, p_lock_epoch: 0, p_changes: [] }`; `create_checkpoint` args `{ p_project: N }`; N = `'00000000-0000-4000-8000-000000000000'` |
| harness | `TABLE_GRANTS` | the three tables: `['SELECT']`, reason "Written only by the EZD-120a functions" |
| harness | `SEEDED_BY_TRIGGER` (`rls.api-gate.test.ts`) | `['role', 'model_object']` |
| harness | `MONEY_ROUTE_CASES` | two cases appended after `projects/counts/route.ts`: `projects/[id]/objects/route.ts` POST, params `{ id: env.projectId }`, body `{ lockEpoch: 0, changes: [{ id: randomUUID(), baseSeq: 0, deleted: false, type: 'wall', schemaVersion: 1, data: { n: 1 } }] }`, 200; `projects/[id]/checkpoints/route.ts` POST, no body, params `{ id: env.projectId }`, 201 |

## 4. Tests
U1 `app/src/server/model/model.test.ts`; D1–D7 `model.db.test.ts` beside it (`signIn` `serverDb` as `update-tenant.db.test.ts`; `setPermissions` (`app/test-harness/permissions/grant.ts`); fresh tenant per test; `cleanup()` in `afterAll`); R1, R2 `route.test.ts` beside each route (sign-in, `emit` mock as `app/src/app/api/settings/customers/route.test.ts`). Describes start `EZD-120a`; D1's title has `EZD-120a done when`. Editor = `['view_projects','edit_model']`; ids `crypto.randomUUID()`; snapshot = the project's rows before the call.
| Test | AC | Type | Input | Expected value | Source |
| --- | --- | --- | --- | --- | --- |
| U1 parse | 1, 3 | unit | upsert; delete; upper-case uuid; `{}`; `changes: []`; extra key; `baseSeq` 1.5; delete `baseSeq` 0; `type 'Wall'`; `schemaVersion` 0; `data: []`; repeated id | first three parse; the rest `null` | Decided "parseSaveRequest" |
| D1 changed rows | 1 | unit (db) | editor saves 10 objects, edits 3 | 10 at seq 1; then those 3 at seq 2, new `data`, `updated_by` editor; other 7 and the floor as snapshot | AC-1; M5 |
| D2 stale | 2 | unit (db) | admin sets `lock_epoch` 1, save sends 0; project with no edit_lock row, save sends 1 | `stale_lock_epoch` twice; rows as snapshot; no edit_lock row made | AC-2; M5 (6), (7) |
| D3 conflict | 3 | unit (db) | base 1 on a seq-2 object; that plus a valid new object; base 0 on a seq-1 object; base 1 on an unknown id | `server_seq` 2; 2 (new one unwritten); 1; 0; rows as snapshot | AC-3; Decided "Seq and conflicts" |
| D4 checkpoint | 4 | unit (db) | 10 objects, 1 deleted; checkpoint twice; a save; admin sets `model_json '{}'`, `parent_version_id` to the other id, `label 'x'` | +1 row per call; document = 9 objects + floor, M6 shape, by id; `schema_version` 1; parents null, first id; `created_by` editor, the rest M6 defaults; 55000, 55000, label saved; document unchanged after the save | AC-4; M3, M6 |
| D5 access | 5 | unit (db) | both functions as `['view_projects']` member; listed editor, project unlisted; other tenant's editor; `browserDb`; editor insert/update on the 3 tables; `describeTenantIsolation` per table (`makeRow`: M1–M3 required columns) | 42501; P0002; P0002; 42501; 42501; passes; nothing written; editor reads its rows | AC-5; M5 (2)–(4) |
| D6 invalid | 1 | unit (db) | `p_lock_epoch` -1; U1's refused bodies in snake keys | 22023, nothing written | M5 (5) |
| D7 floor | 7 | unit (db) | `createProjects(t, 1)`; `create_project` rpc | each: one model_object, M4 values | AC-7; M4 |
| R1 save route | 1–3, 5, 6 | unit (db) | no session; no `edit_model`; id `nope`; project unlisted; text body; `{ changes: [] }`; valid; stale; conflict; emit throws | 401; 403; 404; 404; 400; 400; 200 + one `model.saved` emit (section 3); 409; 409 + `conflicts`; 200; no emit otherwise; all `no-store` | AC-6; section 3 |
| R2 checkpoint route | 4, 5 | unit (db) | no session; no `edit_model`; bad id; editor | 401; 403; 404; 201, row made | section 3 |
Test-author edits: E1 `app/test-harness/rls/gate.ts` and E2 `app/test-harness/rls/table-grants.ts` add section 3's entries; E3 `app/src/server/db/rls.audit.test.ts` line 205 list adds the three tables in sorted place; E4 `app/src/server/events/emit.test.ts` lines 47, 48, 89: `{}` → `{ objectIds: [] }`; E5 `app/src/server/db/rls.api-gate.test.ts` line 28 `SEEDED_BY_TRIGGER` per section 3, comment "model_object: one floor per project from the EZD-120a project trigger (M4)" (M4 seeds a row the gate test's empty-tenant check would see); E6 `app/test-harness/money/route-cases.ts` the two section 3 cases (C1 needs a case per exported method; success request = R1's valid save and R2's editor call); E7 `objects/route.test.ts` holds `holdErrorAlertLock()` from the start of `beforeAll` to the end of `afterAll`, deleting `error_alert` rows after taking it, in `beforeEach` and before releasing, as `app/src/app/api/settings/company/route.test.ts` lines 307–337 (release in `finally`) (R1's failed emit calls `reportError`, which writes `error_alert`; EZD-024 V7); E8 `model.db.test.ts` D1 types `ids` as `string[]` (`const ids: string[] = …`) so `edited.includes(r.object_id as string)` typechecks (TS2345 on `randomUUID()`'s template type). Seq values stay numbers: D1 and D7 expect `updated_seq` `1`/`2` as numbers, which the `integer` column returns (Decided "Seq type"); no test converts.

## 5. Visual checklist
None.

## 6. Proposed wording
| Where | Text |
| --- | --- |
| `error.stale_lock_epoch` | Someone else is editing this project now, so these changes weren't saved. |
| `error.save_conflict` | Someone else changed the same items first, so these changes weren't saved. |
| First floor name (M4) | Floor 1 |

## 7. Security review
security-review: yes — data access, permissions, API, migrations.
Reviewers needed: code-reviewer · security-reviewer yes · calc-auditor no · ui-verifier no.

## 8. Complexity and model recommendation
High: core tables, definer functions, lock and conflict rules. Test-author and builder Opus 5.5.

## 9. Dependencies
EZD-005a, EZD-005b, EZD-133, EZD-118 (D7). Missing from the row: EZD-102, EZD-022, EZD-006, EZD-024 and EZD-252 (error-alert lock, E7), EZD-101 (`SEEDED_BY_TRIGGER`, E5) (all done).

## 10. Open questions
None.
