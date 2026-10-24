# EZD-016a · Test harness: sign-in, session and network helpers

- **ACs:** AC-EZD-016a-1 (`vault/spec/acceptance-criteria.md` line 73; generated from Done-when).
- **Complexity:** high (section 8).
- **User-visible result:** nothing on screen. Browser tests can sign in as Josh at the desktop, iPad landscape, Surface and iPhone sizes, open two signed-in people at once, and switch a browser's network off and on, so later screens and lock and offline tests use one tested helper set.
- Phase: 0 · Planned by: planner · Date: 2026-10-20 (part plan after the split, Q-0198) · Status: planned; re-validated 2026-10-20 (EZD-016c 67d1ec8, EZD-016d 76b7557)

**Pre-split plan** (Split proposal, V1–V12, Steps 1–8; EZD-016c and EZD-016d are planned from it): `git show 548a74e:vault/plans/EZD-016a.md`, the commit Q-0198 cites. This plan keeps its part-a steps and its section 3 names, test IDs and values (Q-0198).

## 1. What to build

**Ticket row (phase-00.md line 37).**
- **Scope:** Plan vault/plans/EZD-016a.md Steps 3, 3a, 4 and 5 (sign-in as a seeded user through /auth/confirm, server-path and browser-path clients, two-session helper for lock tests, network on/off helper), Step 6's test.ts and README, and Step 8's docs lines for the helpers. Original scope: browser test runner with desktop, iPad landscape and phone projects; two-session helper; network on/off helper; seed script (one user per preset is added to the seed by EZD-101). Split into EZD-016c, EZD-016d, EZD-016a (Q-0198); plan Part EZD-016a.
- **Done when:** A sample browser test signs in as the seeded owner at all three device sizes.
- **Depends on:** EZD-016c, EZD-016d, EZD-006, EZD-007.
- **Spec ref:** Build phases and acceptance tests; Import and export · Imports. Imports is EZD-016b's; nothing from 08 is built here.
- **Q-0088 extends the Done when:** the Surface is a fourth project, so T1 signs in at four sizes.

This is a harness ticket (PROCESS.md Special tickets). The test-author writes every helper and test file (`.claude/hooks/guard-paths.mjs` line 15: `test-harness/`, `e2e/` and `__tests__/` are test paths). The builder writes only `docs/architecture.md` (L-002 checked).

**Data:** no table, column, migration, RLS policy, `schema_version` or money field (secret handling: section 7).

### Step 1 · Email lock (`app/test-harness/e2e/email-lock.ts`)
- **Why:** a new `generateLink` replaces that user's earlier token, and T1 signs Josh in from four projects at once (`workers: 4`, Q-0114).
- **`withEmailLock(email, fn)`:**
  - Takes the lock file `lockPathFor(email)` = `<os.tmpdir()>/ezdraft-e2e-locks/<first 16 hex of sha256(lower-cased email)>.lock`. It creates the folder if missing and opens the file with flag `wx`.
  - Polls every 100 ms and waits up to 30,000 ms, then throws `email lock timeout for <email>`.
  - Takes over a lock file whose mtime is more than 60,000 ms old.
  - Runs `fn`, deletes the file in `finally` and re-throws `fn`'s error.
  - The four numbers are planner's choices, kept from the pre-split plan (reviewed at Stage 2).

### Step 2 · Sign-in helper (`app/test-harness/e2e/sign-in-as.ts`)
`signInAs(page, email)` signs in through the app's real link page without sending an email (EZD-007d `confirmSignInLink`; EZD-007f `/auth/confirm`, `confirm-submit`).
1. Lower-case the email, then run the rest inside `withEmailLock`.
2. With `adminDb()` (EZD-006), find an `app_user` with this email and a `membership` with `status` `active`. If there is none, throw `no active membership for <email>` before touching the browser. Admin `createUser` bypasses the before-user-created hook, so the helper checks this itself (pre-split V7; docs/architecture.md Auth and session, hook bullet).
3. Call `adminDb().auth.admin.createUser({ email, email_confirm: true })`. The "already registered" error is ignored and any other error is thrown. The pinned error is `code` `email_exists` (HTTP 422) *(confirm on the pinned stack)*. Users from EZD-006 `createMember` and EZD-007a `createTestMember` already exist.
4. Call `adminDb().auth.admin.generateLink({ type: 'magiclink', email })`, as EZD-006 `signIn` does. An HTTP 429 is retried up to 5 times, 1,000 ms apart (planner's choice). Any other error, or a missing `properties.hashed_token`, is thrown.
5. `page.goto('/auth/confirm?token_hash=<hashed_token>&type=email')`, click `confirm-submit`, then wait for path `/` or for `confirm-error`. If `confirm-error` shows, throw `sign-in failed for <email>: <its text>`.
   - `confirmSignInLink` accepts only `type` `email` (`app/src/server/auth/actions.ts` line 96).
   - The email template sends the same `TokenHash` with `type=email` for magic-link emails (docs/architecture.md Sign-in email), and EZD-007f's smoke test signs in that way. So a `hashed_token` for a confirmed user should verify. *Confirm on the pinned stack*; if it does not, raise a question rather than change `/auth/confirm`.
   - `completeSignIn` then links the `app_user` and refreshes the session so the tenant claim is set (EZD-007d).
6. Return `SignedIn`: `{ ...await sessionClaims(page.context()), ...await sessionDbs(page.context()) }`.
- `signInAsOwner(page)` = `signInAs(page, JOSH_EMAIL)`. `JOSH_EMAIL` comes from EZD-016c `seed-ids.ts`.
- `signInWithCode` (EZD-007f) stays as it is, for tests that need the email path.

### Step 3 · Session claims and clients (`app/test-harness/e2e/session-claims.ts`)
- **`sessionAccessToken(context)`:**
  1. Read `context.cookies('http://127.0.0.1:3000')`. Playwright returns httpOnly cookies too.
  2. Take the cookies named `^sb-.+-auth-token(\.(0|[1-9]\d*))?$`. Use the unsuffixed one if present, otherwise join `.0`, `.1`, … in numeric order. Pinned `@supabase/ssr` 0.12.7 names chunks `${key}.${i}`, with a maximum chunk size of 3,180 (`dist/main/utils/chunker.js` lines 8, 63).
  3. Strip the `base64-` prefix, base64url-decode, `JSON.parse`, and return `access_token` (`dist/main/cookies.js` lines 9, 37–50).
  4. Throw `no session cookie` when there is none.
- **`sessionClaims(context)`:** the access token's payload, base64url-decoded and not verified, the same way as EZD-006 `claimsOf`, narrowed to `SessionClaims`.
- **`sessionDbs(context)`:** `{ accessToken, serverDb: sessionClient(accessToken, gateSecret()), browserDb: sessionClient(accessToken) }`, using EZD-006's helpers (pre-split V8; Q-0087 (ii)).
  - `serverDb` takes the server-route path and sends `x-ezd-api-gate`.
  - `browserDb` does not send the header, so PostgREST refuses it.
  - Both exist only in the Node test process.

### Step 4 · Two-session helper (`app/test-harness/e2e/sessions.ts`)
The fixture `sessions.open(emails)` returns `OpenSession[]` in the same order as `emails`. The edit-lock row (12) needs two people at once, and EZD-018 uses it for presence.
- For each email it calls `browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, baseURL })`, taking each value from `testInfo.project.use`, so every session has the current project's size. It then opens one page and calls `signInAs`.
- Any email with an active membership works.
- Teardown closes every context it opened, including after a failure.

### Step 5 · Network helper (`app/test-harness/e2e/network.ts`)
The fixture `network.set(target, state)` takes a `Page` or a `BrowserContext` (a page's context is used).
- It calls `context.setOffline(state === 'off')`.
- It then waits up to 5,000 ms (planner's choice) until every page of the context has `navigator.onLine === (state === 'on')`, and throws `network state not reached` otherwise.
- Users: EZD-015's offline banner and the offline tests (12 Offline row).

### Step 6 · `test.ts` and README (`app/test-harness/e2e/`)
- **`test.ts`:**
  - Exports `test` = Playwright `test.extend` with three fixtures:
    - `signInAs: (email: string) => Promise<SignedIn>`, bound to the test's `page`;
    - `sessions`;
    - `network`.
  - Exports `expect`.
  - Re-exports every `app/test-utils/seed-ids.ts` export (EZD-005b plus EZD-016c), `signInAsOwner`, `sessionAccessToken`, `sessionClaims`, `sessionDbs` and EZD-006's `adminDb`. EZD-026b changes a user's language with `adminDb`.
- **`README.md` covers:**
  - one paragraph on the projects and tag routing, pointing to EZD-016d's docs subsection;
  - `signInAs`, `signInAsOwner`, the lock and why it exists;
  - `serverDb` and `browserDb`; the secret and gated clients never go to `page.evaluate`, `addInitScript`, `setExtraHTTPHeaders`, `route` handlers or a storage state;
  - `sessions` and `network`;
  - the seed rule: tests never change seeded rows, and a test that changes data creates its own rows with EZD-006 or EZD-007a fixtures and removes them;
  - how to run: `pnpm build`, then `pnpm test:e2e`. Install WebKit once with `pnpm --filter @ezdraft/app exec playwright install webkit`.

### Step 7 · Docs (builder)
Only in `docs/architecture.md` `### Browser tests (EZD-016a)` under `## Tests`. EZD-016d creates that subsection (pre-split Step 8 [d]).
- Add one bullet: `signInAs` / `signInAsOwner` (via `/auth/confirm`, per-email lock), `sessions.open`, `network.set`, and `serverDb` (gated) and `browserDb` (refused), which stay in Node.
- Add the import line `import { test, expect } from '../test-harness/e2e/test'`.
- `## Machine checks`: add the row "Harness sign-in never sends the gate secret to the browser; server path gated, browser path refused | `app/e2e/harness.spec.ts` (T12; Q-0087) | EZD-016a".
- EZD-016d leftovers (its STATUS row): in `### CI`, "or `test:e2e` / `perf` once EZD-016a / EZD-017 add them" becomes "`test:e2e` (EZD-007f, root `package.json` line 13), or `perf` once EZD-017 adds it"; in `### Test scope (Q-0006)`, "EZD-016a's `playwright.config.ts`" becomes "`app/playwright.config.ts` (EZD-007f, EZD-016d)". T9b checks both.

### Step 8 · T5 secret comparison (test-author)
In EZD-016d's `harness-config.test.ts` T5, lines 108 and 112 become boolean comparisons (T14). Nothing else in the file changes.

### Files
| Path | New / change | By | Why |
| --- | --- | --- | --- |
| `app/test-harness/e2e/email-lock.ts` | New | test-author | Step 1 |
| `app/test-harness/e2e/sign-in-as.ts` | New | test-author | Step 2 |
| `app/test-harness/e2e/session-claims.ts` | New | test-author | Step 3 |
| `app/test-harness/e2e/sessions.ts`, `network.ts` | New | test-author | Steps 4, 5 |
| `app/test-harness/e2e/test.ts`, `README.md` | New | test-author | Step 6 |
| `app/e2e/harness.spec.ts` | New | test-author | T1, T2, T3, T12, T13 |
| `app/test-harness/e2e/email-lock.test.ts` | New | test-author | T7 |
| `scripts/e2e/__tests__/routing.test.mjs` | New | test-author | T8, T9b |
| `app/test-harness/e2e/harness-config.test.ts` | Change | test-author | Step 8, T14 |
| `docs/architecture.md` | Change | builder | Step 7 |
| Not touched: `app/playwright.config.ts`, `devices.ts`, `global-setup.ts`, `app/vitest.config.ts` (EZD-016d); `seed.sql`, `seed-ids.ts` (EZD-016c); EZD-007f's specs and `app/test-harness/*.ts`; `app/test-harness/rls/**`; `app/src/**`; `scripts/gate.mjs`; `ci.yml` | — | — | Reused as they are |

The size is 11 files (one a two-line test edit) and 8 tests plus the T14 edit (T13 added for L-012), plus the gate and CI. That is the part Q-0198 agreed; the seven helper files are one concern each.

## 2. Sources
- **Spec:** `12` lines 13–14 (Edit lock row: two sessions; Offline row: network helper); `02` Platform; `03` rule 1, Tables `app_user`, `membership`; `04` "Desktop frame 1600 × 1000"; `11` Performance unaffected (the harness ships in no bundle, Budgets 200 KB), Security and audit applies; `screens/S17`, `S18` "Phone 390x844"; `non-goals.md` nothing applies; `glossary.md` Edit lock.
- **Decisions (QUESTIONS.md):** Q-0198 (split; this part's scope); Q-0088 (four sizes), Q-0053 (iPad 1180 × 820); Q-0087 (ii) (server-only gate header); Q-0114 (workers 4); Q-0006 (scope, `@smoke`); Q-0039 (c) (`/` shows only Sign out until Phase 1); Q-0045 (a) (EZD-007f's runner, extended by EZD-016d); Q-0197 (b) (no `import.meta` under Playwright: `process.cwd()` or `os.tmpdir()`).
- **Dependency contracts:** EZD-006 section 3 (`adminDb`, `sessionClient`, `gateSecret`, `createTenant`, `createMember`, `cleanup`, `closeHarness`, `claimsOf`); EZD-007f section 3 (`/auth/confirm`, `/`, data-testids, `signInWithCode`, config); EZD-007d (`confirmSignInLink`, `completeSignIn`, `PUBLIC_PATHS`); EZD-016c, EZD-016d as merged, and their STATUS rows (EZD-016d's two open minors: Steps 7–8).
- **Merged code (read 2026-10-20):** `app/test-harness/rls/fixtures.ts` lines 14–19, 31, 46, 141–211; `app/test-harness/sign-in.ts`; `ConfirmForm.tsx` lines 32, 40; `SignOutButton.tsx` line 36; `app/src/server/auth/actions.ts` lines 94–101; `public-paths.ts`; `api/health/route.ts` line 10; `app/e2e/sign-in.spec.ts` lines 76–78, 110; `app/playwright.config.ts`, `app/test-harness/e2e/devices.ts`, `app/vitest.config.ts` `include` (EZD-016d); `app/test-utils/seed-ids.ts` (EZD-016c); `harness-config.test.ts` lines 108, 112; `docs/architecture.md` lines 374–376, 399, 477; `@supabase/ssr` 0.12.7 `cookies.js`, `utils/chunker.js`; `playwright` 1.64.1 `lib/runner/index.js` lines 7140–7148 (list mode runs no global setup and no web server: settles the pre-split T8 risk); `.claude/hooks/guard-paths.mjs` lines 15, 73–74.
- **Mockup:** none (`mockups: []`). **Research:** no R-NNN report.

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| export | `app/test-harness/e2e/email-lock.ts` `withEmailLock<T>(email: string, fn: () => Promise<T>): Promise<T>`; `lockPathFor(email: string): string` | Step 1; error `email lock timeout for <email>` |
| export | `app/test-harness/e2e/session-claims.ts` `type SessionClaims = { sub: string; email: string; session_id: string; app_user_id?: string; tenant_id?: string; membership_id?: string; project_scope?: 'all' \| 'listed' }` | Claim names as EZD-006's token hook |
| export | same file: `sessionAccessToken(context: BrowserContext): Promise<string>`; `sessionClaims(context: BrowserContext): Promise<SessionClaims>`; `sessionDbs(context: BrowserContext): Promise<{ accessToken: string; serverDb: SupabaseClient; browserDb: SupabaseClient }>` | Step 3; error `no session cookie` |
| export | `app/test-harness/e2e/sign-in-as.ts` `type SignedIn = SessionClaims & { accessToken: string; serverDb: SupabaseClient; browserDb: SupabaseClient }`; `signInAs(page: Page, email: string): Promise<SignedIn>`; `signInAsOwner(page: Page): Promise<SignedIn>` | Step 2; errors `no active membership for <email>`, `sign-in failed for <email>: …` |
| export | `app/test-harness/e2e/sessions.ts` `type OpenSession = { email: string; context: BrowserContext; page: Page; claims: SessionClaims; accessToken: string; serverDb: SupabaseClient; browserDb: SupabaseClient }`; `type Sessions = { open(emails: string[]): Promise<OpenSession[]> }` | Step 4 |
| export | `app/test-harness/e2e/network.ts` `type Network = { set(target: Page \| BrowserContext, state: 'off' \| 'on'): Promise<void> }` | Step 5; error `network state not reached` |
| export | `app/test-harness/e2e/test.ts` `test` (fixtures `signInAs: (email: string) => Promise<SignedIn>`, `sessions: Sessions`, `network: Network`), `expect`; re-exports every `seed-ids.ts` export, `signInAsOwner`, `sessionAccessToken`, `sessionClaims`, `sessionDbs`, `adminDb` | Step 6; specs import only from here |
| test names | `test.describe('EZD-016a harness', …)` in `app/e2e/harness.spec.ts`; `describe('EZD-016a email lock', …)` in `email-lock.test.ts`; `describe('EZD-016a routing and docs', …)` in `routing.test.mjs` | Check C9 (`test-harness/` is exempt, so the reviewer checks that title) |
| from EZD-016d (`app/test-harness/e2e/devices.ts`, `app/playwright.config.ts`) | projects `desktop`, `ipad-landscape`, `surface`, `phone`; tags `@desktop`, `@ipad`, `@surface`, `@phone`; untagged runs in `desktop` only; `app/vitest.config.ts` `include` adds `test-harness/**/*.test.ts`; `process.env` in specs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_API_GATE_SECRET`, `EZD_TEST_DB_URL`, `EMAIL_STUB_DIR` (set by the config at load); docs `### Browser tests (EZD-016a)` | Checked against merged code 2026-10-20 (section 2) |
| from EZD-016c (`app/test-utils/seed-ids.ts`) | `JOSH_EMAIL` `'josh@example.com'`, `TENANT_2_ID`, `TENANT_2_OWNER_USER_ID`, `TENANT_2_OWNER_EMAIL`, `SEED_PROJECT_COUNT`, `seedProjectId(i)`; plus EZD-005b's `TENANT_1_ID`, `JOSH_USER_ID` | Same |
| from EZD-006, EZD-007f | `adminDb`, `sessionClient(accessToken, gate?)`, `gateSecret`, `createTenant`, `createMember({ tenantId, scope })` → `{ appUserId, authUserId, membershipId, email }`, `cleanup`, `closeHarness`; data-testids `confirm-submit`, `confirm-error`, `sign-out`; routes `/auth/confirm`, `/`, `/sign-in`, `/api/health` | Same |

## 4. Tests
- Browser specs import only from `app/test-harness/e2e/test.ts`.
- Fresh tenants and users come from EZD-006 `createTenant` / `createMember` and are removed with `cleanup()` and `closeHarness()` in `afterAll`. Seeded rows are only read.
- Tests match codes, URLs, claims, sizes and names, never message wording.
- The gate secret is compared only as a boolean or count (`a === b`, `includes`), never passed to a value matcher (L-018): T12 and T14.

| Test | AC | Type | Input | Expected value | Source |
| --- | --- | --- | --- | --- | --- |
| T1 Done when, **smoke**. Title `EZD-016a done when: a sample browser test signs in as the seeded owner @smoke`; tags `@desktop @ipad @surface @phone` | AC-EZD-016a-1 | browser (4 projects) | `signInAsOwner(page)`; read `page.viewportSize()`, `window.innerWidth`, `innerHeight`, `browserName` | Path `/`, and `sign-out` visible. Claims: `email` `josh@example.com`, `app_user_id` `00000000-0000-4000-8000-000000001001`, `tenant_id` `00000000-0000-4000-8000-000000000001`, `project_scope` `all`. Sizes: `desktop` 1600 × 1000 chromium; `ipad-landscape` 1180 × 820 webkit; `surface` 1440 × 960 chromium; `phone` 390 × 844 webkit. Viewport and inner size are equal. It runs in exactly these 4 projects (T8) | Done when; Q-0088; Q-0053; 04; S17/S18; EZD-005b seed ids; EZD-006 claims; EZD-007f `/`, `sign-out`; Q-0039 (c) |
| T2 Two sessions. Tags `@desktop @ipad @surface` | AC-EZD-016a-1 (Scope) | browser | Fresh tenant A; members `a` and `b` (scope `all`); `sessions.open([a.email, b.email])` | 2 sessions, in order. Each page is on `/` with `sign-out` visible. `claims.app_user_id` = `a.appUserId`, `b.appUserId`. The two `session_id`s differ. Both `tenant_id` = A. Each `viewportSize()` = `testInfo.project.use.viewport`. `serverDb` select `app_user` `id` `.eq('id', own)`: `error` null, ids [own]. The same through `browserDb`: `data` null, `error` ≠ null. After the fixture's teardown, both contexts report closed (`context.pages()` empty, `close` event fired) | Row Scope; 12 Edit lock row; Q-0087 (ii); docs/architecture.md RLS (`app_user` own row) |
| T3 Network. Tags `@desktop @phone` | AC-EZD-016a-1 (Scope) | browser | `/sign-in`; add `online` / `offline` listeners that count; `network.set(page,'off')`; `fetch('/api/health')`; `network.set(page,'on')`; fetch again | After off: `navigator.onLine` false, offline count 1, the fetch rejects. After on: `navigator.onLine` true, online count 1, status `200` | Row Scope; 12 Offline row; `health/route.ts` line 10; EZD-007d `PUBLIC_PATHS` |
| T7 Email lock | AC-EZD-016a-1 (helper) | unit (Vitest) | (a) Two concurrent `withEmailLock('a@x.test')`, each `fn` waiting 300 ms. (b) `a@x.test` and `b@x.test` at once. (c) A file at `lockPathFor('c@x.test')` with mtime 61,000 ms ago. (d) `fn` throws. (e) `lockPathFor('A@X.test')` | (a) Second start ≥ first end. (b) The runs overlap. (c) Runs within 1,000 ms. (d) The same error is re-thrown and the file is gone. (e) Equals `lockPathFor('a@x.test')` and ends in 16 hex + `.lock` | Step 1 (100, 30,000, 60,000 ms) |
| T8 Real routing | AC-EZD-016a-1 | unit (node:test) | `pnpm --filter @ezdraft/app exec playwright test --list --reporter=json`. Child env deletes `NODE_TEST_CONTEXT`. `EZD_TEST_GREP` is (a) deleted, (b) `(?:EZD-1\d{2}[a-z]?(?![0-9]))\|@smoke` (the `\` only escapes the table pipe) | (a) T1 under all 4 projects. T2 under `desktop`, `ipad-landscape`, `surface` only. T3 under `desktop`, `phone` only. T12, T13 and every test whose title path starts `EZD-007f` under `desktop` only. (b) T1 under all 4. T2, T3, T12 and T13 not listed. `EZD-007f done when: link from the mail catcher signs in and the user signs out` (tag `@smoke`) under `desktop` only. `EZD-007f done when: typing the 6-digit code signs in without opening the link` not listed. Exit 0 in both | EZD-016d routing; Q-0006; `sign-in.spec.ts` lines 76–78, 110; Playwright list mode starts no server (section 2); EZD-002 child env |
| T9b Docs helpers | AC-EZD-016a-1 | unit (node:test) | `docs/architecture.md` | The text between `### Browser tests (EZD-016a)` and the next heading names `signInAs`, `sessions`, `network`, `serverDb`, `browserDb`. `## Machine checks` has a row naming `app/e2e/harness.spec.ts`. The file contains neither `once EZD-016a` nor `EZD-016a's \`playwright.config.ts\`` | Step 7 |
| T12 Gate secret stays out of the browser (untagged, so `desktop` only) | AC-EZD-016a-1 (harness) | browser | Record every request of the context (`request.allHeaders()`) and the bodies of every `document` and `script` response; `signInAsOwner(page)`; reload `/`; read `document.documentElement.outerHTML` | Requests with a header named `x-ezd-api-gate` (any case): **0**. Bodies and HTML containing the value of `process.env.SUPABASE_API_GATE_SECRET`: **0**. `serverDb` select `app_user` `.eq('id', JOSH_USER_ID)`: `error` null, ids [`JOSH_USER_ID`]. The same through `browserDb`: `error` ≠ null | Q-0087 (ii); CLAUDE.md rule 8; 03 rule 1; EZD-005b |
| T13 Unknown email refused before the browser (untagged) | AC-EZD-016a-1 (helper) | browser | `signInAs(page, 'ezd016a-nobody@example.test')` (no `app_user`) | Rejects with a message starting `no active membership for`; `page.url()` is still `about:blank`; admin `auth.admin.listUsers` holds no user with that email | Step 2 item 2; V7; R24 #14 |
| T14 Secret comparison in EZD-016d's T5 (edit, title and `describe` kept) | AC-EZD-016d-1 | unit (Vitest) | `harness-config.test.ts` lines 108, 112 | Same checks as booleans: server-env secret equals the imported one `true`; each `NEXT_PUBLIC_*` equals it `false` | EZD-016d STATUS row; L-018 |
| T10 Gate (orchestrator) | all | gate | Docker running; Chromium and WebKit installed; `node scripts/gate.mjs .claude/worktrees/EZD-016a` | Exit 0: `typecheck`, `lint`, `test`, `build`, `test:e2e` in phase 0 + `@smoke` scope | CLAUDE.md rule 12; Q-0006 |
| T11 CI (orchestrator, Phase 0 PR) | AC-EZD-016a-1 | CI | The `gate` check | `ci.yml` "Install browsers" runs (not skipped) and `test:e2e` passes | `ci.yml`; Q-0021; Q-0022 |

Rules covered by a failing input (L-012): unknown email → T13; `browserDb` refused → T2, T12; stale takeover → T7 (c), the timeout by review; `network state not reached` → review.

## 5. Visual checklist
None. No screen is built or changed.

## 6. Proposed wording
None. The helper errors are developer messages in test output, not app text.

## 7. Security review
security-review: **yes**. Areas: auth, data access, API.
- Sign-in uses the Auth admin API (`createUser`, `generateLink`) with the secret key, in Node only, and goes through the real `/auth/confirm` action.
- The membership check comes before `createUser` (V7).
- The session cookie is read only in Node.
- The gate secret never reaches a browser (T12), and the gated client stays in Node (Q-0087 (ii); CLAUDE.md rule 8).

Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation
**High:** it covers auth (admin sign-in through the real confirm action, cookie decoding, gated and ungated clients) and a concurrency lock that every later browser test relies on. test-author and builder: Opus 5.5; security-reviewer Fable 5.1 (PROCESS.md section 4).

## 9. Dependencies
- **Row:** EZD-016c, EZD-016d, EZD-006, EZD-007a–f, all done (EZD-016c 67d1ec8, EZD-016d 76b7557).
- **Used but not in the row:** EZD-005b (`JOSH_USER_ID`, `TENANT_1_ID`, seed), EZD-004a (`db:up`), EZD-004b (`/api/health`), EZD-002 (`ci.yml`, child env), EZD-001 (C9, scope grep).
- **Before the build (orchestrator):** Docker running; WebKit installed (done for EZD-016d).
- **Later users:** EZD-009, 011–015, 016b, 018, 024, 026b, 027, 032, 033, 101.

**Risks:**
- **Confirm on the pinned stack** (test-author; raise a question, never drop a test): the `createUser` duplicate error code; `/auth/confirm` accepting a `generateLink` `hashed_token` with `type=email`; project `grep` seeing `{ tag }` tags (T8 (b)).
- **T1 is `@smoke` in WebKit:** every later gate needs WebKit.
- **Josh's sign-in links his `auth_user_id`;** every `test` / `test:e2e` run's `db:up` resets it (EZD-005b T1 holds).
- **`/` must keep `sign-out`** until a Phase 1 ticket replaces it and updates T1 (Q-0039 (c)).
- **`setOffline` may not close an open Realtime socket;** EZD-018 checks that.

## 10. Open questions
None.

Not re-asked: Q-0198, Q-0088, Q-0053, Q-0087 (ii), Q-0114, Q-0006, Q-0039 (c), Q-0045 (a), Q-0197 (b), Q-0021, Q-0022.
