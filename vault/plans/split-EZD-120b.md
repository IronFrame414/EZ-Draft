# EZD-120b split proposal (applied 2026-11-04)

Copied from the planner's split proposal in vault/plans/EZD-120b.md when the orchestrator applied it (parts EZD-120b, EZD-120c, EZD-120d; Q-0573 (a): EZD-202 builds before EZD-120b). Each part's plan unit starts from its section here.

## Split proposal

**Why.** Planned whole, the ticket needs about 30 files and about 30 tests. That is over the size rule (PROCESS.md section 6 "Ticket size": about 20 files, about 25 tests; Josh 2026-10-22), and no plan for it fits the 15,000-character product-plan cap (H2, Josh 2026-11-01; P120a is 14,994 for 10 files). Sources of the count:
- the ticket row: phase-01.md:30;
- the four sign-out sites Q-0503 reaches: `server/auth/actions.ts:278`, `components/auth/SignOutButton.tsx:13`, `components/account/AvatarMenu.tsx:74`, `components/settings/SettingsShell.tsx:59`;
- the drain that runs in the office entry as well as the editor (Q-0507 gap 10);
- the test page (Q-0505, Q-0508);
- the card and Create changes to EZD-117a and EZD-118 (Q-0500);
- the editor perf measurement this ticket owns (ARCH Entry points, row `(editor)`).

The work splits into three lettered parts, built in order b → c → d. Each part is planned as its own unit from this section.

### Part EZD-120b · Patch store, outbox and autosave
- **Scope:** the in-memory patch store (Zustand) in `app/src/editor/model/`. Every edit is a patch applied locally at once, the same patches drive undo and redo, and each edit reports the object ids it changed (ticket row; 11 Performance rules 1 and 2).
- **Scope (outbox):** one IndexedDB outbox that every write goes into, in `app/src/lib/outbox/`. Its entries are keyed to the signed-in user and company (Q-0503), and each change carries its base `updated_seq` and the `lock_epoch` (03b rule 9). It drains through EZD-120a's `POST /api/projects/[id]/objects` (P120a section 3) 2 seconds after the last edit, with one save in flight (ticket row; 00d Outbox), only ever for the signed-in user's entries, and only one tab drains at a time.
- **Scope (device copy and load route):** the open working copy is mirrored in IndexedDB (03a; ticket row). The server load path `GET /api/projects/[id]/model` returns the project header, working copy, `lock_epoch` and whether the user may edit, in one server request (Q-0500; 03b rule 1).
- **Scope (install):** `zustand` 5.0.15 is added to `app/package.json`. Its Dependencies row already exists (ARCH Dependencies), but the package is not installed.
- **Done when:** 50 edits applied in one minute write only the changed model_object rows, with at most one save in flight, and create no model_version row (AC-EZD-120b-4). Undo reverses the last edit with the same patch that applied it, and redo applies it again; each edit reports exactly the object ids it changed (AC-EZD-120b-10). Queued changes are kept on the device for the user and company that made them, survive reopening the store, and drain when the network returns, one save at a time. The load route answers the editor's project data in one request, refuses a user without View projects and does not reveal a project outside the user's scope.
- **Depends on:** EZD-120a (tables, `save_objects`, the save route, the floor object of M4). Missing from the ticket row: EZD-102 (`requireApiPermission`, `requirePermission`, can()), EZD-020 (the `editorOnly` lint and `app/src/editor/`), EZD-024 (`reportRouteFailure`), EZD-133 (the no-table-query-in-browser lint, phase 3).
- **Files (about 12):** `app/src/editor/model/patches.ts`, `model-store.ts`; `app/src/lib/outbox/outbox.ts`, `outbox-idb.ts` (outbox plus device copy), `outbox-sync.ts`, `model-api.ts`; `app/src/server/model/model.ts` (adds the load); `app/src/app/api/projects/[id]/model/route.ts`; `app/package.json`, `pnpm-lock.yaml`; `docs/architecture.md`; a migration plus `database.types.ts` plus the EZD-006 `GATED_RPC_CALLS` edit only if the plan loads through a new database function.
- **Tests (about 13):** undo and changed ids; outbox coalescing, re-basing, user-and-company key; device copy; debounce and one in flight; AC-4 against the local database; offline drain; refused save held; one tab drains; load route 200, 401, 403, 404, one request.
- **Complexity:** high: a new pattern (patches, the outbox, a cross-tab drain) that every later edit and EZD-299 builds on, data integrity, and server data access (PROCESS.md section 4). Test-author Sonnet 5.5, builder Opus 5.5.
- **security-review: yes** (data access: the load route and its scope check; the outbox never sends one user's changes under another sign-in, Q-0503 and 03b rule 1).
- **Visual checklist:** none (no screen).
- **Proposed wording:** none expected (no user-visible text).
- **User-visible result:** nothing on screen yet.

### Part EZD-120c · Editor route, save state and banners
- **Scope:** the editor route under the `(editor)` entry, `app/src/app/(editor)/projects/[id]/page.tsx`. It renders with `EditorFrame`, `EditorHeader` and `StatusBar` (ARCH "Editor shell (EZD-012)", "Shell header (EZD-011)"). The header shows the project name, client, "Working copy" and the save state ("Saving…", "Saved just now", "Saved N min ago"). Under 1 minute is "just now", 1 to 59 minutes is "N min ago", and after that it shows a clock time (Q-0507 gaps 4 and 5; wording at Stage 2).
- **Scope (what the editor shows):** the drawing area is empty with no hint. No tab, panel or status item appears whose feature is not built, apart from the disclaimer line (Q-0500; Q-0229). A view-only user sees the header without the save state (Q-0500).
- **Scope (states):**
  - loading: a skeleton (S03 States; Q-0506; ARCH "State components (EZD-015)");
  - failed load: an inline message with Retry (Q-0214);
  - no access: "You don't have access to this. Ask your supervisor." (Q-0214);
  - unknown or out-of-scope project: the not-found state (Q-0273; ARCH Errors and logging, 404);
  - error saving: the "Changes not saved" banner with Retry, edits kept (S03 States);
  - offline: the banner "Offline. Changes are saved on this device and will sync." (Q-0501, Q-0214).
- **Scope (entry points):** project cards and Create open this route (Q-0500, which ends the Q-0394 hold). Links use `prefetch={false}` (ARCH Entry points).
- **Scope (perf):** repoint the editor entry's perf measurement to the route (ARCH Entry points table row `(editor)`, owner EZD-120b). The perf runner has no signed-in session (P117a Do not touch; EZD-276 blocked). If the route cannot be measured signed out, this part's plan raises it as a QP question.
- **Done when:** AC-EZD-120b-1, -2, -3, -5, -6, -7 and -11, verbatim, in that order.
- **Depends on:** EZD-120b, EZD-012a/b/c, EZD-011b, EZD-117a, EZD-117b, EZD-118, EZD-015a (states, `OfflineBanner`, `useOnline`), EZD-136 (disclaimer), EZD-016a (browser harness). Missing from the ticket row: EZD-011b, EZD-015a, EZD-136, EZD-016a.
- **Earlier tests this part edits (test-author, named in its plan):**
  - P117a U7 (card markup has no `<a`, `href`, `role=`, `tabindex`);
  - P117a B6 (card is not a link, 0 navigations);
  - P118 "After create" and B3 (Create stays on Projects).
  Q-0500 changes all of them. The plan also greps for any whole-markup or "strip tags then expect empty" check on `EmptyEditor` and the status bar (lesson EZD-136 plan-gap).
- **Files (about 12):** the route page; `app/src/editor/ProjectEditor.tsx` with its CSS module; `app/src/editor/SaveStatus.tsx` (subtitle part and the two banners); `app/src/lib/outbox/save-state.ts` (the wording thresholds); `app/src/components/projects/ProjectCard.tsx`; `ProjectsView.tsx` and the new-project dialog's after-create step; `scripts/perf/registry.mjs` (per the perf scope above); `app/src/server/messages/catalogs/en.ts`, `es.ts`; `docs/architecture.md`.
- **Tests (about 13):** save-state wording at 0 s, 59 s, 60 s, 59 min and 60 min; header markup with and without Edit model; one request on open; the browser cases of AC-1, -2, -3, -5, -6, -7 and -11.
- **Complexity:** high: permissions decide what shows, there are many states, and it changes two merged screens (PROCESS.md section 4). Test-author Sonnet 5.5, builder Opus 5.5.
- **security-review: yes** (permissions: view-only versus edit, no-access and not-found without revealing existence).
- **Visual checklist:** yes, one desktop viewport (1600 × 1000, ARCH Browser tests), against board `vault/mockups/S03Plan.png` header and the shared state components. The header and its subtitle are checked filled, saving, saved and view-only; the loading, error, no-access, not-found, offline and error-saving states are built from approved wording with no board (Q-0506).
- **Proposed wording:** the "Changes not saved" banner's longer text if any, the clock-time form after 59 minutes, the failed-load line, and the Spanish of any new key.
- **User-visible result:** a project card or Create opens the editor, and the header shows when the work is saved.

### Part EZD-120d · Sign-out with queued edits, app-wide drain and the test page
- **Scope (drain and sign-out):** the outbox drain runs whenever the app is open, in the office entry as well as the editor (Q-0507 gap 10). Sign out first sends queued edits; if it cannot, for example offline, it warns and asks before signing out. Queued edits are never sent while another user is signed in on that device, and send when the first user signs back in (Q-0503; 03b rule 1). This plugs into the existing `beforeSignOut` hook of `SignOutButton` and `AvatarMenu`, and `SettingsShell`'s `useLeaveCheck`.
- **Scope (test page):** a developer test page, not found in production (Q-0505; ARCH Folder layout `src/app/dev/<name>/`). It has "50 edits" and "fail next save" buttons and shows how many rows were written and how many checkpoints were made (Q-0508). Its edits act on the project's floor object, the only object type before EZD-202 (P120a M4). EZD-299 adds "make a conflict" (EZD-299 row; Q-0508).
- **Done when:** AC-EZD-120b-8 and AC-EZD-120b-9, verbatim.
- **Depends on:** EZD-120b, EZD-120c (the banners the test page shows for Josh's step 4, PHASES.md slice 3 test script), EZD-108 (`AvatarMenu`), EZD-103b (`SettingsShell` sign-out check), EZD-015b (`useConfirm`), EZD-016a. Missing from the ticket row: EZD-108, EZD-103b, EZD-015b, EZD-016a.
- **Files (about 11):** `app/src/lib/outbox/sign-out.ts`; `app/src/components/outbox/OutboxSync.tsx`; `app/src/app/(office)/layout.tsx`; the callers that pass `beforeSignOut` (the Projects header and home page per EZD-117b, `SettingsShell.tsx`); the test page `page.tsx` and its bar component; `app/src/app/api/dev/model/[id]/route.ts` (checkpoint count; not found in production); `en.ts`, `es.ts`; `docs/architecture.md`.
- **Tests (about 9):** sign out drains first; offline asks; Cancel keeps the session; a second user's sign-in sends nothing; the first user's return sends; the drain runs on Projects; the test page's counts after "50 edits" and "fail next save"; production not found.
- **Complexity:** medium: it follows the `beforeSignOut` and dev-page patterns, but touches auth flows (PROCESS.md section 4). Test-author Sonnet 5.5, builder Sonnet 5.5.
- **security-review: yes** (auth: sign-out, and data sent only under the user who made it).
- **Visual checklist:** yes, one desktop viewport: the sign-out warning dialog (EZD-015b `ConfirmDialog`), with no board for it.
- **Proposed wording:** the sign-out warning title, message and confirm label, and the test page's labels and counts lines.
- **User-visible result:** signing out never strands unsaved work, and Josh has a test page for his phase 3 steps 2 and 4.

### Applies to every part's plan
- **Code places.** The store goes in `app/src/editor/`, and only editor files import it (ARCH Entry points: `app/src/editor/`, the `editorOnly` lint). The outbox, sync and device copy go in `app/src/lib/outbox/`, because Projects and Settings sign-out must use them (Q-0503).
- **Refused saves.** A 409 `save_conflict`, 400, 403 or 404 from the save route is not retried. The change stays at the head of the outbox and the editor shows the error state until EZD-299's conflict list replaces that branch (Q-0502; P120a section 3). `lock_epoch` comes from the load and stays 0 until EZD-125 (00d Lock generation).
- **Lessons each plan applies:** typed adapter for the outbox storage (EZD-018); full factory signatures (EZD-009); IndexedDB browser cases in their own context (EZD-103b); guards read before mocking (EZD-169); `reportRouteFailure` (EZD-113); any new function revoked from public and probed (L-016, L-009); no test reads a document (L-041); earlier tests that pin changed markup named with new values (L-021, EZD-021).
- **IndexedDB in unit tests.** Vitest runs in `node` with no IndexedDB (ARCH Tests). Part b's plan either adds a dev-only IndexedDB stand-in package, with its Dependencies row (CLAUDE.md rule 7), or covers `outbox-idb.ts` only in browser tests. It cites the choice.

### Ledger notes for the orchestrator
- **EZD-299** depends on `EZD-120b` (tickets.json). It also needs 120c (the editor banner, Q-0511 (a)) and 120d (the test page's "make a conflict" button, Q-0508), so it should list all three parts or the base `EZD-120`.
- **EZD-1020** depends on `EZD-120b`. It needs the editor (120c).
- Dependents listing base `EZD-120` (EZD-111, 121, 125, 134, 202, 236, 1402) expand to every part (KNOWN-LIMITS 9).
- **Phase 3 build order** becomes 133, 120a, 120b, 120c, 120d, 202, 299, 238.

### Reviewers (all parts)
code-reviewer always · security-reviewer yes on all three · ui-verifier on 120c and 120d · calc-auditor no.

## Sources
- Ticket row: phase-01.md:30; tickets.json EZD-120b.
- Spec: 03a, 03b rules 1, 5–7, 9 and 12, S03 States, 00d, 04 Header card, and 11 Performance (Budgets "Open a project", "Save"; rules 1, 2 and 7).
- Decisions: Q-0500, Q-0501, Q-0503, Q-0505, Q-0506, Q-0507, Q-0508, Q-0214, Q-0229, Q-0273, Q-0502, Q-0530.
- Dependency contracts: P120a, P012a/b/c, P117a, P117b, P118 (section 3 of each).
- Code read: `app/package.json`, the sign-out sites, `(editor)/`, `(office)/layout.tsx`, `EditorHeader.tsx`.
- Architecture: none beyond the core for this proposal; read: Dependencies; Entry points and lazy modules (EZD-020); Editor shell (EZD-012); Shell header (EZD-011); State components (EZD-015); Unsaved edits and drafts (EZD-103b).
- Research: no report covers this ticket (no retriever dispatched).

## Open questions
None at the split level; each part plan raises its own.
