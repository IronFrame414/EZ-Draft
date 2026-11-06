# EZD-120d · Sign-out with queued edits, app-wide drain and the test page

- **ACs:** AC-EZD-120d-1, AC-EZD-120d-2, AC-EZD-120d-3, AC-EZD-120d-4, AC-EZD-120d-5
- **Complexity:** medium
- **Areas:** auth, ui, testing, data-model
- **User-visible result:** Sign out sends unsaved edits first or asks before leaving them on the device; no one else signing in there sends them; preview test page `/dev/saves/<project id>`.
- Phase: 3 · Planned by: planner · Date: 2026-11-04 · Status: planned; re-validated 2026-11-05 against merged EZD-120b (e8e27a5b), EZD-120c (2d5ed1f0); plan gap 2026-11-05: EZD-203 (0f726433) wall `layers`; review fixes 2026-11-05 (build round 3): Q-0599 `__Host-` marker, bench baseline, drain import failure, redirect rethrow

## 1. What to build
Paths are written in full. P120a/b/c, P202, P203 = their section 3. No table or money field.

### Build steps
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/src/lib/outbox/device-db.ts` | new | section 3; no `idb` | `app/src/components/settings/draft-store.ts` | U1 |
| 2 | `app/src/lib/outbox/outbox-idb.ts` | change | names and range from step 1 | itself | P120b U4 |
| 3 | `app/src/lib/outbox/outbox.ts` | change | `MEMBERSHIP_HEADER` | itself | U3 |
| 4 | `app/src/lib/outbox/outbox-sync.ts` | change | each save `POST` sends `[MEMBERSHIP_HEADER]: actor.membershipId` | itself | U3 |
| 5 | `app/src/app/api/projects/[id]/objects/route.ts` | change | Decided "Membership check" | itself | R1 |
| 6 | `app/src/lib/outbox/office-drain.ts` | new | section 3 | `app/src/lib/projects/projects-store.ts` | U2 |
| 7 | `app/src/server/outbox/actor.ts` | new | section 3 | `app/src/server/settings/shell-data.ts` | U4 |
| 8 | `app/src/components/outbox/OutboxDrain.tsx` | new, client | section 3 | `app/src/components/states/ConfirmProvider.tsx` | U10, B1–B5 |
| 9 | `app/src/app/(office)/layout.tsx` | change | async; Decided "Layout" | `app/src/app/(office)/page.tsx:27-33` | U7 |
| 10 | `app/src/lib/auth/device-sign-out.ts` | new, no imports | section 3 | `app/src/lib/auth/password-rules.ts` | U8 |
| 11 | `app/src/proxy.ts` | change | Decided "Signed-out marker"; one module function `isForwardedHttps(request: NextRequest): boolean` (not exported; the expression of `jar.isHttps`, `proxy.ts:47-48`), used by the marker check and by `jar.isHttps` (one test, cannot drift: CLAUDE.md rule 18) | itself | U9 |
| 12 | `app/src/components/auth/SignOutButton.tsx` | change | Decided "Sign-out order" | itself | B1, B3 |
| 13 | `app/src/components/account/AvatarMenu.tsx` | change | Decided "Sign-out order" | itself | B4 |
| 14 | `app/src/server/messages/catalogs/en.ts` | change | section 6 keys (office is English only); no test copies the list (`settings-messages.test.ts`: `office.settings.*` only) | `office.settings.unsaved_*` | `catalog.test.ts` |
| 15 | `app/src/editor/ProjectEditor.tsx` | change | section 3 | itself | B6 |
| 16 | `app/src/app/api/dev/model/[id]/route.ts` | new | `GET`, signature and `dynamic` as the pattern's `PATCH` | `app/src/app/api/dev/permissions/projects/[id]/route.ts` | R2 |
| 17 | `app/src/app/(editor)/dev/saves/[id]/save-bench.ts` | new | section 3 | none (pure, no React) | U5 |
| 18 | `app/src/app/(editor)/dev/saves/[id]/SaveBench.tsx`, `.module.css` | new, client | `SaveBench({ projectId }: { projectId: string })` | `app/src/app/(office)/dev/settings/UnsavedSample.tsx` | B6, B7 |
| 19 | `app/src/app/(editor)/dev/saves/[id]/page.tsx` | new | default async `Page({ params })`, `params: Promise<{ id: string }>` | `app/src/app/(office)/dev/settings/page.tsx` | U6 |
| 20 | `docs/architecture.md` | change | `### Sign-out and app-wide drain (EZD-120d)` (section 3, the marker: `__Host-ezd_signed_out` on https, `ezd_signed_out` on http, Q-0599); Folder layout lines for the new folders | EZD-103b section | `pnpm lint` |

### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Office drain | on mount with an actor: `countQueued` null or > 0 → `loadOfficeDrain()` (section 3; resolves null when the import fails, never rejects), null → nothing started, else `startDrain(actor)` (effect keyed on `actor?.membershipId`, `dispose()` on change or unmount); 0 → nothing loaded; no provider → `check()` true. Sign-out leaves `(office)`, disposing the drain; the next user gets a new layout | Q-0507; 11 rule 7; office `download.projects-settings` 199,284/300,000 B (`perf-results/latest.json` at 8429578e; Q-0586) |
| `countQueued` | open `DEVICE_DB` with no version; `onupgradeneeded` → abort, 0 (never creates it); no `outbox` store → 0; else count `actorRange`; close; `error`/`blocked` → null | P120b |
| Layout | `loadOutboxActor()`; throw → `reportError(e, { source: 'function', location: 'office.outbox_actor' })`, actor null; children in `<OutboxDrain actor={actor}>`; no `connection()` (EZD-020 U2) | ARCH Errors and logging |
| `loadOutboxActor` | `getSession()`, `getPermissionContext()`, `currentTenantId(createSessionClient())`; a null → null; errors reject | P120b `viewer` |
| Sign-out order | `SignOutButton` always prevents submit; it and `AvatarMenu.onSignOut` run `confirmSignOut(beforeSignOut)` (false stops), `useOutboxSignOut().check()`, then in the transition `await signOutOnDevice(signOut)` (replaces `await signOut()`, `SignOutButton.tsx:27`, `AvatarMenu.tsx:78`); presses mid-check ignored | Q-0503; Q-0581; `SettingsShell.tsx:59` |
| Offline sign-out | `signOutOnDevice`: `action()` resolves → nothing; rejects with a Next redirect error (`digest` a string starting `NEXT_REDIRECT`, the real sign-out: `signOut` ends `redirect('/sign-in')`, `app/src/server/auth/actions.ts:284`) → rethrow that error unchanged, no marker, no `replace` (Next performs the redirect); any other rejection (server unreachable) → `location.protocol === 'https:'` writes `__Host-ezd_signed_out=1; Path=/; Secure; Max-Age=34560000; SameSite=Lax`, else `ezd_signed_out=1; Path=/; Max-Age=34560000; SameSite=Lax` (name from `signedOutCookieName`), then `location.replace('/sign-in')` and resolves. Never touches the outbox. Session cookies are `httpOnly` (ARCH Session client), so the request gate deletes them at the first request that reaches the server. Every sign-out from both buttons (CLAUDE.md rule 18) | Q-0581; Q-0599; Q-0048 (a) (400 days); `node_modules/next/dist/client/components/redirect-error.js:24-33` (digest format) |
| Signed-out marker | `proxy()` first: `https = isForwardedHttps(request)`; marker = `signedOutCookieName(https)`; only that name counts: on https a plain `ezd_signed_out` is ignored entirely (not deleted, no `sb-` touched, `getClaims` runs as today), on http a `__Host-ezd_signed_out` likewise. Request has the marker → `request.cookies.delete` each name starting `sb-` and the marker, before `NextResponse.next({ request })`; skip `getClaims` (signed out); the result (307 `/sign-in` off `PUBLIC_PATHS`, else next) sets each deleted name `''` with `{ path: '/', maxAge: 0 }` on http, `{ path: '/', maxAge: 0, secure: true }` on https, and `Cache-Control: private, no-store`. No `auth.signOut`: the server session is not revoked (Q-0581 accepted cost) | Q-0581; Q-0599; ARCH Request gate |
| `check()` | no actor or `countQueued` 0 → true; else `loadOfficeDrain()`: null (import failed) → `kept`; else `sendBeforeSignOut(actor, handle)`: `sent` → true; `kept` → dialog (both buttons; confirm true, Cancel/Esc false) | Q-0503; code review 2026-11-05 finding C |
| Dialog | hook owns `createConfirmController()` and renders `ConfirmDialog` (T9 has no provider); section 6 keys, cancel `common.cancel`, tone `danger` (11 Offline) | EZD-015b |
| `sendBeforeSignOut` | `h = handle ?? startDrain(actor)`; race `h.sync.flush()` with `waitMs` (10,000; build choice, Q-0507); `h.storage.list()` empty → `sent`, else or throw → `kept`; dispose `h` if made here; never deletes edits | Q-0503 |
| Membership check | after `await params`: `ctx = await getPermissionContext()`; non-null and header ≠ `ctx.membershipId` → 401 `not_signed_in`, `no-store`, no rpc; then P120a's order | P120b handoff |
| Dev route | order as its pattern; `requireApiPermission('view_projects', { projectId })`; count `model_version` rows `.eq('project_id', id)` (`count: 'exact', head: true`, session client); throw → `reportRouteFailure`, 500 | Q-0505; Q-0508; P120a M3 |
| Test page | production → `notFound()`; `connection()`; `requireSession()`; `MessagesProvider` (office, en) › `StateHost` › `SaveBench`, which renders `<ProjectEditor projectId devHooks openDeps={{ createSync: (o) => createOutboxSync({ ...o, fetchImpl: fault.fetchImpl }) }} onSession={setSession} />` (one `createSaveFault(fetch)` per mount) and a bar (`position: fixed`, top/right 8px, `z-index: 10`, `--ez-surface`, `--ez-border`, `--ez-radius-8`, `--ez-shadow-floating`, px spacing; buttons off while running, sessionless or `session.sync` null, a viewer: `EditorSession.sync`, `app/src/editor/editor-session.ts`) | Q-0505; P120c |
| Fault | armed: a `POST` to path `/^\/api\/projects\/[^/]+\/objects$/` → 500 `db_unavailable` body, no network; else passes. Disarmed at the first `error` status (P120b U7), so Retry saves | slice 3 script step 4 |
| Bench walls | targets = walls by id, first 5; under 5 → one edit `benchWalls(floorId)` (lowest `data.order` floor), `waitForSync`, uncounted. Wall k (1–10): start (0, 48(k−1)), end (120, 48(k−1)), status `new`, level floorId, attributes `{ thickness: 4.5, thicknessSide: 'center', height: 96, topCutToCeiling: false, bearing: false, layers }`, `layers` = `DEFAULT_WALL_LAYERS.map((l) => ({ ...l }))` imported from `@ezdraft/geometry` (drywall 0.5, stud 3.5, drywall 0.5; Σ 4.5 = `thickness`, the schema's refine), `CURRENT_SCHEMA_VERSION` (2 since EZD-203; read the constant, never write 2) | P202 (dev data); P203 `schema/wall.ts`, Decided "Default wall" (fresh copies); Q-0558; P120b D1 |
| "50 edits" | after any seeding, a fresh snapshot (`before`); i = 1–50, one `applyEdit` each in one tick: target ((i−1) mod 5)+1 height = 96 + i; `waitForSync(sync, Date.now(), 30000)`; snapshot | P120b D1 |
| "Fail next save" | after any seeding: `arm()`; one edit (target 1 height + 1); `await sync.flush()` up to 3 times, stopping when the status is `error`; then a fresh snapshot (`before`; the failed sends wrote nothing, so it is still the baseline: approved deviation, code review 2026-11-05 finding B); wait; result at `failed`, again at `done` after Retry (snapshot `after`) | script step 4; code review finding B |
| Snapshot | every run takes its own `before` and `after`; never reuse a previous run's snapshot (no `lastRef`); the seeding edit is before `before`, so never counted. `fetchModel(projectId)` (id → `updatedSeq`), `GET /api/dev/model/<id>`; rows `countWritten`, objects after size, checkpoints after − before; `fetchModel` not `ok` (status 0 is network or an unreadable body, EZD-120b deviation) or the dev `GET` not 200 → phase `failed` | Q-0508; `app/src/lib/outbox/model-api.ts` |
| `waitForSync` | first state `saved` with `lastSavedAt >= after`, or `error`; else state at `timeoutMs` | P120b |

### Do not touch
`signOut`, `confirmSignOut`, `SettingsShell.tsx`, `supabase-server.ts` (cookies stay `httpOnly`), P120c's page and hook, EZD-015b's confirm files.

Ticket row: `phase-01.md:32`.

## 2. Sources
- Spec: 03a; 03b rules 1, 9, 10; S03 States; 00d; 11 Budgets, rule 7, Offline.
- Decisions: Q-0503, Q-0507, Q-0508 (03); Q-0506 (05); Q-0086 (04); Q-0581, Q-0048 (a) (auth); Q-0599 (auth, answered-agent, Fable security-reviewer 2026-11-05: `__Host-` marker on https); Q-0505 (process); Q-0586 (11, office budget); Q-0558 (wall layers, via P203). Split proposal part d; slice 3 script; code review 2026-11-05 (build round 2) findings B, C, D; code cited in section 1. No mockup, no research report.

Architecture: Entry points and lazy modules (EZD-020); Entry contents and bundle report (EZD-020); State components (EZD-015); Unsaved edits and drafts (EZD-103b); Auth and session (EZD-007); Browser tests (EZD-016a)

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| file | `app/src/lib/outbox/device-db.ts` | `DEVICE_DB = 'ezdraft-device'`; `DEVICE_DB_VERSION = 1`; `OUTBOX_STORE = 'outbox'`; `actorRange(appUserId: string, tenantId: string): IDBKeyRange` (`IDBKeyRange.bound([u, t], [u, t, []])`, inclusive, over `outbox` keys `[appUserId, tenantId, projectId, objectId]`, P120b); `countQueued(appUserId: string, tenantId: string, factory?: IDBFactory): Promise<number \| null>` |
| const | `outbox.ts` | `MEMBERSHIP_HEADER = 'x-ezdraft-membership'` |
| office-drain | `app/src/lib/outbox/office-drain.ts` | `DrainHandle = { sync: OutboxSync; storage: OutboxStorage; dispose(): void }` (`sync.dispose()`, `storage.close()`); `startDrain(actor: Actor): DrainHandle` (`createIdbOutboxStorage`, `createOutboxSync`, then `flush()`); `sendBeforeSignOut(actor: Actor, handle: DrainHandle \| null, waitMs?: number): Promise<'sent' \| 'kept'>` (default 10000; U2 passes fake handles) |
| file | `app/src/lib/auth/device-sign-out.ts` | `SIGNED_OUT_COOKIE = 'ezd_signed_out'` (the http name); `signedOutCookieName(secure: boolean): string` (`true` → `'__Host-ezd_signed_out'`, `false` → `'ezd_signed_out'`; Q-0599); `signOutOnDevice(action: () => Promise<unknown>, env?: { document: Pick<Document, 'cookie'>; location: Pick<Location, 'protocol' \| 'replace'> }): Promise<void>` (default `{ document, location }`) |
| server | `app/src/server/outbox/actor.ts` | `loadOutboxActor(): Promise<Actor \| null>` |
| component | `OutboxDrain.tsx` | `OutboxDrain({ actor, children }: { actor: Actor \| null; children: ReactNode })`; `useOutboxSignOut(): { check(): Promise<boolean>; dialog: ReactElement \| null }`; `loadOfficeDrain(load?: () => Promise<typeof import('../../lib/outbox/office-drain')>): Promise<typeof import('../../lib/outbox/office-drain') \| null>` (default `() => import('../../lib/outbox/office-drain')`; a rejection → null, never rejects) |
| props | `ProjectEditorProps` (`app/src/editor/ProjectEditor.tsx`, today `{ projectId: string; devHooks: boolean }`) | adds `openDeps?: OpenDeps` (`app/src/editor/editor-session.ts`, passed to `openEditorSession(projectId, openDeps)`), `onSession?: (session: EditorSession \| null) => void` (ready, then null on dispose) |
| save-bench | `save-bench.ts` | `benchWalls(floorId: string): Change[]`; `benchTargets(objects: Objects): string[]`; `fiftyEdits(objects: Objects, targets: string[]): Change[][]`; `countWritten(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>): number`; `SaveFault = { fetchImpl: typeof fetch; arm(): void; disarm(): void; armed(): boolean }`; `createSaveFault(base: typeof fetch): SaveFault`; `waitForSync(sync: OutboxSync, after: number, timeoutMs: number): Promise<SyncState>` |
| route | `POST /api/projects/[id]/objects` | header missing or not the session's membership → 401 `not_signed_in` |
| route | `GET /api/dev/model/[id]` | 200 `{ checkpoints: number }`; 401; 403; 404 `project_not_found` (production: empty 404); 500. Page `/dev/saves/[id]`: production not found |
| data-testid | bench | `bench-fifty`, `bench-fail`, `bench-result` with `data-phase` (`idle`, `running`, `failed`, `done`), `data-rows`, `data-objects`, `data-checkpoints` |
| dialog | sign-out | `[data-confirm]` (EZD-015b), buttons by role and name; existing `sign-out`, `avatar-menu-sign-out` |

## 4. Tests
U beside the file; R, U4 db; U1, U2 `fake-indexeddb`. B desktop: `app/e2e/sign-out-outbox.spec.ts` (B1–B5), `app/e2e/save-bench.spec.ts` (B6, B7), describes `EZD-120d`, helpers from `app/test-harness/e2e/test.ts`; users A, B: `createTenant`, `createMember` (`app/test-harness/rls/fixtures.ts`), `setPermissions` `view_projects`, `edit_model` (`app/test-harness/permissions/grant.ts`), `signInAs(email)`; B2: `page.close()`, then `context.newPage()`; edit = `window.__ezdraftEditor.edit` renaming the floor "Floor A"; blocked = `page.route('**/api/projects/*/objects', (r) => r.abort())`.
| Test | AC | Type | Input | Expected value | Source |
| --- | --- | --- | --- | --- | --- |
| U1 countQueued | 3 | unit | no database; entries (u1,t1)×2, (u2,t1)×1 | 0, none made; 2; 1; (u1,t2) 0 | Q-0503 |
| U2 sendBeforeSignOut | 1, 2 | unit, fake timers | list empty; 1 entry; flush hangs; list throws | `sent`; `kept`; `kept` at 10,000 ms, pending at 9,999; `kept` | Decided |
| U3 header | 3 | unit | actor m1, 2 saves | both `POST`s send `x-ezdraft-membership: m1` | step 4 |
| R1 membership | 3 | db | valid save: no header; other member's id; own | 401 `not_signed_in`, row unchanged; same; 200 | Decided |
| R2 dev route | 4, 5 | db | production; no session; id `nope`; no `view_projects`; 2 checkpoints made | 404; 401; 404; 403; `{ checkpoints: 2 }` | Decided |
| U4 actor | 3 | db | member; signed out | its ids; null | Decided |
| U5 bench | 4 | unit | `fiftyEdits` (10 walls); `countWritten`; `benchWalls`; fault | 50 edits, edit i on target ((i−1) mod 5)+1, end height 141 + k (k 1–5); new or changed counted; each wall's `attributes` `toEqual` the six keys of Decided "Bench walls", `layers` `[{ material: 'drywall', thickness: 0.5 }, { material: 'stud', thickness: 3.5 }, { material: 'drywall', thickness: 0.5 }]`; walls pass `parseStoredObject` at `CURRENT_SCHEMA_VERSION`; armed `POST` 500, base unused, `GET` passes | Decided; P202; P203; Q-0558 |
| U6 page | 5 | unit | production; preview | `notFound()`; `SaveBench` | Q-0505 |
| U7 layout | 3 | unit | actor load rejects; resolves | one `reportError`, children shown; `OutboxDrain` gets the actor | Decided |
| U8 device sign-out | 2 | unit | `signedOutCookieName(true)`, `(false)`; action resolves; rejects, `http:`; rejects, `https:`; rejects with `{ digest: 'NEXT_REDIRECT;replace;/sign-in;307;' }` | `'__Host-ezd_signed_out'`, `'ezd_signed_out'`; no cookie, no `replace`; cookie `ezd_signed_out=1; Path=/; Max-Age=34560000; SameSite=Lax`, then `replace('/sign-in')`, resolves; cookie `__Host-ezd_signed_out=1; Path=/; Secure; Max-Age=34560000; SameSite=Lax`, then `replace('/sign-in')`, resolves; rejects with that same error, no cookie, no `replace` | Q-0581; Q-0599; Q-0048 (a); `actions.ts:284`; `redirect-error.js:24-33` |
| U9 proxy marker | 2 | unit, `proxy.test.ts` | no `x-forwarded-proto` (http), `ezd_signed_out=1` + `sb-x-auth-token`, `sb-x-auth-token.0`: on `/`; `/sign-in`; `/api/projects/p/objects`; no marker. Then: (a) `x-forwarded-proto: https`, `__Host-ezd_signed_out=1` + both `sb-` on `/`; (b) `x-forwarded-proto: https`, `ezd_signed_out=1` + both `sb-` on `/`; (c) no proto header, `__Host-ezd_signed_out=1` + both `sb-` on `/` | 307 `/sign-in`, both `sb-` and marker set `''` with `maxAge` 0, `no-store`, `getClaims` not called; next, same deletes; forwarded request has no `sb-` cookie; unchanged (T37 passes). (a) 307 `/sign-in`, all three set `''` `maxAge` 0 `secure` true, `no-store`, forwarded request without `sb-`, `getClaims` not called; (b) `getClaims` called once, no `maxAge` 0 Set-Cookie for `sb-` or marker, next (signed in), forwarded request keeps both `sb-`; (c) as (b) | Q-0581; Q-0599 |
| U10 drain import | 1, 2 | unit, `OutboxDrain.test.ts` | `loadOfficeDrain(() => Promise.reject(new Error('chunk')))`; `loadOfficeDrain(() => Promise.resolve(m))` | resolves `null`, does not reject; resolves `m` | Decided "Office drain", "`check()`"; code review finding C |
| B1 sends first | 1 | browser | blocked, 1 edit; `/`; unblock; Sign out | no dialog; `/sign-in`; "Floor A" saved | Q-0503 |
| B2 app-wide drain | 1 | browser | blocked, 1 edit; close; new page `/` | one `POST …/objects` 200, no editor; saved | Q-0507 |
| B3 offline asks | 2 | browser | 1 queued; `/`; `network.set(context, 'off')`; Sign out | dialog in 10 s with section 6 texts; Cancel → `/`, signed in | Q-0503 |
| B4 sign out anyway, server unreachable | 2 | browser | blocked, 1 queued; `/settings`; `network.set(context, 'off')`; avatar menu Sign out; "Sign out anyway"; `network.set(context, 'on')`; `page.goto('/settings')` | before `on`: cookie `ezd_signed_out` `1` (`context.cookies()`); after: URL `/sign-in`, no `sb-` and no `ezd_signed_out` cookie, A's `countQueued` 1 (`page.evaluate`) | Q-0503; Q-0581 |
| B5 other user | 3 | browser | after B4, same context: B (same tenant, `edit_model`) in, 5,000 ms, out; A in | during B: 0 `POST …/objects`, A's entry kept, no dialog; then 1 `POST` 200 | Q-0503 |
| B6 50 edits | 4 | browser | fresh project, `/dev/saves/<id>`, "50 edits" | `done`, rows 5, objects 11, checkpoints 0 | P120b D1; P120a M4 (floor + 10 walls) |
| B7 fail next save | 4 | browser, `page.clock.install()`, `runFor(20000)` | after B6, "Fail next save" | `save-failed-banner`, `failed`, rows 0; Retry → `done`, rows 1, checkpoints 0 | Decided; P120c |

Earlier tests the test-author edits: every signed-in `POST` in `app/src/app/api/projects/[id]/objects/route.test.ts` (P120a R1, P202) and any other direct poster (`grep -rln "/objects" app/src app/e2e app/test-harness`) sends its member's header, values unchanged: `app/src/server/model/model-schema.test.ts` `post()` (`editor.membershipId`); `app/test-harness/money/route-cases.ts` `projects/[id]/objects` `POST` case (`env.member.membershipId`, `expectStatus` 200). `outbox-sync.db.test.ts` needs no edit (its actor carries the session's `membershipId`, step 4 adds the header). `app/src/app/entry-groups.test.tsx` U2 mocks `loadOutboxActor` → null.
New page and route in the enumerations (as P120c E4, E5, E7, E8):
- `app/test-harness/money/route-cases.ts` (C1): after the `dev/permissions/projects/[id]` `PATCH` case, one case: file `API` + `dev/model/[id]/route.ts`, method `GET`, load `import('../../src/app/api/dev/model/[id]/route')`, request a `GET` `Request` to `BASE` + `/api/dev/model/<env.projectId>` with params `{ id: env.projectId }` (copy the `projects/[id]/model` case), `expectStatus: 200`, note `EZD-120d: the checkpoint count; 200 { checkpoints } (no money)` (R2).
- `app/test-harness/money/page-cases.ts` `PAGE_FILES`: `'app/src/app/(editor)/dev/saves/[id]/page.tsx'` after `(editor)/dev/entry/editor/page.tsx` (`listPages` `byText` order).
- `app/src/server/db/money-routes.test.ts` C4: "32 pages" → "33 pages", `toBe(32)` → `toBe(33)` (32 `page.tsx` under `app/src/app` on develop, `find`, + step 19).
- `app/e2e/money-pages.spec.ts`: comment "32 pages … 40 paths" → "33 pages … 41 paths", `EXPECTED_PATHS = 40` → `41` (`pathsFor`: an `[id]` file yields one path, `/dev/saves/<projectId>`).
- `app/test-harness/e2e/disclaimer-pages.ts` (U6 `disclaimer-pages.test.ts`: every page outside `app/src/app/dev/`): after the `(editor)/dev/entry/editor` row, `{ file: 'src/app/(editor)/dev/saves/[id]/page.tsx', path: '/dev/saves/00000000-0000-4000-8000-000000000000', signedIn: true, placement: 'bar' }` (its `ProjectEditor` frame has the status bar, as the `(editor)/projects/[id]` row).

## 5. Visual checklist
Desktop 1600 × 1000.
| Element | State | Mockup |
| --- | --- | --- |
| Sign-out dialog on Projects and Settings | filled | none; EZD-015b `ConfirmDialog` |

## 6. Proposed wording
| Where | Text |
| --- | --- |
| `office.outbox.sign_out_title` | Sign out with changes not sent? |
| `office.outbox.sign_out_message` | Some changes are saved only on this device. They will send the next time you sign in here. |
| `office.outbox.sign_out_confirm` | Sign out anyway |
| Test page (literal) | 50 edits · Fail next save · Saving… · Rows written: {rows} of {objects} · Checkpoints made: {checkpoints} |

## 7. Security review
security-review: yes. Areas: auth, data access, API.
Reviewers needed: code-reviewer · calc-auditor no · ui-verifier yes · security-reviewer yes.

## 8. Complexity and model recommendation
Medium: known patterns, but sign-out and the save route. Test-author, builder: Sonnet 5.5.

## 9. Dependencies
Row: EZD-120b (done e8e27a5b), EZD-120c (done 2d5ed1f0), EZD-108, EZD-103b, EZD-015b, EZD-016a, all done. Missing from the row: EZD-120a (done f8bd91f1), EZD-202 (done a0c9e51a), both via EZD-120b; EZD-203 (done 0f726433), whose wall schema requires `attributes.layers` and raised `CURRENT_SCHEMA_VERSION` to 2 (plan gap: Decided "Bench walls" and U5 now carry `layers`).
EZD-120b deviations checked against its code: the customer join, `classifySave`'s status fallback (500 stays `failed`, so B7 unchanged), `fetchModel`'s status 0 (Decided "Snapshot") and drains blocked after a storage failure until `retry()` (`sendBeforeSignOut` then reads the list: `kept`) change no value here. EZD-120c: `SaveStateText`'s state clock and repair 70c809a3 touch no file here; its new page added the E4–E8 enumerations, which section 4 extends.
Risk: office `download.projects-settings` measured 199,284 of 300,000 (Q-0586) before EZD-120c merged; over 300,000 → PLAN-GAP.

## 10. Open questions
None. Q-0581 (this plan's first QP question): answered (c), Josh 2026-11-05.
