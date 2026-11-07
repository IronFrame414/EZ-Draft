# EZD-221a · Template objects on the server

- **ACs:** AC-EZD-221-3, AC-EZD-221-5, AC-EZD-221-6 (server write); AC-EZD-221-1, AC-EZD-221-2, AC-EZD-221-7 (values and checks only) (`vault/spec/acceptance-criteria.md:798-803`; split proposal `vault/plans/EZD-221.md` Part EZD-221a)
- **Complexity:** high (section 8)
- **Areas:** data-model, migrations, security, testing, geometry
- **User-visible result:** none on screen yet: `POST /api/projects` with a template (Galley kitchen, L-kitchen, 5x8 bath, Primary bath and its sizes) makes the project with four walls at the Ceiling height and one room named after the template, also for a Foreman without Edit model. EZD-221b adds the wizard step that sends it.
- Phase: 4 · Planned by: planner · Date: 2026-11-07 · Status: planned · Base: develop `6d0cc8ce`

## 1. What to build
Data: no table, column, money field or `schema_version` change. One `security definer` function M1: creates the project through the unchanged `public.create_project` (one project write path, 03b rule 1; migration `20261105105039`) and inserts the template's `model_object` rows in the same transaction (Q-0568; AC-5). Create projects only, not Edit model (Q-0566), so not through `save_objects` (needs `edit_model`, `20261105200004:40-50`); Q-0566/Q-0568 override 03b rule 6 for this write made before any edit lock exists. No drop or rename (ARCH Release safety). The floor comes from trigger `project_first_floor` (`20261105200003`); deferred trigger `model_object_level_check` (`20261105210000`) checks each `data.level` at commit.

M1, copy exactly (run on pinned PostgreSQL 17.11 in a rolled-back transaction 2026-11-07: compiles; execute anon f, authenticated t, service_role f; L-009; no `count(`, EZD-321):
```sql
create function public.create_project_with_objects(p_name text, p_address text, p_type text,
  p_customer_id uuid, p_scope_of_work text, p_objects jsonb)
returns table (project_id uuid, tenant_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_project uuid; v_tenant uuid; v_floor uuid; v_item jsonb; v_keys text array; v_id uuid; v_seen uuid array := '{}';
begin
  perform private.require_api_gate();
  select c.project_id, c.tenant_id into v_project, v_tenant
    from public.create_project(p_name, p_address, p_type, p_customer_id, p_scope_of_work) c;
  if p_objects is null or jsonb_typeof(p_objects) <> 'array'
     or jsonb_array_length(p_objects) < 1 or jsonb_array_length(p_objects) > 5 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(p_objects) as e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_item) as k;
    if v_keys is distinct from string_to_array('data,id,schema_version,type', ',')
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce((v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
      or coalesce(jsonb_typeof(v_item -> 'type'), '') <> 'string'
      or coalesce((v_item ->> 'type') not in ('wall', 'room'), true)
      or coalesce(jsonb_typeof(v_item -> 'schema_version'), '') <> 'number'
      or coalesce((v_item ->> 'schema_version') !~ '^[1-9][0-9]{0,8}$', true)
      or coalesce(jsonb_typeof(v_item -> 'data'), '') <> 'object'
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_id := (v_item ->> 'id')::uuid;
    if v_id = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
  end loop;
  select m.object_id into v_floor from public.model_object m
    where m.project_id = v_project and m.type = 'floor' and not m.deleted;
  insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by)
  select v_project, (e ->> 'id')::uuid, v_tenant, e ->> 'type',
    jsonb_set(e -> 'data', '{level}', to_jsonb(v_floor::text)), (e ->> 'schema_version')::integer, 1,
    private.app_user_id()
  from jsonb_array_elements(p_objects) as e;
  return query select v_project, v_tenant;
end
$$;
revoke all on function public.create_project_with_objects(text, text, text, uuid, text, jsonb) from public, anon, service_role;
grant execute on function public.create_project_with_objects(text, text, text, uuid, text, jsonb) to authenticated;
```
Header comment: `-- EZD-221a Build step 1 (vault/plans/EZD-221a.md section 1 M1; Q-0565; Q-0566; Q-0568; AC-EZD-221-3, -5, -6; L-016)` plus one line: project and template objects in one call, Create projects only, any error rolls back the whole call. Error order: gate; `create_project`'s (42501 `permission_denied`, 22023 `invalid_input` / `customer_unavailable`); 22023 `invalid_input` for `p_objects`. A missing floor would leave `level` JSON null, so the level check raises 23503 at commit; `createProject` rethrows it (route 500).

### Build steps
`S/` = `app/src/`; `G/` = `packages/geometry/src/`.
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1 | `supabase/migrations/<ts>_create_project_with_objects.sql` (`pnpm supabase migration new create_project_with_objects`; `<ts>` newer than develop's newest migration at merge time, today `20261106140002`; L-060; ARCH Release safety M3) | new | M1 exactly | `supabase/migrations/20261105105039_create_create_project.sql` | `pnpm db:up`; D1–D3 |
| 2 | `S/server/db/database.types.ts` | regenerate | `pnpm db:types` (adds `create_project_with_objects` Args, with `p_objects: Json`) | ARCH Local database | `node scripts/db/gen-types.mjs --check` |
| 3 | `S/lib/projects/templates.ts` | new | `TEMPLATE_KEYS = ['galley_kitchen', 'l_kitchen', 'bath_5x8', 'primary_bath'] as const`; `type TemplateKey = (typeof TEMPLATE_KEYS)[number]`; `TEMPLATE_DEFAULTS: Readonly<Record<TemplateKey, { width: number; length: number }>>`; `DEFAULT_CEILING_HEIGHT_IN = 96`; `TEMPLATE_SIZE_MAX_IN = 2400`; `TEMPLATE_ROOM_NAMES: Readonly<Record<TemplateKey, string>>`; `type TemplateBody = { key: TemplateKey; width: number; length: number; ceilingHeight: number }`; `isTemplateSize(n: unknown): n is number`; `templateAreaSqFt(width: number, length: number): number` | `S/lib/projects/new-project.ts` (no React, zod, Supabase or `@ezdraft/geometry` import) | U1–U4 |
| 4 | `S/lib/projects/new-project.ts` | change | `import type { TemplateBody } from './templates'`; `NewProjectBody` adds `template?: TemplateBody \| null`; nothing else | itself | `pnpm run typecheck` |
| 5 | `S/server/projects/template-objects.ts` | new | `TEMPLATE_LEVEL_PLACEHOLDER = '00000000-0000-4000-8000-000000000000'`; `type TemplateObjectRow = { id: string; type: 'wall' \| 'room'; schema_version: number; data: Record<string, unknown> }`; `buildTemplateObjects(t: TemplateBody, newId?: () => string): TemplateObjectRow[]` (default `newId` = `randomUUID` of `node:crypto`) | `S/server/benchmark/benchmark-project.ts` (server module importing `@ezdraft/geometry`) | U7, U8, U12 |
| 6 | `S/server/projects/projects.ts` | change | `NewProjectValues` adds `template: TemplateBody \| null`; `parseNewProject(body: unknown): NewProjectValues \| null` and `createProject(client, v): Promise<CreateProjectResult>` keep their signatures; header comment gains one `// EZD-221a Build step 6 (vault/plans/EZD-221a.md Decided "parseNewProject", "createProject"; Q-0566): a template goes through create_project_with_objects.` line | itself | U9, U10, R1; E3 |
| 7 | `S/server/messages/catalogs/en.ts` | change | after `'office.new_project.keep_editing'`: `'office.new_project.template_galley_kitchen': 'Galley kitchen'`, `'office.new_project.template_l_kitchen': 'L-kitchen'`, `'office.new_project.template_bath_5x8': '5x8 bath'`, `'office.new_project.template_primary_bath': 'Primary bath'`; no `es` entry (office is English only, ARCH Messages) | the `office.new_project.*` block | U4; `message-keys.test.ts` |
| 8 | `docs/architecture.md` | change | (a) new `### Blank templates (EZD-221)` after `### New project wizard (EZD-118)`: M1 (signature, Create projects only, `authenticated` only, in `GATED_RPC_CALLS`, errors); `create_project` stays the one project write path; `lib/projects/templates.ts` is geometry-free (EZD-221b's browser code imports it); `buildTemplateObjects`; route body `template`. (b) `### Model working copy (EZD-120a)` **Functions** bullet: after "the only object writer" add "(except `create_project_with_objects`, which writes a new project's template objects, EZD-221a)" | `### New project wizard (EZD-118)` | `node vault/tools/outline.mjs docs/architecture.md --section 'Blank templates (EZD-221)'` prints the section; review |

### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Template values (inches) | `galley_kitchen` 96 × 168; `l_kitchen` 141.5 × 168; `bath_5x8` 60 × 96; `primary_bath` 120 × 144 (`width` × `length`); every template, L-kitchen included, is a rectangle of four walls ("each is four walls and one room"). `TEMPLATE_ROOM_NAMES`: `Galley kitchen`, `L-kitchen`, `5x8 bath`, `Primary bath` | Q-0565; board `S01bWizard.dc.html:147-150` tile labels |
| `TEMPLATE_SIZE_MAX_IN` | The literal `2400`, not an import, so `templates.ts` stays geometry-free; U4 pins it to `MAX_WALL_LENGTH_IN` (`G/length.ts:10`) | Q-0570; EZD-201 |
| `isTemplateSize` | `typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= TEMPLATE_SIZE_MAX_IN && Number.isInteger(n * 16)` | Q-0570 (wall and room limits); Q-0207 (stored to 1/16") |
| `templateAreaSqFt` | `w16 = Math.round(width * 16)`, `l16 = Math.round(length * 16)`; return `Math.floor((2 * w16 * l16 + 36864) / 73728)` (whole SF, halves up, integer math) | Q-0207; Q-0559 (typed size is the inside finished face, so area = W × L); halves up as `roomAreaSqFt` (`G/rooms/area.ts:29`) |
| `parseNewProject` | `newProjectSchema` adds `template: z.strictObject({ key: z.enum(TEMPLATE_KEYS), width: size, length: size, ceilingHeight: size }).nullable().optional()` with `const size = z.number().refine(isTemplateSize)`; the result adds `template: parsed.data.template ?? null`. Any failure → `null` (route 400 `invalid_input`, route.ts:56) | AC-2; Q-0570; L-052 |
| `createProject` | `v.template === null` → the existing `create_project` call, unchanged (5 args). Else one `client.rpc('create_project_with_objects', { p_name, p_address, p_type, p_customer_id, p_scope_of_work, p_objects: buildTemplateObjects(v.template) } as unknown as CreateProjectWithObjectsArgs)` with `type CreateProjectWithObjectsArgs = Database['public']['Functions']['create_project_with_objects']['Args']`. Both paths share one error mapping and result: `42501` → `permission_denied`; `22023` with message containing `customer_unavailable` → `customer_unavailable`; other `22023` → `invalid_input`; any other error is thrown; no row → `throw new Error('create_project_no_row')`; row → `{ ok: true, projectId: row.project_id, tenantId: row.tenant_id }` | Q-0566; Q-0568; `S/server/projects/projects.ts:201-226` |
| `buildTemplateObjects` | `W = t.width`, `L = t.length`. Corners `c = [(0,0), (W,0), (W,L), (0,L)]` (+x east, +y north, `G/walls/wall.ts:3`; Width along x, Q-0570). Lines `chain[i] = { start: c[i], end: c[(i+1) % 4] }`. `side = thicknessSideFor({ kind: 'closed', chain })` (counter-clockwise, so `'right'`: thickness outside the room, Q-0559, Q-0569 (b)). For each line in order: `r = createWallData({ start, end, level: TEMPLATE_LEVEL_PLACEHOLDER, thicknessSide: side })`; `r.ok === false` → `throw new Error('template_wall_refused')`; data = `{ ...r.data, attributes: { ...r.data.attributes, height: t.ceilingHeight } }`. Then one room, `data` exactly `{ geometry: { boundary: c as 4 new {x,y} objects in that order }, status: 'existing', level: TEMPLATE_LEVEL_PLACEHOLDER, attributes: { name: TEMPLATE_ROOM_NAMES[t.key] }, closureOverride: null }`. Rows: 4 walls then the room, each `{ id: newId(), type, schema_version: CURRENT_SCHEMA_VERSION, data }`; M1 replaces `level`. Input not mutated | Q-0565; Q-0558; `G/schema/room.ts`; `G/walls/wall.ts` |
| Throw outcome | `template_wall_refused` cannot happen for a size `isTemplateSize` accepts (`wallLengthProblem` refuses only ≤ 1/64" and > 2400, `G/walls/wall.ts:30-34`; U8); if thrown, the route's catch answers 500 `db_unavailable` through `reportRouteFailure` (route.ts:78-81) before any rpc | L-059 |
| Route | `route.ts` unchanged; `project.created` payload unchanged (S01 Events lists no template) | S01 Events; route.ts:45-82 |
| Ids | `randomUUID()` gives lower-case ids; M1 compares ids as `uuid` (case-insensitive), as `save_objects` does | EZD-238 lesson; `20261105200004:100-104` |

### Do not touch
`public.create_project`, `save_objects` and every released migration; `project` and `model_object` policies and grants; `S/app/api/projects/route.ts`; `S/lib/projects/new-project.ts` functions (`canCreateProject`, `toCreateBody`, `isDraftEdited`, `applyType`, `editName`); `G/**`; every UI file (EZD-221b's).

Ticket row (`phase-02.md:32`): Scope: Plan vault/plans/EZD-221.md Split proposal Part EZD-221a: the migration, template values and checks, buildTemplateObjects and the create route writing a project with its walls and room. / Done when: A member with Create projects and not Edit model POSTs /api/projects with an L-kitchen template and gets 201, and the new project has four walls whose height is the Ceiling height and one room named L-kitchen. A refused template or object list writes no project and no object. / Depends on: EZD-118, EZD-120a, EZD-201, EZD-202, EZD-203, EZD-205a / Spec ref: S01 Template picker.

Done-when list (L-057): migration file (M1 text and header); `database.types.ts`; `templates.ts`; `new-project.ts` type line; `template-objects.ts`; `projects.ts` (schema, result field, rpc branch, header line); `en.ts` 4 keys; `docs/architecture.md` (a) and (b); test files U1–U4, U7–U8 + U12, U9–U10, D1–D3, R1; edits E1, E2, E3.

## 2. Sources
- Spec: `screens/S01-projects.md` Template picker (line 69), Validation (110), Events (117); `00e-glossary-phase-04.md` Blank template; 03b rules 1, 6; 03g Typed lengths; 11 Performance (one rpc per create, no budget touched).
- Decisions: Q-0565, Q-0568, Q-0570, Q-0203 (`decisions/05-screens.md`); Q-0566 (`10-permissions-and-settings.md`); Q-0559, Q-0558, Q-0569 (`09-calculations-and-rules.md`); Q-0561 (`04-app-shell-and-global-ui.md`; part b's field text); Q-0207, Q-0592 (`QUESTIONS-answered.md`); Q-0451 (claim, never a parameter).
- Mockups: `S01bWizard.png` + `html/project/S01bWizard.dc.html:147-150` (tile labels, the room names); no screen changes here.
- Parent plan: `vault/plans/EZD-221.md` Split proposal Part EZD-221a and sections 1–10 (rows reused; M1 key check rewritten so an element `{}` or a non-string field is refused 22023 rather than failing later with 23502).
- Merged code read 2026-11-07 on `6d0cc8ce`: the migrations and files cited in sections 1, 3 and 4, plus `rls.api-gate.test.ts:111-114, 184-194` (T22 (c), (j)) and `cap-locks.ts:172`.
- Dependency STATUS deviations (EZD-118 dialog width, EZD-120a one table per file, EZD-202 migrate-first, EZD-203 two-level copy, EZD-205a vertex order and rounding margin) do not touch this contract.
- Research: no report covers this ticket (no retriever dispatched).

Architecture: New project wizard (EZD-118); Model working copy (EZD-120a); Rooms (EZD-205a); Migrations; Local database; Release safety (EZD-023a); Policy test harness (EZD-006); Messages and language (t())

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| SQL | `public.create_project_with_objects(p_name text, p_address text, p_type text, p_customer_id uuid, p_scope_of_work text, p_objects jsonb) returns table (project_id uuid, tenant_id uuid)` | M1; `authenticated` only; errors as `create_project`, plus 22023 `invalid_input` for every `p_objects` refusal in M1 (D2 lists them) |
| module | `app/src/lib/projects/templates.ts`; `app/src/server/projects/template-objects.ts` | steps 3, 5 |
| type | `NewProjectBody.template?: TemplateBody \| null` (`lib/projects/new-project.ts`); `NewProjectValues.template: TemplateBody \| null` (`server/projects/projects.ts`; absent → `null`) | steps 4, 6 |
| route | `POST /api/projects` | body adds optional `template: { key, width, length, ceilingHeight } \| null` (inches); a bad template → 400 `{ error: { code: 'invalid_input', message_key: 'error.invalid_input' } }`; the rest as EZD-118 (201 `{ project: { id } }`, 401, 403, 400 `customer_unavailable`, 500 `db_unavailable`) |
| harness | `GATED_RPC_CALLS` (`app/test-harness/rls/gate.ts`) | after the `create_project` entry: `// EZD-221a section 3 (vault/plans/EZD-221a.md): the template create function, authenticated only.` then `{ fn: 'create_project_with_objects', args: { p_name: 'x', p_address: 'x', p_type: 'kitchen', p_customer_id: null, p_scope_of_work: null, p_objects: [] } }` |
| harness | `GUARDED_FUNCTIONS` (`rls.api-gate-backstop.test.ts`) | `'create_project_with_objects'` after `'create_project'` |
| messages (office, en) | on the board | the 4 keys of step 7 |
| used | `@ezdraft/geometry` | code: `createWallData`, `thicknessSideFor`, `CURRENT_SCHEMA_VERSION`; tests also `MAX_WALL_LENGTH_IN`, `DEFAULT_WALL_LAYERS`, `parseStoredObject`, `reconcileRooms`, `roomAreaSqFt` |
| used | harness | `app/test-harness/rls/fixtures.ts` (`createTenant`, `createMember`, `signIn`, `harnessSql`, `cleanup`, `closeHarness`, `Member`, `Session`); `app/test-harness/permissions/grant.ts` (`setPermissions`) |

## 4. Tests
Baseline (L-036): on `6d0cc8ce` the two new modules do not exist, `parseNewProject` refuses a `template` key, `createProject` calls only `create_project` and M1 is missing, so every row fails there. Channels: U rows return values and stub `rpc` calls; D rows SQL error code and table rows; R1 HTTP status, JSON body and table rows. 13 tests, titles prefixed with the ID, in top-level `describe('EZD-221a …')` blocks (ARCH Test scope). Files: U1–U4 `app/src/lib/projects/templates.test.ts`; U7, U8, U12 `app/src/server/projects/template-objects.test.ts`; U9, U10 `app/src/server/projects/projects.templates.test.ts` (stub client `{ rpc: vi.fn() }` cast to `SupabaseClient<Database>`); D1–D3 `app/src/server/projects/create-project-with-objects.db.test.ts` (pattern `create-project.db.test.ts`: gated `serverDb` of `signIn`, own tenants, `cleanup` + `closeHarness` in `afterAll`); R1 `app/src/app/api/projects/route.templates.test.ts` (pattern `create.test.ts`: `next/headers` mocked, members signed in, `emit` wrapped; own tenant; `cleanup` + `closeHarness` in `afterAll`). Sizes in inches as JS numbers. Ids in U7/U12: `idSeq` = `` () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` `` from n = 0. No other test or helper.
| Test | AC | Type | Input | Expected value (wrong implementation it rejects) | Source |
| --- | --- | --- | --- | --- | --- |
| U1 constants | 1 | unit | `TEMPLATE_KEYS`, `TEMPLATE_DEFAULTS`, `DEFAULT_CEILING_HEIGHT_IN`, `TEMPLATE_ROOM_NAMES` | keys in the order of step 3; widths/lengths 96/168, 141.5/168, 60/96, 120/144; 96; names `Galley kitchen`, `L-kitchen`, `5x8 bath`, `Primary bath` (rejects 141 for 11' 9 1/2", swapped width and length) | Q-0565; Q-0570; board `:147-150` |
| U2 area | 7 | unit | `templateAreaSqFt` (96,168) (141.5,168) (60,96) (120,144) (12,6) (12,5.9375) (2400,2400); and for each pair, `roomAreaSqFt` of the rectangle `[(0,0),(w,0),(w,l),(0,l)]` | 112, 165, 40, 120, 1, 0, 40000; each equals `roomAreaSqFt` (rejects truncation, where (12,6) gives 0; rejects banker's rounding; rejects drift from the editor's label area) | Q-0207; 03g; Q-0559; `G/rooms/area.ts:29` |
| U3 size check | 2 | unit | `isTemplateSize` of 0, -1, 0.0625, 0.03125, 2400, 2400.0625, NaN, Infinity, `'96'`, null | false, false, true, false, true, false, false, false, false, false (rejects `>= 0`, a missing 1/16 check, a string coerced) | Q-0570; Q-0207 |
| U4 no drift | 1, 3 | unit | `TEMPLATE_SIZE_MAX_IN` vs `MAX_WALL_LENGTH_IN` (`@ezdraft/geometry`); `en['office.new_project.template_' + key]` (`app/src/server/messages/catalogs/en`) vs `TEMPLATE_ROOM_NAMES[key]` for each key | equal; equal for all 4 (rejects a tile label and room name that differ) | EZD-201 `G/length.ts:10`; Q-0565 |
| U7 build L-kitchen | 3 | unit | `buildTemplateObjects({ key: 'l_kitchen', width: 141.5, length: 168, ceilingHeight: 108 }, idSeq)` | 5 rows, types wall ×4 then room; ids `…000000000001` to `…000000000005` in order; wall lines (0,0)-(141.5,0), (141.5,0)-(141.5,168), (141.5,168)-(0,168), (0,168)-(0,0); each wall `thicknessSide` `'right'`, `height` 108, `thickness` 4.5, `layers` `toEqual(DEFAULT_WALL_LAYERS)`, `status` `'existing'`; room `data` `toEqual({ geometry: { boundary: [{x:0,y:0},{x:141.5,y:0},{x:141.5,y:168},{x:0,y:168}] }, status: 'existing', level: TEMPLATE_LEVEL_PLACEHOLDER, attributes: { name: 'L-kitchen' }, closureOverride: null })`; every `level` the placeholder; every `schema_version` `CURRENT_SCHEMA_VERSION`; each `parseStoredObject(row).ok` true; the input object unchanged (rejects height 96, thickness inside the room, centred walls) | Q-0565; Q-0559; Q-0558; Q-0569 (b); `G/walls/wall.ts` |
| U8 build extremes | 3 | unit | each of the 4 keys with width = length = ceilingHeight = 0.0625, then each at 2400 | 5 rows each; every `parseStoredObject` ok; no throw (rejects a hard-coded size, a limit below 2400) | Q-0570; `G/walls/wall.ts:30-34` |
| U12 reconcile keeps the room | 3 | unit | for each key at its `TEMPLATE_DEFAULTS` and ceiling 96: `rows = buildTemplateObjects(...)`; `objects = rows.map(r => parseStoredObject(r))` (each ok); `reconcileRooms(objects, TEMPLATE_LEVEL_PLACEHOLDER, () => { throw new Error('no new id') })` | `toEqual({ create: [], update: [], delete: [] })` (the room keeps its id and name) (rejects a boundary on the wall centre line or outer face, a reversed thickness side) | Q-0592 (a); `G/rooms/sync.ts` |
| U9 parse | 2, 6 | unit | P118 `valid` body (`new-project-input.test.ts:9-15`) plus: `template` absent; `null`; `{ key: 'l_kitchen', width: 141.5, length: 168, ceilingHeight: 96 }`; key `'garage'`; width 0; width 2400.0625; width 141.53; width `'141.5'`; ceilingHeight missing; extra key `foo` in template; `template: 'l_kitchen'`; `template: []` | `template` null, null, the object (`toEqual`); each of the rest → `parseNewProject` null (rejects a non-strict template object, a size outside 1/16" steps) | AC-2; Q-0570; L-052 |
| U10 create call | 3, 6 | unit | `createProject(stub, v)`: (a) `template` null, stub `{ data: [{ project_id: P, tenant_id: T }], error: null }`; (b) L-kitchen 141.5/168/96, same stub; (c) (b) with error `{ code: '42501' }`; (d) error `{ code: '22023', message: 'invalid_input' }`; (e) error `{ code: '22023', message: 'customer_unavailable' }`; (f) error `{ code: '23503', message: 'level_not_found' }`; (g) `{ data: [], error: null }` | (a) one call `('create_project', { the 5 args })` exactly, result ok; (b) one call, name `'create_project_with_objects'`, the same 5 args plus `p_objects` of length 5 (types wall ×4, room; room name `L-kitchen`), result `{ ok: true, projectId: P, tenantId: T }`; (c) `permission_denied`; (d) `invalid_input`; (e) `customer_unavailable`; (f) rejects with that error; (g) rejects `create_project_no_row` (rejects two calls, a `save_objects` call, a template dropped) | Q-0566; Q-0568; `projects.ts:213-226` |
| D1 writes | 3, 6 | unit (db) | member scope `listed`, permissions `['create_projects']` only (no `edit_model`); calls M1 with `buildTemplateObjects(L-kitchen 141.5/168, ceiling 108)` | one row `{ project_id, tenant_id: the member's tenant }`; one `membership_project` row for the member and project; that project's `model_object`: 1 floor + 4 walls + 1 room; each non-floor `data` equals the row sent with `level` = the floor's `object_id`; wall `data->'attributes'->>'height'` `'108'`; `updated_seq` 1; `updated_by` = the member's `appUserId` (rejects needing Edit model, a second listing path, a level left as the placeholder) | Q-0566; Q-0451; M1 |
| D2 refusals | 5 | unit (db) | the same creator; `p_objects`: `null`; `{}`; `[]`; 6 valid rows; `[1]`; `[{}]`; a row with extra key `x`; a row without `data`; `id` `'nope'`; `id` 5; `type` `'opening'`; `type` `'floor'`; `schema_version` 0; `'1'`; 1.5; 1234567890; `data` `[]`; two rows with ids `abcdef12-3456-4abc-8def-0123456789ab` and the same in upper case | each error code `22023`; the tenant's `project` and `model_object` row counts the same after every call (rejects a project written before the objects are checked, a NOT NULL error 23502 for `{}`, a case-sensitive duplicate check, an integer cast overflow) | Q-0203; Q-0568; L-048; L-061 |
| D3 permission | 6 | unit (db) | member with `[]`; member with `['edit_model']` only; valid L-kitchen rows; then `has_function_privilege` on M1 for `anon`, `authenticated`, `service_role` (harnessSql) | 42501 both; counts unchanged; false, true, false (rejects Edit model accepted for Create projects, a grant to anon) | `create_project`; Q-0566; L-016 |
| R1 route | 2, 3, 6 | unit (db) | member scope `all`, `['create_projects']` (no `edit_model`): POST the P118 valid body + `template: { key: 'l_kitchen', width: 141.5, length: 168, ceilingHeight: 108 }`; POST the same with width 0; POST with no `template` | 201 `{ project: { id } }`, and that project has 4 `wall` rows with `data->'attributes'->>'height'` `'108'` and 1 `room` with `data->'attributes'->>'name'` `'L-kitchen'`; 400 `invalid_input`, the tenant's project count unchanged; 201 and only the floor row (rejects a route that drops `template` or demands `edit_model`) | Done-when; Q-0566; AC-2 |

Test-author edits to earlier tests (L-021, L-042, L-049). E1: `app/test-harness/rls/gate.ts` `GATED_RPC_CALLS`, the section 3 entry. E2: `app/src/server/db/rls.api-gate-backstop.test.ts` `GUARDED_FUNCTIONS`, the section 3 entry. E3: `app/src/server/projects/new-project-input.test.ts` U2, its two `toEqual` objects (lines 19-25 and 26-32) gain `template: null`, because `parseNewProject` now always returns the field. Grepped on `6d0cc8ce`: no test lists `office.new_project.` keys exactly (only `ZoomStack.test.tsx` reads `office.plan.` keys), so there is no message-list edit; `scripts/db/__tests__/tenancy-migrations.test.mjs` FILE_ORDER matches whole file names, so it needs no edit.

## 5. Visual checklist
None (no screen changes; EZD-221b).

## 6. Proposed wording
None. The four labels are the board's tile text (`S01bWizard.dc.html:147-150`).

## 7. Security review
security-review: yes. Areas: permissions (a Create-projects-only member writes model objects, Q-0566), data access (a new definer function inserting `model_object` rows; tenant, scope and listing come from `create_project` and the session claim, never a parameter, Q-0451), API (`POST /api/projects` body), migrations (M1; no drop).
Reviewers needed: code-reviewer · calc-auditor yes (U2 area rounding, U3 sixteenths, U7 face side) · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation
High: a definer function that widens who writes model objects, with SQL input checks over a client-reachable route (PROCESS.md section 4). Test-author Sonnet 5.5; builder Opus 5.5.

## 9. Dependencies
- Row: EZD-118 (`create_project`, `parseNewProject`, `createProject`, route), EZD-120a (`model_object`, first-floor trigger), EZD-201 (`MAX_WALL_LENGTH_IN`), EZD-202 (`parseStoredObject`, level check), EZD-203 (`createWallData`, `thicknessSideFor`), EZD-205a (room shape, `CURRENT_SCHEMA_VERSION` 3, `reconcileRooms`). All done. None missing; EZD-016a is not needed (no visual checklist).
- Dependents: EZD-221b uses `templates.ts`, `NewProjectBody.template` and the four keys, and adds the rest of the parent's keys and the screens. Its fields read sizes with `parseLength(text, 'wall_room')` (parent plan Decided `readTemplate`); `isTemplateSize` is this ticket's server check of the result, and `templateAreaSqFt` is the one area both use.
- Risks: a migration merged after this plan must still sort before M1's timestamp (step 1); `createProject`'s two paths must keep one error mapping (U10).

## 10. Open questions
None. Q-0592 (a) is applied as U12.
