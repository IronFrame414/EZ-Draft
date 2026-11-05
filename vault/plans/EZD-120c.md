# EZD-120c · Editor route, save state and banners

- **ACs:** AC-EZD-120c-1 to AC-EZD-120c-15
- **Complexity:** high
- **Areas:** ui, data-model, security, testing
- **User-visible result:** cards and Create open the editor; its header says if work is saved.
- Phase: 3 · Planned by: planner · Date: 2026-11-04 · Status: planned

## 1. What to build
No table or money field. Paths are written in full. Pnnn = that plan's section 3.

### Build steps
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/src/components/shell/EditorFrame.tsx` | change | `leftPanelLabel?`, `inspectorLabel?`; `<aside>` only with its label | itself | EmptyEditor tests (labels given) |
| 2 | `app/src/server/messages/catalogs/en.ts` | change | section 6 `office.editor.*` keys, `en` only (H9 pins `office.header.*`; `catalog.test.ts` derives from `en`) | `office.company.*` | U8 |
| 3 | `app/src/editor/save-state.ts` | new | `type S = Pick<SyncState, 'status' \| 'lastSavedAt'>`; `SaveWordKey` = `'saved' \| 'saving' \| 'saved_on_device' \| 'not_saved' \| 'saved_just_now' \| 'saved_min_ago' \| 'saved_at'`; `saveWord(s: S, now: number, timeZone?: string): { key: SaveWordKey; params?: { minutes: number } \| { time: string } }`; `nextSaveWordChangeMs(s: S, now: number): number \| null`; `formatClock(ms: number, timeZone?: string): string` | none (pure) | U1–U3 |
| 4 | `app/src/editor/editor-session.ts` | new | section 3 | `app/src/lib/projects/projects-store.ts` | U5–U7 |
| 5 | `app/src/editor/SaveStatus.tsx` | new, client | `SaveStateText`, `SaveFailedBanner` (section 3) | `states/OfflineBanner.tsx` | U4 |
| 6 | `app/src/editor/ProjectEditor.tsx`, `.module.css` | new, client | section 3; imports `components/{shell,states}`, `device/DeviceLayout`, `phone/EditorPhoneNotice` | `shell/EmptyEditor.tsx` | B1–B10 |
| 7 | `app/src/app/(editor)/projects/[id]/page.tsx` | new | default `EditorPage({ params }: { params: Promise<{ id: string }> })`, async | `app/src/app/(office)/page.tsx` | U9 |
| 8 | `app/src/components/projects/ProjectCard.tsx`, `Projects.module.css` | change | `<article>` → `<Link href={'/projects/' + project.id} prefetch={false}>` (Q-0500; ARCH Entry points), same class, data attributes; no role, tabIndex, onClick; `.card` + `text-decoration: none` | itself | E1, E2 |
| 9 | `app/src/components/projects/ProjectsView.tsx` | change | `onCreated(id)` only does `router.push('/projects/' + id)` (`next/navigation`; Q-0500) | P118 "After create" | E3 |
| 10 | `docs/architecture.md` | change | `### Editor route (EZD-120c)` (section 3); asides need a label; Entry points editor: EZD-120c | Projects page part | `pnpm lint` |

### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Page | `connection()`, `requireSession()`; `MessagesProvider` (office, en) › `StateHost` › `ProjectEditor` with `devHooks = process.env.VERCEL_ENV !== 'production'` | P117a page |
| Open | `fetchModel`; not ok: 403 `no-access`, 404 `not-found`, else `failed` | P120b route; Q-0214 |
| Ready | actor = `model.viewer` ids; `storage = createStorage(actor)`; `entries = await storage.list()` (throw → `[]`, report); `createModelStore({ objects: loadWorkingCopy(model, entries), onCommit })`; `await storage.replaceMirror(projectId, model.objects)` (throw → report); `canEdit`: `sync = createSync({ actor, storage })`, `onCommit = (c) => void sync.enqueue(projectId, model.lockEpoch, c)`, entries non-empty → `void sync.flush()`; view-only: no sync or `onCommit`. Defaults `fetch`, `createIdbOutboxStorage`, `createOutboxSync` | P120b "Reopen"; 03a; Q-0500 |
| Report, dispose | report = `captureBrowserError(e, 'editor.device_copy')` via `import('../lib/errors/capture')`; dispose = `sync?.dispose(); storage.close()` in effect cleanup, late load | P120b |
| Frame | all states: `DeviceLayout full={<EditorFrame header rail={null} canvas statusBar={<StatusBar />} />} phone={<EditorPhoneNotice />}` (no rail or panel is built) | Q-0500; Q-0568 |
| Header | not ready: `HeaderCard` › `Wordmark href="/"`; ready: `EditorHeader` `projectsHref="/"`, `projectName`, `subtitle` (useMemo) `[clientName, t('office.editor.working_copy'), canEdit ? SaveStateText : null]`, `activeView="plan"`, `views={[]}`, stable no-op `onViewChange` | Q-0500; S03 Data shown |
| Canvas | state `{ kind: 'loading' } \| OpenResult`; `editor-state` div (`.state`): loading `SkeletonGroup` (count 1, `.fill`) › `Skeleton` (100% × 100%, `lg`); failed `InlineError` `office.editor.load_failed`, Retry → loading, open again; `NoAccess`; not-found `<p className={styles.notice}>` `error.page_not_found` (`editor-not-found`); ready editor: `OfflineBanner message="office.editor.offline"`, `SaveFailedBanner`; view-only: empty (nothing to save) | Q-0214; Q-0273; Q-0501; Q-0506 |
| CSS | `.state`: absolute, inset 0, flex column, gap 8px; `.fill`: flex 1, flex; `.notice` = `home.module.css` `.message` | L-013 |
| Save word | idle `saved`; pending, saving `saving`; offline `saved_on_device`; error `not_saved`; saved, `lastSavedAt` null `saved`; else e = max(0, now − lastSavedAt): e < 60,000 `saved_just_now`; < 3,600,000 `saved_min_ago` (minutes floor(e / 60,000)); else `saved_at`; `formatClock` = `new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(ms)` | S03 States; Q-0505; Q-0507 gaps 4, 5 |
| Next change | saved with time: e < 60,000 → 60,000 − e; < 3,600,000 → 60,000 − (e mod 60,000); else null | same |
| Ticking | `<span data-testid="save-state" data-save-status={status}>` `t('office.editor.' + key, params)`; `useStore(sync, …)` (zustand); one `setTimeout(nextSaveWordChangeMs)` re-render, cleared on change, unmount | 11 rule 4 |
| Failed banner | status `error` (any `problem`): `save-failed-banner` div › `InlineError` `office.editor.save_failed`, Retry → `sync.retry()` | S03 States; P120b "Failed" |
| Test hook | ready, `canEdit`, `devHooks`: `window.__ezdraftEditor` (`objects`: store entries as `{ id, ...value }`; `edit`: `store.applyEdit`), removed in cleanup | Q-0505; no tools yet |
| Perf | `scripts/perf/*` unchanged; B11 measures the route | Q-0449; P117a B3 |

### Do not touch
`EditorHeader`, `EmptyEditor`, `components/states/**`, `lib/outbox/**`, `editor/model/**`, `scripts/perf/**`, `ProjectListStore`.

## 2. Sources
- Spec: 03a; 03b rules 1, 5, 9; S03 Permissions, Data shown, States; 00d; 11 Budgets, rule 4.
- Decisions: Q-0500, Q-0506, Q-0568; Q-0214, Q-0273, Q-0501; Q-0505; Q-0503. Answered: Q-0507, Q-0449, Q-0573.
- Mockup `S03Plan.png` header. Plans: P120b (with its STATUS deviations, e8e27a5b); EZD-334 (B6 landing settle); P120a M4 (each project has floor "Floor 1", order 1); P117a; P118; split-EZD-120b.md.
- Research: none.

Architecture: Shell header (EZD-011); Editor shell (EZD-012); State components (EZD-015); Disclaimer (EZD-136); Entry points and lazy modules (EZD-020); Messages and language (t()); Projects page (EZD-117a); Browser tests (EZD-016a)

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| route | `/projects/[id]` | signed out → `/sign-in` |
| export | `app/src/editor/editor-session.ts` | `OpenDeps = { fetchImpl?: typeof fetch; createStorage?: (actor: Actor) => OutboxStorage; createSync?: (o: { actor: Actor; storage: OutboxStorage }) => OutboxSync }`; `EditorSession = { model: ModelLoad; store: ModelStore; sync: OutboxSync \| null; dispose(): void }`; `OpenResult = { kind: 'ready'; session: EditorSession } \| { kind: 'failed' \| 'no-access' \| 'not-found' }`; `openEditorSession(projectId: string, deps?: OpenDeps): Promise<OpenResult>` |
| props | `ProjectEditor` | `ProjectEditorProps = { projectId: string; devHooks: boolean }`; `SaveStateText`, `SaveFailedBanner`: `{ sync: OutboxSync }` |
| global | `window.__ezdraftEditor` | `EditorTestHook = { objects(): Array<{ id: string } & ObjectValue>; edit(changes: Change[]): string[] }` |
| data-testid | | `editor-state` (`data-editor-state` loading, failed, no-access, not-found, ready), `save-state` (`data-save-status`), `save-failed-banner`, `editor-not-found`, `no-access`, `disclaimer`; offline `[data-state="offline"]` |
| types | P120b | every P120b name used here, as P120b exports it |

## 4. Tests
`app/src/editor/`: U1–U3 `save-state.test.ts`, U4 `SaveStatus.test.tsx`, U5–U7 `editor-session.test.ts`, U8 `editor-messages.test.ts`; U9 `page.test.tsx` by the page; B1–B11 `app/e2e/editor.spec.ts` (desktop, describe `EZD-120c editor route`, B4 titled `EZD-120c done when`). U4: `renderToStaticMarkup` in `MessagesProvider` (office, en); U7 (c) `vi.mock('../lib/errors/capture')`; U9 `vi.mock`s `requireSession`, `next/server`, `ProjectEditor`. B: helpers from `app/test-harness/e2e/test.ts`; each test `createTenant()`, `seedFixtureS` (`app/test-harness/projects-fixture.ts`; P1 "bravo", client "Zed Co"), and in the spec `member()` (copy of `projects.spec.ts`) editor `['view_projects','edit_model']`, viewer `['view_projects']`, none `[]`; own context. E(n) = `__ezdraftEditor.edit([{ id: floor.id, value: { type: 'floor', schemaVersion: 1, data: { name: n, order: 1 } } }])`. DB = the floor's `model_object` `data.name` (`adminDb()`, polled). IDB(store) = spec function: `page.evaluate` opens `ezdraft-device`, returns that store's `count()`. Routes: save `**/api/projects/*/objects`, load `**/api/projects/*/model`.

| Test | AC | Type (u unit, b browser) | Input | Expected value | Source |
| --- | --- | --- | --- | --- | --- |
| U1 word | 3, 4 | u | idle, pending, saving, offline, error; saved e 0, 59,999, 60,000, 119,999, 3,599,999, 3,600,000 (at `Date.UTC(2026,10,4,15,45)`, UTC); saved null | saved, saving, saving, saved_on_device, not_saved; just_now ×2, min_ago 1 ×2, 59, saved_at "3:45 PM"; saved | Save word |
| U2 next | 4 | u | saved e 0, 59,999, 60,000, 90,000, 3,599,999, 3,600,000; pending | 60,000, 1, 60,000, 30,000, 1, null; null | Next change |
| U3 clock | 4 | u | 15:45, 00:05 UTC | "3:45 PM", "12:05 AM" (U+0020, Node 22.23.3) | Save word |
| U4 status | 3, 8 | u, static | `createStore<SyncState>` per status | idle "Saved", pending "Saving…", saved now "Saved just now", error "Not saved"; banner: error "Changes not saved" + "Retry", else "" | section 6 |
| U5 fails | 11, 13, 14 | u | fetch `Response.json({ error: { code } }, { status })` 403 `permission_denied`, 404 `project_not_found`, 500 `db_unavailable`, 401 `not_signed_in` (route bodies; a body that is not JSON reads as status 0, P120b deviation), throw | no-access, not-found, failed ×3; no storage | Open |
| U6 ready | 15 | u | 200, `canEdit`, floor "Floor 1"; list [this project "Floor A", other project] | floor "Floor A"; replaceMirror 1× (id, model.objects); createSync 1× (actor); flush 1×; applyEdit → enqueue (id, 0, [c]) 1×; `dispose()` → sync.dispose, storage.close 1× | Ready, dispose |
| U7 variants | 10, 15 | u | (a) list []; (b) view-only; (c) list throws | (a) flush 0; (b) sync null, replaceMirror 1, enqueue 0; (c) ready, "Floor 1", capture 1× `'editor.device_copy'` | Ready, Report |
| U8 keys | 3–9 | u | `en`, `es` | `office.editor.*` = section 6 (11); es: none | section 6 |
| U9 page | 1 | u, mocks | `VERCEL_ENV` production, preview | `ProjectEditor` `devHooks` false, true; `requireSession` called | "Page" |
| B1 card | 1 | b | editor clicks P1 card on `/`, after the bell's landing settle as `projects.spec.ts` B6 (copy of its `countNotificationGets`: poll 2 after sign-in, 4 after `/`; EZD-334) | URL `/projects/<P1>`; `/api/` paths till "bravo" + 500 ms: [`/api/projects/<P1>/model`] | Q-0500 |
| B2 shows | 2 | b | editor opens P1 | `save-state` parent "Zed Co · Working copy · Saved"; 0 `header nav button`, rail, left-panel, inspector, `[data-status-item]`; canvas text "" | Q-0500, 0505 |
| B3 saving | 3, 4 | b | `page.clock.install()`; E("Floor A"); `fastForward(60_000)` | "Saving…", "Saved just now", DB "Floor A"; "Saved 1 min ago" | S03 |
| B4 offline | 5–7 | b | `network.set` off; E("Floor A"), E("Floor B"); on | banner "Offline. Changes are saved on this device and will sync.", outbox 1, DB "Floor 1"; on: banner 0, outbox 0, DB "Floor B" | Q-0501 |
| B5 save fails | 8, 9 | b | objects POST → 500; E("Floor A"); ≤ 20 s; unroute; Retry | "Changes not saved", "Not saved", outbox 1, DB "Floor 1"; then banner 0, outbox 0, DB "Floor A" | S03 |
| B6 view-only | 10 | b | viewer opens P1 | "Zed Co · Working copy"; no `save-state`, no hook | Q-0500 |
| B7 no access | 11, 12 | b | none opens P1 | `no-access` "You don't have access to this. Ask your supervisor."; no "bravo" | Q-0214 |
| B8 not found | 13 | b | editor opens a random v4 id; member listed on P3 opens P1 | both "Page not found.", model 404 | Q-0273; ARCH Errors |
| B9 load | 14 | b | model GET held, then 500; unroute; Retry | loading `[data-skeleton]`; "Couldn't load this project." + Retry; then "bravo" | Q-0214 |
| B10 reopen | 15 | b | objects → 500; E("Floor A"); outbox 1; unroute; reload | `objects()` floor "Floor A"; working_copy 1; DB "Floor A"; "Saved just now" | 03a; P120a M4 |
| B11 size | 2 | b | `signedInJsContents(browser, st, url, 'editor')`, `signedInJsSize(browser, st, url)`; st = context `storageState()`, url `/projects/<P1>` | value 0; ≤ 500,000; no `error` | `scripts/perf/budgets.mjs` `download.editor` |

Test-author edits (L-021): E1 `ProjectCard.test.tsx` U7: `<a` `href="/projects/<id>"`; no `role=`, `tabindex`, `onclick`. E2 `app/e2e/projects.spec.ts` B6: pathname, `href` `/projects/<P1>`; role, tabindex null; navigation and request count checks dropped, the landing settle (EZD-334) kept. E3 `app/e2e/new-project.spec.ts` B3, B6: Create opens `/projects/<new id>` ("Kitchen remodel"); list checks dropped. E4 `test-harness/e2e/disclaimer-pages.ts`, after the editor entry row: `{ file: 'src/app/(editor)/projects/[id]/page.tsx', path: '/projects/00000000-0000-4000-8000-000000000000', signedIn: true, placement: 'bar' }`. E5 `test-harness/money/page-cases.ts` `PAGE_FILES`: the page, after `(editor)/dev`. E6 `js-contents.ts` `signedInJsContents`: 4th param `entry: 'office' \| 'editor' = 'office'`. E7 `app/src/server/db/money-routes.test.ts` C4 (lines 147, 151): "31 pages" → "32 pages", `toBe(31)` → `toBe(32)` (`listPages` counts `page.tsx` files under `app/src/app`: 31 on develop + `(editor)/projects/[id]/page.tsx` = 32). E8 `app/e2e/money-pages.spec.ts` (lines 4, 26): comment "31 pages … 39 paths" → "32 pages … 40 paths", `EXPECTED_PATHS = 39` → `40` (`page-cases.ts` `pathsFor`: an `[id]` file yields 1 path, `/projects/<projectId>`). No other literal counts these lists (grep of `DISCLAIMER_PAGES`, `listPages`, `MONEY_PAGE_CASES` users in `app/`, `scripts/`).

## 5. Visual checklist
Desktop 1600 × 1000 (Q-0506).
| Element | State | Mockup |
| --- | --- | --- |
| Header: name, subtitle, save state (not for view-only) | filled, loading, no permission | S03Plan.png |
| Skeleton; failed load, no access, not found; offline, save-failed banners | loading, error, no permission, empty | none |

## 6. Proposed wording
| Where | Text |
| --- | --- |
| Header, saved ≥ 60 min ago | "Saved at {time}" ("Saved at 3:45 PM") |
| Header, offline | "Saved on this device" |
| Header, save failing | "Not saved" |
| Failed load | "Couldn't load this project." |

Sourced: working_copy "Working copy" (board); saving "Saving…", saved_just_now "Saved just now", saved_min_ago "Saved {minutes} min ago", save_failed "Changes not saved" (S03); saved "Saved" (Q-0505); offline (Q-0214).

## 7. Security review
security-review: yes: permissions (view-only saves nothing; no access), data access (B8), test hook (U9, B6).
Reviewers needed: code-reviewer, ui-verifier, security-reviewer; calc-auditor no.

## 8. Complexity and model recommendation
High: permissions decide display; many states; outbox. Test-author Sonnet 5.5, builder Opus 5.5.

## 9. Dependencies
Row as `tickets.json`; missing (done or before 120b): EZD-120a, 202, 014a, 020, 024, 133. EZD-117b (Q-0579, 39c6bc9a), 118 (c9498cb0) and 120b (e8e27a5b) are done; re-validated 2026-11-05 against their merged code.
Risks: a P120b name not exported is a PLAN-GAP; only B11 gates route size until EZD-276.

## 10. Open questions
None.
