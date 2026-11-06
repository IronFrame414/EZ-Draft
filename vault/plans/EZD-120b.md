# EZD-120b · Patch store, outbox and autosave

- **ACs:** AC-EZD-120b-1 to AC-EZD-120b-5
- **Complexity:** high
- **Areas:** data-model, security, testing, dependencies
- **User-visible result:** none yet; the editor's edit, undo and autosave engine.
- Phase: 3 · Planned by: planner · Date: 2026-11-04 · Status: planned · Re-validated 2026-11-05 against f8bd91f1, a0c9e51a · Plan gap 2026-11-05: storage failure (Q-0596)

## 1. What to build
No table or money field. `S/` = `app/src/`; P120a, P202 = their section 3; `Change`, `Objects`: section 3 patches row. Cross-module type imports use `import type`. Row: `phase-01.md:30`.

### Build steps
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/package.json`, `pnpm-lock.yaml` | change | `pnpm --filter @ezdraft/app add zustand@5.0.15`, then `add -D fake-indexeddb@6.2.7` | P202 step 12 | `pnpm run typecheck` |
| 2 | `docs/architecture.md` | change | Dependencies row `fake-indexeddb` `6.2.7` app "Unit tests: IndexedDB in Vitest" EZD-120b; Folder layout lines `src/editor/model/`, `src/lib/outbox/`; new `### Patch store and outbox (EZD-120b)`: section 3 in prose; in `### Unsaved edits and drafts (EZD-103b)` "Draft store and lifetime", `idb` is imported only in `draft-store.ts` and `S/lib/outbox/outbox-idb.ts` (Q-0596) | EZD-103b section | `pnpm lint` |
| 3 | `S/lib/outbox/model-api.ts` | new | section 3 | `S/lib/projects/projects.ts` | U9 |
| 4 | `S/lib/outbox/outbox.ts` | new | section 3 | `S/lib/settings/draft.ts` | U3 |
| 5 | `S/lib/outbox/outbox-idb.ts` | new | section 3 | `S/components/settings/draft-store.ts` | U4 |
| 6 | `S/lib/outbox/outbox-sync.ts` | new | section 3 | `S/lib/projects/projects-store.ts` | U5–U8, D1 |
| 7 | `S/editor/model/patches.ts` | new | section 3 | none (pure) | U1 |
| 8 | `S/editor/model/model-store.ts` | new | section 3 | none (`zustand/vanilla` `createStore`) | U1, U2 |
| 9 | `S/server/model/model.ts` | change (EZD-120a's) | section 3 | `S/server/settings/shell-data.ts` | R1 |
| 10 | `S/app/api/projects/[id]/model/route.ts` | new | `GET(request: Request, { params }: { params: Promise<{ id: string }> })`; `dynamic = 'force-dynamic'` | `S/app/api/projects/route.ts` | R1–R3 |

### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Patch | store sets `before` (null: add); `after` null: remove; an id twice → `throw new Error('duplicate_object_id')`, no change; empty edit → `[]`, no `onCommit`, not recorded | 11 rule 1; 03b rule 4 |
| Undo, redo | `applyEdit` pushes the `Edit` on `past`, clears `future`; `undo` applies the same `Edit` back onto `future`; `redo` the reverse; empty → `[]`; no depth limit (no source) | AC-2 |
| Changed ids | a commit returns its ids in patch order, sets `lastChangedIds`, calls `onCommit` once with those `Change`s; new `Map`, other values keep identity | AC-3; 11 rule 2 |
| Device database | `ezdraft-device` v1, stores `outbox`, `working_copy`, keys `[appUserId, tenantId, projectId, objectId]`; a storage uses only `IDBKeyRange.bound([u, t], [u, t, []])`; one lazy connection, closed by `close()` or `blocking`; `idb` only here (pinned; no guard test) | Q-0503; 03a |
| `put` | one transaction, both stores; new entry: `baseSeq` = `working_copy` `updatedSeq` or 0, `rev` 1, `queuedAt` now; existing: new `value`, `rev + 1`, rest kept | 03b rules 6, 9 |
| Batch | `list` sorted by `queuedAt`, projectId, id; first entry's project and `lockEpoch`, ≤ 100 (`MAX_CHANGES_PER_SAVE`, build choice); null value with `baseSeq` 0 → `drop`, not sent | P120a parseSaveRequest |
| Request | `{ lockEpoch, changes }`; a value → exactly `{ id, baseSeq, deleted: false, type, schemaVersion, data }`, null → exactly `{ id, baseSeq, deleted: true }` (strict: any other key is 400 `invalid_input`) | `S/server/model/model.ts` `parseSaveRequest` |
| Saved match | `commit` matches `saved` to `sent` by id (the response is in `object_id` order, not request order) | `supabase/migrations/20261105200004_create_model_save_functions.sql` step (10) |
| `commit`, `drop` | one transaction; `rev` unchanged → delete entry, else `baseSeq` = `updatedSeq`; `working_copy` = sent value + `updatedSeq` (a delete removes it); `drop` = delete if `rev` unchanged | 03b rule 9 |
| `classifySave` | 200 `saved`; 400, 401, 403, 404, 409 `refused` (`error.code`); else or throw `failed` | P120a; P202 |
| Refused | entries kept; `error`, `problem` = code; no drain until `retry()`; `retry()` sets `problem` null and drains now, as `flush()` (U7: 1 fetch at 0 ms after it) | Q-0502 (to EZD-299); orchestrator answer 2026-11-05 (answered-agent) |
| Failed | entries kept; retry after `RETRY_DELAYS_MS` [2000, 4000, 8000, 16000, 30000] (last repeats); `error` from the 3rd failure in a row, else `pending`; 200 resets | Q-0507 gaps 4, 5 |
| Drain | `enqueue` restarts one `debounceMs` (2000) timer that drains: `lock.tryRun('ezdraft-outbox:<appUserId>:<tenantId>')`, one fetch at a time until empty, refused, failed or the timer pending; lock busy → retry in 2,000 ms; `flush()` drains now, resolves when done | 00d; ticket row |
| States | `idle` before any enqueue; `pending`; `saving` in a fetch; `saved` + `lastSavedAt` when a drain empties the outbox; `offline` while `online.getSnapshot()` is false (no drain; true → drain now) | S03 States; Q-0501; EZD-015a |
| `webTabLock` | `navigator.locks.request(name, { ifAvailable: true }, cb)`; `cb(null)` → `{ ran: false }`; no `navigator.locks` → run `fn` | build choice |
| Storage failure | Any storage throw: `captureBrowserError(e, 'outbox.storage')` via `import()`, status `error`, problem `storage_failed`; `enqueue` still resolves. A failed `put` adds `{ projectId, lockEpoch, changes, now }` to the end of an in-memory pending list; while the list is non-empty each later `enqueue` appends there and calls no `put`. A failed post-save `commit` adds `{ projectId, sent, saved }` to the front of the list. A failed `list` or `drop` keeps nothing (entries stay stored). While the list is non-empty: no fetch starts, no timer or `online` change drains, status stays `error` (outranks `offline`, never `saved`), a refused or failed outcome of a fetch already in flight leaves problem `storage_failed`. `retry()` first runs the list in order (`commit(projectId, sent, saved)`; `put(projectId, lockEpoch, changes, now)` with the original `now`), removing each on success; a throw stops it (rest kept, captured again, still `error`, no fetch); empty list → the Refused row's `retry()` (problem null, drain now) | Q-0596 (answered-agent 2026-11-05); ARCH Errors |
| Load route | P120a Route order with `view_projects`, then `loadModel(createSessionClient(), id, p.ctx)`, null → 404; catch → `reportRouteFailure(e, '/api/projects/[id]/model')`, 500; `no-store` | P120a |
| `loadModel` | session client (RLS); in parallel `project` (`id, name, tenant_id, customer:customer_id(name)`, `.maybeSingle()`), `edit_lock.lock_epoch` (none → 0), `model_object` (`deleted = false`, `.order('object_id').limit(1000)`), then `.gt('object_id', last)` pages until a short one; archived not filtered | 03b rule 1; `supabase/config.toml` `max_rows = 1000`; Q-0507 gap 16 |
| Object read | `parseStoredObject({ id: object_id, type, schema_version, data })` only (it migrates first; no separate `migrateStoredObject` call); ok → `{ type, schemaVersion: CURRENT_SCHEMA_VERSION, data: object.data }`; else only its `issue` in `invalid` | `packages/geometry/src/schema/index.ts` (EZD-202 deviation); 03b rule 5 |
| `canEdit` | `can(ctx, 'edit_model', { projectId })` | Q-0568 |
| Reopen | `loadWorkingCopy` = loaded objects + that project's entries on top; caller saves the load by `replaceMirror` | AC-4; 03a |

### Do not touch
P120a's code; `draft-store.ts`; `online.ts`; no page or message key.

## 2. Sources
- Spec: 03a; 03b rules 1, 4–7, 9; S03 States; 00d; 11 rules 1, 2.
- Decisions: Q-0568 (05); Q-0501 (04); Q-0502, Q-0503, Q-0507, Q-0530 (03); Q-0573 (a).
- `split-EZD-120b.md` part b; P120a, P202, P102, P133.
- `npm view fake-indexeddb` (2026-11-04): 6.2.7, no dependencies, no install script.
- Research: no report covers it.
- Merged code (re-validated 2026-11-05): `S/server/model/model.ts`; `S/app/api/projects/[id]/objects/route.ts`; `packages/geometry/src/schema/index.ts`, `migrate.ts`; `supabase/migrations/20261105200000`–`200004`, `20261105210000`; STATUS deviations of EZD-120a and EZD-202.

Architecture: Dependencies; Entry points and lazy modules (EZD-020); Unsaved edits and drafts (EZD-103b); Permission enforcement (EZD-102)

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| model-api | `S/lib/outbox/model-api.ts` | `ObjectValue = { type: string; schemaVersion: number; data: Record<string, unknown> }`; `LoadedObject = ObjectValue & { id: string; updatedSeq: number }`; `ModelLoad = { project: { id: string; name: string; clientName: string \| null }; viewer: { appUserId: string; tenantId: string; membershipId: string; canEdit: boolean }; lockEpoch: number; objects: LoadedObject[]; invalid: ObjectIssue[] }` (`ObjectIssue` from `@ezdraft/geometry`, P202); `ModelLoadResult = { ok: true; model: ModelLoad } \| { ok: false; status: number; code: string }`; `fetchModel(projectId: string, opts?: { fetchImpl?: typeof fetch }): Promise<ModelLoadResult>` (thrown fetch → 0, `network`); `loadWorkingCopy(load: ModelLoad, entries: OutboxEntry[]): Map<string, ObjectValue>` |
| outbox | `S/lib/outbox/outbox.ts` | `Actor = { appUserId: string; tenantId: string; membershipId: string }`; `OutboxEntry = { projectId: string; id: string; baseSeq: number; lockEpoch: number; value: ObjectValue \| null; rev: number; queuedAt: number }`; `RefusedCode = 'invalid_input' \| 'invalid_object' \| 'not_signed_in' \| 'permission_denied' \| 'project_not_found' \| 'stale_lock_epoch' \| 'save_conflict'`; `SaveOutcome = { kind: 'saved'; objects: { id: string; updatedSeq: number }[] } \| { kind: 'refused'; code: RefusedCode } \| { kind: 'failed' }`; `Batch = { projectId: string; lockEpoch: number; send: OutboxEntry[]; drop: OutboxEntry[] }`; `pickBatch(entries: OutboxEntry[]): Batch \| null`; `classifySave(status: number, body: unknown): SaveOutcome` |
| storage | type `OutboxStorage` exported from `S/lib/outbox/outbox.ts`; `S/lib/outbox/outbox-idb.ts`: `createIdbOutboxStorage(actor: Actor): OutboxStorage` | members: `put(projectId: string, lockEpoch: number, changes: Change[], now: number): Promise<void>`; `list(): Promise<OutboxEntry[]>`; `commit(projectId: string, sent: OutboxEntry[], saved: { id: string; updatedSeq: number }[]): Promise<void>`; `drop(entries: OutboxEntry[]): Promise<void>`; `replaceMirror(projectId: string, objects: LoadedObject[]): Promise<void>`; `close(): void` |
| outbox-sync | `S/lib/outbox/outbox-sync.ts` | `TabLock = { tryRun<T>(name: string, fn: () => Promise<T>): Promise<{ ran: true; value: T } \| { ran: false }> }`; `webTabLock(): TabLock`; `SyncState = { status: 'idle' \| 'pending' \| 'saving' \| 'saved' \| 'offline' \| 'error'; failures: number; problem: RefusedCode \| 'storage_failed' \| null; lastSavedAt: number \| null }`; `createOutboxSync(o: { actor: Actor; storage: OutboxStorage; fetchImpl?: typeof fetch; lock?: TabLock; online?: OnlineSource; debounceMs?: number }): OutboxSync` (defaults `fetch`, `webTabLock()`, `createOnlineSource()` of `S/lib/network`, 2000; zustand vanilla store); `OutboxSync = StoreApi<SyncState> & { enqueue(projectId: string, lockEpoch: number, changes: Change[]): Promise<void>; flush(): Promise<void>; retry(): void; dispose(): void }` |
| patches | `S/editor/model/patches.ts` | `Change = { id: string; value: ObjectValue \| null }` (null = deleted); `Objects = ReadonlyMap<string, ObjectValue>`; `Patch = { id: string; before: ObjectValue \| null; after: ObjectValue \| null }`; `Edit = { patches: Patch[] }`; `makeEdit(objects: Objects, changes: Change[]): Edit`; `applyEditTo(objects: Objects, edit: Edit, direction: 'forward' \| 'back'): Map<string, ObjectValue>` |
| model-store | `S/editor/model/model-store.ts` | `ModelState = { objects: Objects; past: Edit[]; future: Edit[]; lastChangedIds: string[] }`; `ModelStore = StoreApi<ModelState> & { applyEdit(changes: Change[]): string[]; undo(): string[]; redo(): string[] }`; `createModelStore(o: { objects: Objects; onCommit?: (changes: Change[]) => void }): ModelStore` |
| server | `S/server/model/model.ts` | `loadModel(client: SupabaseClient<Database>, projectId: string, ctx: PermissionContext): Promise<ModelLoad \| null>` |
| route | `GET /api/projects/[id]/model` | 200 `ModelLoad` (objects by id); 401; 403 `permission_denied`; 404 `project_not_found`, one body for unknown, malformed, other-tenant, out-of-scope; 500 `db_unavailable`; keys as P120a |
| handoff | EZD-120d | server check: a save runs only under the queuing `membershipId` (Q-0503) |
| harness | `app/test-harness/money/route-cases.ts` (test-author) | `MONEY_ROUTE_CASES` + a `MoneyRouteCase` (P133) GET `api/projects/[id]/model` 200, `params: { id: env.projectId }`, shaped as the `POST projects/[id]/checkpoints` case (as a GET), placed after it |

## 4. Tests
Quoted sources = Decided rows. Unit values: `v(n)` = `{ type: 'floor', schemaVersion: 1, data: { name: 'F' + n, order: n } }`; entries `baseSeq` 0, `rev` 1, `lockEpoch` 0; refused body `{ error: { code } }`; held fetch = pending promise. IDB: `fake-indexeddb/auto`, new `IDBFactory()` per test. DB rows: local database, real sign-in, as `S/app/api/settings/customers/route.test.ts`; walls as P202's sample on the project's floor (P120a M4). "Floor" in R1, D1 is the project's first floor, made by the insert trigger (`20261105200003`), never a second insert; admin rows set `updated_seq` ≥ 1 and a live non-floor `data.level` = that floor's `object_id` (`20261105210000`, deferred check). R3 mocks only `loadModel` (throws) and holds `holdErrorAlertLock` (EZD-252).
| Test | AC | Type (unit / browser / perf) | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| U1 | 2 | unit | A–C; replace A, undo, redo; add D, undo; remove B, undo | `past.at(-1)`, then `future.at(-1)`, then `past.at(-1)` toBe the same edit; A old, then new; D gone; B back | "Undo, redo" |
| U2 | 3 | unit | 10 objects; edit B, C; B twice; empty | `['B','C']` = `lastChangedIds`; `onCommit` once with B, C; 8 others same identity; twice throws `duplicate_object_id`, no change; empty `[]` | "Patch", "Changed ids" |
| U3 | 1 | unit | 101 entries; two projects; null/0 entry; 200, 400, 401, 403, 404, 409 ×2, 500, 502 | 100 then 1; oldest project first; null/0 in `drop`; per `classifySave` | "Batch", "classifySave" |
| U4 | 4 | unit | `put` as (u1, t1), (u2, t1), (u1, t2); reopen; `put` twice; mirror seq 5; `commit` after a later `put` | each sees only its own, after reopen too; `rev` 2, `baseSeq` kept; `baseSeq` 5; re-based, kept | Q-0503; "put", "commit" |
| U5 | 1 | unit (fake timers) | enqueue at 0 and 1,500 ms; one during a held fetch | 0 fetch at 3,499 ms, 1 at 3,500; ≤ 1 in flight, next 2,000 ms after that enqueue | 00d; "Drain" |
| U6 | 4 | unit | offline, enqueue, 10 s, online | 0 fetch, `offline`; 1 | Q-0501 |
| U7 | 4 | unit (fake timers) | rejects ×3 then 200; 409 `save_conflict` | retries 2,000, 4,000, 8,000 ms apart, `pending`, `pending`, `error`, then `saved`, failures 0; 409: kept, `error`/`save_conflict`, 0 fetch in 60 s, `retry()` → 1 | "Failed", "Refused" |
| U8 | 4 | unit | two syncs, one storage, one fake `TabLock` (mutex: busy → `{ ran: false }`); `webTabLock` on stub `navigator.locks`: `null`, a lock, none | ≤ 1 in flight, each entry sent once; `{ ran: false }`, `{ ran: true, value }`, runs; `{ ifAvailable: true }` | ticket row; Decided |
| U9 | 4, 5 | unit | `fetchModel` 200, 404, throw; `loadWorkingCopy` A, B + entries A new, B null, C | 1 call to `/api/projects/<id>/model`; `{ ok: false, status: 404, code: 'project_not_found' }`; 0, `network`; A new, no B, C | AC-5; "Reopen" |
| U10 | 1, 4 | unit (fake timers; `outbox-sync.test.ts`) | fake-IDB storage wrapped so chosen calls reject. (a) `put` rejects on calls 1, 2: enqueue p1 [A=v(1)], enqueue p1 [B=v(2)], advance 60,000 ms, `retry()`, `retry()`, fetch → 200 `{ objects: [{ id: 'A', updatedSeq: 1 }, { id: 'B', updatedSeq: 1 }] }`. (b) `commit` rejects on call 1: enqueue p1 [A=v(1)], `flush`, 200 `{ objects: [{ id: 'A', updatedSeq: 7 }] }`, enqueue p1 [A=v(2)], advance 60,000 ms, `retry()`, 200 `{ objects: [{ id: 'A', updatedSeq: 8 }] }` | (a) after enqueue 1: `error`/`storage_failed`; after enqueue 2: `put` calls 1; 60,000 ms: 0 fetch; retry 1: `put` calls 2, 0 fetch, `error`, 2 captures tagged `outbox.storage`; retry 2: `put` calls 3 ([A]) then 4 ([B]), then 1 fetch, change ids `['A', 'B']`, `saved`, problem null, `list()` `[]`. (b) 1 fetch, then `error`/`storage_failed`, `put` calls 1; 60,000 ms: still 1 fetch; retry: `commit` call 2 with saved `[{ id: 'A', updatedSeq: 7 }]` before `put` call 2, then fetch 2 with A `baseSeq` 7 (not 0), `data.name` `'F2'`; `saved`, `list()` `[]`. (a), (b): no `saved` status recorded before the last 200 | "Storage failure"; "commit" |
| D1 | 1 | unit (DB) | `onCommit` → sync (`debounceMs` 50, `fetchImpl` → objects `POST`); add 10 walls, `flush`; edit i = 1–50 sets wall ((i − 1) mod 5) + 1 `attributes.height` 96 + i, 0–80 ms apart, `flush` | ≤ 1 in flight; walls 6–10 and floor `updated_seq` 1; wall k height 141 + k; outbox empty; 0 `model_version` rows | AC-1; 03a; P120a M5 |
| R1 | 5 | unit (DB) | floor, 2 walls, deleted wall, floor `data {"name":""}` (admin); project + 1,000 floors; no edit_model | name, clientName, viewer, `canEdit` true, `lockEpoch` 0, 3 objects, `invalid` `[{ id, issue: 'invalid_data' }]`; 1,001; `canEdit` false | "loadModel", "Object read" |
| R2 | 5 | unit (DB) | signed out; no view_projects; listed scope without it; other tenant; unknown uuid; `abc` | 401; 403; four equal 404 bodies | AC-5; ARCH Errors |
| R3 | 5 | unit | `loadModel` throws | 500 `db_unavailable`, 1 report | EZD-169 |
| E1 | 5 | unit (edit) | `MONEY_ROUTE_CASES` | coverage passes | EZD-133 |

## 5. Visual checklist
None.

## 6. Proposed wording
None.

## 7. Security review
security-review: yes. Areas: data access, API (load scope; device data per user, Q-0503).
Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation
High: a new pattern; data integrity; server data access (PROCESS.md 4). Test-author Sonnet 5.5, builder Opus 5.5.

## 9. Dependencies
Row: EZD-120a, EZD-202 (Q-0573 (a)), EZD-102, EZD-020, EZD-024, EZD-133. Missing: EZD-118 (Q-0530), EZD-015a, EZD-103b.
All merged (STATUS): EZD-120a f8bd91f1, EZD-202 a0c9e51a, EZD-133, EZD-118, EZD-015a, EZD-103b done.
Risks: a lost save response resent with the old `baseSeq` is a conflict (EZD-299).

## 10. Open questions
None.
