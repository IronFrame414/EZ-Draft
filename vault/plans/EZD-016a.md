# EZD-016a · Test harness

- **ACs:** AC-EZD-016a-1 (generated from Done-when, `vault/spec/acceptance-criteria.md` line 71). After the split it stays with part EZD-016a. The orchestrator generates the ACs for parts c and d with `node vault/tools/gen_acs.mjs` from their Done-when texts below.
- **Complexity:** high for the whole ticket (about 22 files, 10 automated tests plus the gate and CI). Parts: EZD-016c medium, EZD-016d high, EZD-016a high.
- **User-visible result:** nothing on screen. Browser tests can sign in as Josh at desktop, iPad landscape, Surface and iPhone sizes, so every later screen is tested at the sizes Josh uses.
- Phase: 0 · Planned by: planner · Date: 2026-10-11; revised 2026-10-12 (Q-0053, Q-0088); re-validated 2026-10-20 (Stage 3 step 1; deviating EZD-002, EZD-006, EZD-007a–f; v2 template) · Status: split proposal (no QP)

## Split proposal

Sections 1–10 touch about 22 files: 16 by the test-author and 6 by the builder, counting the lockfile. They have 10 automated tests (T1–T9, T12) plus the gate (T10) and CI (T11). That is over the size rule (PROCESS.md section 6 "Ticket size": about 8 files, about 10 tests). The same step was taken for EZD-005 (Q-0150), EZD-007 (Q-0164) and EZD-008 (Q-0152).

Proposed: three parts, built in the order c → d → a.
- **EZD-016a keeps its ID**, the Done when and AC-EZD-016a-1. It is built last and depends on both new parts. Every ticket that already depends on EZD-016a therefore gets the whole harness with no `depends_on` change: EZD-009, 011, 012, 013, 014, 015, 016b, 018, 024, 026b, 027, 032 and 033 (phase-00.md).
- **New IDs:** EZD-016c and EZD-016d are the next free letters, since EZD-016b is Fixtures. The orchestrator assigns them.
- **What stays the same:** every name in section 3 (later plans cite them), every test ID and every expected value. Only the files and the `describe` titles move to the part IDs (check C9).
- **What moves:** T9's two `seed.sql` checks move into T4 (b), and T9's helper-name check becomes T9b. Their values are unchanged.
- **How the parts are planned:** each part is planned as its own unit from this section, the findings and sections 1–10.

### Part EZD-016c · Seed rows for browser tests
- **Scope:** Step 7, plus Step 8's seed docs lines.
- **Done when:** After `pnpm db:up` the local database holds a second tenant with its owner and 200 tenant 1 projects, and tenant 1 and Josh are unchanged.
- **Depends on:** EZD-005b, EZD-004a, EZD-004b (all done).
- **Files (4):**
  - builder: `supabase/seed.sql`, `docs/architecture.md`
  - test-author: `app/test-utils/seed-ids.ts`, `app/src/server/db/seed.test.ts` (new top-level `describe('EZD-016c seed', …)`)
- **Tests:** T4 (a) and (b), plus the gate.
- **Complexity:** medium. The rows follow EZD-005b's pattern, but they add a second tenant that isolation tests rely on. Sonnet 5.5 for test-author and builder.
- **security-review:** yes (data access: a second tenant and user in the local seed only; never in the cloud bootstrap file, Q-0033 (a)).
- **Other sections:** visual checklist none · wording none · user-visible: nothing on screen.

### Part EZD-016d · Device projects and runner config
- **Scope:** Steps 1, 2 and 6 (global setup), plus Step 8's wiring and its docs lines (projects, routing, folder layout, dependency row, machine checks).
- **Done when:** The browser runner has desktop, iPad landscape, Surface and phone projects at their sizes, routes each test by its device tags inside the gate's test scope, and CI's browser install finds a root config.
- **Depends on:** EZD-016c (the global setup checks the seed), EZD-007f (`app/playwright.config.ts`), EZD-002 (`ci.yml`), EZD-006, EZD-008a (stub email env; not in the ticket row).
- **Files (11):**
  - test-author: `app/playwright.config.ts`, `playwright.config.ts` (root), `app/test-harness/e2e/devices.ts`, `app/test-harness/e2e/global-setup.ts`, `app/vitest.config.ts`, `app/test-harness/e2e/harness-config.test.ts`, `scripts/e2e/__tests__/harness-wiring.test.mjs`
  - builder: root `package.json`, `pnpm-lock.yaml`, `.gitignore`, `docs/architecture.md`
- **Tests:** T5, T6, T9, plus the gate.
- **Complexity:** high. It is a new pattern: per-project grep composed with the gate scope, and server env that carries the gate secret. Opus 5.5 for test-author and builder.
- **security-review:** yes (auth and API: the gate secret only in the web server env and the Node process; the secret key kept out of the web server).
- **Other sections:** visual checklist none · wording none. Install WebKit once before the build (orchestrator).

### Part EZD-016a · Sign-in, session and network helpers (Done when)
- **Scope:** Steps 3, 3a, 4 and 5, Step 6's `test.ts` and README, and Step 8's docs lines for the helpers.
- **Done when:** A sample browser test signs in as the seeded owner at all three device sizes (AC-EZD-016a-1; four with the Surface, Q-0088).
- **Depends on:** EZD-016c, EZD-016d, EZD-006, EZD-007a–f.
- **Files (11):**
  - test-author: `app/test-harness/e2e/email-lock.ts`, `sign-in-as.ts`, `session-claims.ts`, `sessions.ts`, `network.ts`, `test.ts`, `README.md`; `app/e2e/harness.spec.ts`; `app/test-harness/e2e/email-lock.test.ts`; `scripts/e2e/__tests__/routing.test.mjs`
  - builder: `docs/architecture.md`
- **Tests:** T1, T2, T3, T7, T8, T9b and T12, plus the gate and CI (T11, at the Phase 0 PR).
- **Complexity:** high. It covers auth: admin sign-in through the real confirm page, session cookies, and gated and ungated clients. Opus 5.5 for test-author and builder.
- **security-review:** yes (auth, data access, API).
- **Other sections:** visual checklist none · wording none.

### Reviewers (all parts)
- code-reviewer: always.
- calc-auditor: no.
- ui-verifier: no (no screen).
- security-reviewer: yes on every part (Fable 5.1 on the high parts, PROCESS.md section 4).

## Re-validation findings (2026-10-20; applied in sections 1–10)
- **V1 References.** `depends_on` is EZD-007a–f, EZD-002, EZD-006. The v1 references now point at the merged parts: EZD-005 → EZD-005b; EZD-004 → EZD-004a / EZD-004b; EZD-008 → EZD-008a; EZD-007 → EZD-007a–f. EZD-005b and EZD-008a are used directly but are not in the row (section 9).
- **V2 The config exists** (EZD-007f, b0f5e1a; EZD-007f section 3). Step 2 extends it and never replaces it. The v1 `local-env.ts` is dropped: the env load stays inline and keeps overwriting `process.env` (EZD-004b: a shell value never points tests elsewhere).
- **V3 Where the gate secret comes from.** It is the `local.mjs env` value (`supabase/.temp/ezd-api-gate-secret`, written by `pnpm db:up`; EZD-007c, EZD-007f F6), not EZD-006's per-run Vitest secret.
  - The global setup's message is changed to match.
  - Inside `pnpm test`, the Vitest setup has stored its own hash, so T5 restores `process.env` after importing the config.
- **V4 Secret key kept out of the web server** (EZD-007f STATUS security note). Pinned Playwright 1.64.1 starts the server with `{ ...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...options.env }` (`node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/lib/runner/index.js`). Leaving the key out of `webServer.env` is therefore not enough: Step 2 sets it to `''`, and T5 asserts it. No `app/src` code reads the key (grep 2026-10-20).
- **V5 No `import.meta` under Playwright** (Q-0197 (b)). Repo root by walking up from `process.cwd()` to `pnpm-workspace.yaml`; config paths absolute, so the root re-export works.
- **V6 Workers 4** (Q-0114 names EZD-016a; the v1 header already read Q-0019 as 4). Step 2 and T5 are updated; the Windows-PC risks are removed (Mac mini, 32 GB).
- **V7 Admin `createUser` bypasses the before-user-created hook** (EZD-007a deviation 4). Step 3 checks membership itself, so an unknown email still throws before the browser opens, as in v1.
- **V8 EZD-006 exports what Step 3a needs:** `sessionClient`, `gateSecret`, `adminDb`. The conditional `dbForToken` and the `fixtures.ts` change are dropped.
- **V9 `app/e2e/gate-secret.spec.ts` is EZD-007f's** (T21). T12 moves into `harness.spec.ts`.
- **V10 `seed.test.ts` is EZD-005b's.** T4 becomes a new top-level `describe`.
  - The "same ids and values" rule (EZD-005b T18) covers tenant 1 and Josh only.
  - EZD-005b T17 truncates with `cascade` inside a rolled-back transaction (`tenancy-bootstrap.test.mjs` line 62), so the added rows do not affect it.
- **V11 `ci.yml` is unchanged** (read 2026-10-20). The root config and the root devDependency still stand. T8 child env follows EZD-002 deviation (1).
- **V12 Status updates.**
  - Q-0045, Q-0085 and Q-0087 are now confirmed-josh; Q-0002 is answered with no effect here.
  - `.gitignore` already ignores `playwright-report/` and `test-results/` at any depth.
  - Chromium is installed; WebKit is not.

## 1. What to build

**Ticket row (phase-00.md line 35).**
- **Scope:** Browser test runner (Playwright) with desktop, iPad landscape and phone projects; two-session helper for lock tests; network on/off helper; seed script (tenant 1 with Josh as owner, a second tenant, 200 projects; one user per preset is added to the seed by EZD-101).
- **Done when:** A sample browser test signs in as the seeded owner at all three device sizes.
- **Depends on:** EZD-007, EZD-002, EZD-006.
- **Spec ref:** Build phases and acceptance tests; Import and export · Imports. The Imports part is EZD-016b's; nothing from 08 is built here.
- **Q-0088 extends the row:** a `surface` project is added, and the Done-when test signs in at four sizes. The phase-file row is unchanged.

This is a harness ticket (PROCESS.md Special tickets). The test-author writes the config, the harness modules and the tests. The builder writes the seed rows, the root devDependency, `.gitignore` and the docs. Choices marked *planner's choice* were confirmed at plan review.

**Data:** no table, column, migration, RLS policy or `schema_version` change. Seed rows only, local stack only, no money fields. The secret key is used only in Node test processes. The gate secret lives only in the web server env and the Node test process.

### Step 1 · Device projects (`app/test-harness/e2e/devices.ts`) [d]
| Project | Browser | Viewport (CSS px) | Device settings | Source |
| --- | --- | --- | --- | --- |
| `desktop` (EZD-007f's, kept) | Chromium | 1600 × 1000 | `devices['Desktop Chrome']` (scale 1, `hasTouch` false, `isMobile` false) | 04 "Desktop frame 1600 × 1000 reference"; EZD-007f section 3 |
| `ipad-landscape` | WebKit | 1180 × 820, `deviceScaleFactor` 2 | `hasTouch` true, `isMobile` true; user agent from a current Playwright iPad landscape descriptor, named in the README, with the viewport overridden | Q-0053; Q-0088; 02 Platform; 11 Accessibility. Every iPad browser is WebKit. Scale 2 is a *planner's choice* (iPad Air is a 2× screen) |
| `surface` | Chromium | 1440 × 960, `deviceScaleFactor` 2 | `hasTouch` true, `isMobile` false; `devices['Desktop Chrome']` user agent; no `channel` | Q-0053; Q-0088 (Windows touch tablet). Edge is Chromium, and CI installs only `chromium webkit`. Scale 2 is a *planner's choice* (2880 × 1920 at 200%) |
| `phone` | WebKit | 390 × 844 | `devices['iPhone 13']` (`hasTouch` true, `isMobile` true), viewport overridden | S17 and S18 "Phone 390x844"; R26 R15 (iPhone); Q-0053 |

Firefox is not a project: `ci.yml` does not install it.

**Which tests run where** (*planner's choice*; it keeps runs short, Q-0114):
- A test with none of the tags `@desktop`, `@ipad`, `@surface`, `@phone` runs in `desktop` only. EZD-007f's untagged specs therefore stay desktop-only.
- A tagged test runs in exactly the tagged projects.
- Each project gets a `grep` that also carries the gate scope (Q-0006). If a project sets its own `grep`, it replaces the config-level one, so the scope has to be repeated inside it.
  - Scope part `S` = `(?=[\s\S]*(?:<EZD_TEST_GREP>))` when `EZD_TEST_GREP` is set, otherwise empty.
  - `desktop`: `^S(?:(?=[\s\S]*@desktop\b)|(?![\s\S]*@(?:ipad|surface|phone)\b))`
  - `ipad-landscape`: `^S(?=[\s\S]*@ipad\b)`
  - `surface`: `^S(?=[\s\S]*@surface\b)`
  - `phone`: `^S(?=[\s\S]*@phone\b)`
- The config-level `grep` from `EZD_TEST_GREP` stays as well (EZD-001; docs/architecture.md Test scope).

### Step 2 · Config (`app/playwright.config.ts` extended; root `playwright.config.ts` new) [d]
- **Kept from EZD-007f (V2):** the module-load env, `workers: 4` (V6), the top-level `grep`, `use.baseURL` and `webServer` `command` / `url` / `reuseExistingServer` (EZD-007f section 3).
- **Absolute paths from `<repo>/app`:** `testDir` `<app>/e2e`, `outputDir` `<app>/test-results`, `globalSetup` `<app>/test-harness/e2e/global-setup.ts`, `webServer.cwd` `<app>`, and the HTML report folder `<app>/playwright-report`.
- **Projects:** the four from Step 1, each with its `grep`. Also `use.trace` `retain-on-failure` and `use.screenshot` `only-on-failure`.
- **Timing (*planner's choice*):** `timeout: 60000`; `retries: 0` (a flaky test fails the gate); `fullyParallel` left at its default.
- **Reporter:** `list`, plus `html` with `open: 'never'`.
- **`webServer.env`:**
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_API_GATE_SECRET` (Q-0087; EZD-007c `createSessionClient()`);
  - `SUPABASE_SECRET_KEY: ''` (V4);
  - `EMAIL_TRANSPORT: 'stub'`, `EMAIL_FROM: 'EZ Draft Test <test@example.test>'` and `EMAIL_STUB_DIR: <app>/.e2e/email-outbox` (EZD-008a; docs/architecture.md Environment variables; the folder is a *planner's choice*).
- **`process.env.EMAIL_STUB_DIR`** is set to the same folder, so specs read the outbox the server writes.
- **The secret never reaches a browser** (Q-0087; CLAUDE.md rule 8):
  - no `use.extraHTTPHeaders`;
  - no harness code passes the secret or a gated client to `page.evaluate`, `addInitScript`, `setExtraHTTPHeaders`, `route` handlers or a storage state.
- **Root `playwright.config.ts`:** the one line `export { default } from './app/playwright.config';`. Reason: `ci.yml` installs browsers only when `hashFiles('playwright.config.*')` matches at the repo root, and only Josh edits `ci.yml` (V11; Q-0045 (a)).

### Step 3 · Sign-in helper (`email-lock.ts`, `sign-in-as.ts`, `session-claims.ts`) [a]
`signInAs(page, email)` signs in through the app's real link page without email (EZD-007d `confirmSignInLink`; EZD-007f `/auth/confirm`). It takes these steps:
1. Take `withEmailLock(email)`.
2. With `adminDb()` (EZD-006), find an `app_user` with this lower-cased email that has an `active` membership. If there is none, throw `no active membership for <email>` before touching the browser (V7).
3. Call `auth.admin.createUser({ email, email_confirm: true })`. An "already registered" error is ignored (EZD-006 `createMember` users); any other error is thrown.
4. Call `auth.admin.generateLink({ type: 'magiclink', email })`. Retry an HTTP 429 up to 5 times, 1,000 ms apart (*planner's choice*).
5. Go to `/auth/confirm?token_hash=<properties.hashed_token>&type=email`, click `confirm-submit` and wait for path `/`. If `confirm-error` appears, throw with its text.
6. Release the lock. Return `SignedIn`: the `sessionClaims` fields plus `accessToken`, `serverDb` and `browserDb` from `sessionDbs`.

Related helpers:
- **`signInAsOwner(page)`** = `signInAs(page, JOSH_EMAIL)`.
- **`withEmailLock(email, fn)`** exists because a new `generateLink` replaces that user's previous token, and T1 signs in Josh in four projects at once.
  - Lock file: `lockPathFor(email)` = `<os.tmpdir()>/ezdraft-e2e-locks/<first 16 hex of sha256(email)>.lock`, created with flag `wx`.
  - It polls every 100 ms and waits up to 30,000 ms.
  - A lock older than 60,000 ms is taken over.
  - The lock is released in `finally`.
  - All four numbers are *planner's choices*.
- **`sessionClaims(context)`:**
  1. Reads the `sb-…-auth-token` cookie, joining numbered chunks in order. It is httpOnly, but Playwright can read it.
  2. Decodes it per the pinned `@supabase/ssr` 0.12.7 format.
  3. Base64url-decodes the access-token payload without verifying it, as EZD-006 `claimsOf` does.
- **`sessionAccessToken(context)`** returns the raw access token from the same cookie.
- **`signInWithCode`** (EZD-007f) stays available for tests that need the email path.

### Step 3a · Server-path and browser-path clients (`session-claims.ts`) [a]
`sessionDbs(context)` returns `{ accessToken, serverDb: sessionClient(accessToken, gateSecret()), browserDb: sessionClient(accessToken) }`, using EZD-006's helpers (V8; Q-0087).
- `serverDb` is the app's own path: it sends the gate header.
- `browserDb` does not send it, so the gate refuses it.
- Both clients exist only in the Node test process.

### Step 4 · Two-session helper (`sessions.ts`) [a]
The fixture `sessions.open(emails)` returns `OpenSession[]`, with `{ email, context, page, claims, accessToken, serverDb, browserDb }` for each email.
- It creates one context per email with the current project's `viewport`, `deviceScaleFactor`, `isMobile`, `hasTouch`, `userAgent` and `baseURL`, taken from `testInfo.project.use`.
- It signs each context in with `signInAs`. Any email with an active membership works, including EZD-006 `createMember` users (EZD-018 Step 9 item 2).
- It closes every context in teardown.

### Step 5 · Network helper (`network.ts`) [a]
The fixture `network.set(target, 'off' | 'on')` calls `context.setOffline(state === 'off')`. It then waits, for up to 5,000 ms (*planner's choice*), until every page of that context has `navigator.onLine === (state === 'on')`. Users: EZD-015 and the offline tests (12 Offline row).

### Step 6 · Global setup [d], `test.ts` and README [a]
- **`global-setup.ts`** (secrets are never printed or logged):
  1. Checks that `process.env.SUPABASE_API_GATE_SECRET` is non-empty, otherwise throws `Gate secret missing: run pnpm db:up` (V3).
  2. With `adminDb()`, checks that the seed is present: tenant 1 and Josh by their ids, tenant 2, and 200 tenant 1 projects. Otherwise throws `Seed missing: run pnpm db:up`.
  3. Creates `EMAIL_STUB_DIR` if it is missing and empties it with `clearStubOutboxDir` (EZD-008a).
- **`test.ts`:**
  - exports `test` (Playwright `test` extended with the fixtures `signInAs`, `sessions` and `network`) and `expect`;
  - re-exports every `seed-ids.ts` export, `signInAsOwner`, `sessionAccessToken`, `sessionDbs`, and EZD-006's `adminDb` (EZD-026b B3 changes a user's language with it).
- **`README.md` covers:**
  - the projects and the tag routing;
  - `signInAs`, and the `serverDb` and `browserDb` clients, with the rule that the secret stays in Node;
  - `sessions` and `network`;
  - the seed and the seed rule;
  - how to run: `pnpm build`, then `pnpm test:e2e`; install WebKit once with `pnpm --filter @ezdraft/app exec playwright install webkit`.
- **Seed rule:** tests never change seeded rows. A test that changes data creates its own rows with EZD-006 or EZD-007a fixtures and cleans them up.

### Step 7 · Seed (builder appends to `supabase/seed.sql`; test-author extends `app/test-utils/seed-ids.ts`) [c]
The seed runs on the local stack only, through `db reset` in `pnpm db:up`. It never goes into `supabase/bootstrap/tenant-1.sql` (Q-0033 (a)). Values are *planner's choices* except where a source is named. Emails use `example.com`, as EZD-005b did.

| Rows | Values | Source |
| --- | --- | --- |
| Tenant 1, Josh | Unchanged | EZD-005b |
| Second tenant | `id` `00000000-0000-4000-8000-000000000002`, `name` `Test Tenant 2` | Row "a second tenant"; id pattern EZD-005b |
| Its owner | `app_user`: `id` `00000000-0000-4000-8000-000000002001`, `name` `Tenant 2 Owner`, `email` `tenant2-owner@example.com`, `language` `en`, `role_preset` `owner`, `auth_user_id` null. Membership: tenant 2, `active`, `all` | Phase 0 Build gate: "a test user of a second tenant reads zero tenant 1 rows" |
| 200 projects in tenant 1 | For i = 1…200: `id` `00000000-0000-4000-8000-` + `lpad((100000 + i)::text, 12, '0')`; `name` `Seed project ` + `lpad(i, 3, '0')`; `client_name` `Seed client ` + the same; `address` `Seed address ` + the same; `type` = `['kitchen','bath','whole_home_interior'][(i − 1) % 3]`; `status` = `['draft','client_review','permit_submitted','approved','in_build'][(i − 1) % 5]`; `created_at` = `updated_at` = `2026-10-01T12:00:00Z` − (i − 1) hours; other columns default | Row "200 projects". 11 Performance rule 9 (more than 50 rows). Allowed values from `supabase/migrations/20261019165203_create_project.sql` lines 10–12 |

- The builder writes this as one `insert … select` over `generate_series(1, 200)`, with no `membership_project` rows.
- A `seed.sql` comment notes that these rows are local test data, never in the bootstrap file.
- `seed-ids.ts` gains `TENANT_2_ID`, `TENANT_2_OWNER_USER_ID`, `JOSH_EMAIL` (`josh@example.com`), `TENANT_2_OWNER_EMAIL`, `SEED_PROJECT_COUNT` (`200`) and `seedProjectId(i)`. Its existing exports are unchanged.

### Step 8 · Wiring and docs (builder)
- **[d] Root `package.json`:** devDependency `@playwright/test` `1.64.1`, equal to the app's (check C1). Scripts are unchanged: EZD-007f's root and app `test:e2e` stay.
- **[d] `pnpm-lock.yaml`:** regenerated.
- **[d] `.gitignore`:** append `app/.e2e/`.
- **`docs/architecture.md`** (existing `##` headings only):
  - [c] In `### Tenancy tables (EZD-005)` → Seed rows, add the tenant 2 owner and 200 projects as local test rows, and say that the "same ids and values" rule covers tenant 1 and Josh only.
  - [d] Under `## Tests`, add `### Browser tests (EZD-016a)` covering:
    - the four projects (browser, size, touch, the device each stands for) and the tag routing;
    - `import { test, expect } from '<app>/test-harness/e2e/test'`;
    - the env, the outbox folder and the secret-key trim;
    - the run commands, the WebKit install and why the root config exists.

    Change the EZD-007f Browser tests bullet ("one project `desktop`") to point at the new subsection.
  - [d] `## Folder layout`: `app/test-harness/e2e/` and the root `playwright.config.ts`.
  - [d] `## Dependencies`: in the `@playwright/test` row, `Used in` becomes `root, app`.
  - [d] `## Machine checks`: add rows for "browser projects and routing (`harness-config.test.ts` T5, T6)" and "gate secret never reaches the browser; server path gated, browser path refused (`harness-config.test.ts` T5, `harness.spec.ts` T12; Q-0087)".
  - [c] The seed contents and the seed rule.
  - [a] In the same subsection: `signInAs`, `signInAsOwner`, `sessions.open`, `network.set`, `serverDb` and `browserDb`.

### Files
| Path | New / change | Part · by | Why |
| --- | --- | --- | --- |
| `supabase/seed.sql` | Change (append) | c · builder | Step 7 |
| `app/test-utils/seed-ids.ts` | Change | c · test-author | Step 7 |
| `app/src/server/db/seed.test.ts` | Change (new top-level describe) | c · test-author | T4 (V10) |
| `app/playwright.config.ts` | Change (extends EZD-007f's) | d · test-author | Steps 1–2 |
| `playwright.config.ts` (root) | New | d · test-author | Step 2 (V11) |
| `app/test-harness/e2e/devices.ts`, `global-setup.ts` | New | d · test-author | Steps 1, 6 |
| `app/vitest.config.ts` | Change: `include` adds `test-harness/**/*.test.ts` | d · test-author | T5–T7 sit next to the harness |
| `app/test-harness/e2e/harness-config.test.ts` | New | d · test-author | T5, T6 |
| `scripts/e2e/__tests__/harness-wiring.test.mjs` | New | d · test-author | T9 |
| root `package.json`, `pnpm-lock.yaml`, `.gitignore` | Change | d · builder | Step 8 |
| `app/test-harness/e2e/email-lock.ts`, `sign-in-as.ts`, `session-claims.ts`, `sessions.ts`, `network.ts`, `test.ts`, `README.md` | New | a · test-author | Steps 3–6 |
| `app/e2e/harness.spec.ts` | New | a · test-author | T1–T3, T12 |
| `app/test-harness/e2e/email-lock.test.ts` | New | a · test-author | T7 |
| `scripts/e2e/__tests__/routing.test.mjs` | New | a · test-author | T8, T9b |
| `docs/architecture.md` | Change | c, d, a · builder | Step 8 |
| Not touched: EZD-007f's `app/e2e/*.spec.ts`, `app/test-harness/sign-in.ts`, `mail-catcher.ts`, `auth-users.ts`; `app/test-harness/rls/**`; `supabase-env.global-setup.ts`; `app/package.json`; `scripts/gate.mjs`; `ci.yml`; `.env.example` | — | — | Reused as they are; no new app env name |

## 2. Sources
- **Spec:**
  - `12-build-phases-and-acceptance-tests.md` lines 13–14: the Edit lock row (reason for the two-session helper) and the Offline row (reason for the network helper).
  - `08-import-and-export.md` Imports (EZD-016b's).
  - `02-product-overview.md` Platform, Users and role presets, Named tools.
  - `03-data-model.md` Tables.
  - `04-app-shell-and-global-ui.md` "Desktop frame 1600 × 1000".
  - `11-non-functional-requirements.md` Performance rule 9, Accessibility, Operations.
  - `screens/S17`, `S18` "Phone 390x844".
- **Decisions:**
  - R26 R10, R15.
  - Q-0006 (scope and smoke); Q-0114 (workers 4, replacing Q-0019's count).
  - Q-0053 and Q-0088 (iPad 1180 × 820; Surface about 1440 × 960; projects for both).
  - Q-0013 (a) (browser floor); Q-0033 (a) (seed local only); Q-0039 (c) (EZD-032 opens `/dev/shell`).
  - Q-0045 (a) (minimal config from EZD-007, extended here); Q-0085 (a) (EZD-032 owns the build-gate test); Q-0087 (ii) (request gate, server-only header).
  - Q-0197 (b) (no `import.meta` under Playwright).
  - Referenced: Q-0002 (answered; no effect), Q-0021 and Q-0022 (CI on the phase PR), Q-0065 (b) (EZD-016b).
- **Merged code (read 2026-10-20 on develop 37efb5f):**
  - `app/playwright.config.ts`, `app/e2e/sign-in.spec.ts`, `app/e2e/gate-secret.spec.ts`;
  - `app/test-harness/{sign-in,auth-users,mail-catcher,email-outbox,supabase-env.global-setup}.ts`, `app/test-harness/rls/fixtures.ts`;
  - `app/test-utils/seed-ids.ts`, `supabase/seed.sql`, `app/src/server/db/seed.test.ts`, `scripts/db/__tests__/tenancy-bootstrap.test.mjs`;
  - `app/vitest.config.ts`, `package.json`, `.gitignore`, `.github/workflows/ci.yml`, `.claude/hooks/guard-paths.mjs` (write rules), `scripts/gate.mjs` line 151 (`test:e2e` after `build`).
- **Plans and status:**
  - EZD-007f section 3 (contract);
  - STATUS.md Notes for EZD-002, EZD-005b, EZD-006, EZD-007a–f, EZD-008a;
  - docs/architecture.md: Tests, Test scope, Policy test harness, Auth and session, Environment variables, Tenancy tables;
  - KNOWN-LIMITS item 7 (WebKit service workers).
- **Mockup:** none (`mockups: []`).
- **Research:** no R-NNN report covers this ticket.

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| project names | `desktop`, `ipad-landscape`, `surface`, `phone` | Step 1 settings; tags `@desktop`, `@ipad`, `@surface`, `@phone`; untagged = `desktop` |
| export | `devices.ts` `DEVICE_PROJECTS` | Read-only array of `{ name: DeviceName; use: {…} }` in that order; `type DeviceName` |
| export | `devices.ts` `projectGrep(device: DeviceName, scope?: string): RegExp` | Step 1 regexes; `scope` = the `EZD_TEST_GREP` value |
| config | `app/playwright.config.ts` default | Step 2; `projects` built from `DEVICE_PROJECTS` and `projectGrep(name, process.env.EZD_TEST_GREP)` |
| config | `playwright.config.ts` (root) | `export { default } from './app/playwright.config';` |
| file | `app/test-harness/e2e/global-setup.ts` default `async () => void` | Step 6 |
| export | `email-lock.ts` `withEmailLock<T>(email: string, fn: () => Promise<T>): Promise<T>`, `lockPathFor(email: string): string` | Step 3 |
| export | `session-claims.ts` `type SessionClaims = { sub: string; email: string; session_id: string; app_user_id?: string; tenant_id?: string; membership_id?: string; project_scope?: 'all' \| 'listed' }`; `sessionClaims(context: BrowserContext): Promise<SessionClaims>`; `sessionAccessToken(context): Promise<string>`; `sessionDbs(context): Promise<{ accessToken: string; serverDb: SupabaseClient; browserDb: SupabaseClient }>` | Steps 3, 3a |
| export | `sign-in-as.ts` `type SignedIn = SessionClaims & { accessToken; serverDb; browserDb }`; `signInAs(page: Page, email: string): Promise<SignedIn>`; `signInAsOwner(page: Page): Promise<SignedIn>` | Step 3; error `no active membership for <email>` |
| export | `sessions.ts` `type OpenSession = { email; context; page; claims: SessionClaims; accessToken; serverDb; browserDb }`; fixture `sessions: { open(emails: string[]): Promise<OpenSession[]> }` | Step 4 |
| export | `network.ts` fixture `network: { set(target: Page \| BrowserContext, state: 'off' \| 'on'): Promise<void> }` | Step 5 |
| export | `test.ts` `test` (fixtures `signInAs`, `sessions`, `network`), `expect`; re-exports `seed-ids.ts`, `signInAsOwner`, `sessionAccessToken`, `sessionDbs`, `adminDb` | Step 6 |
| export | `app/test-utils/seed-ids.ts` | `TENANT_2_ID` `'00000000-0000-4000-8000-000000000002'`, `TENANT_2_OWNER_USER_ID` `'00000000-0000-4000-8000-000000002001'`, `JOSH_EMAIL` `'josh@example.com'`, `TENANT_2_OWNER_EMAIL` `'tenant2-owner@example.com'`, `SEED_PROJECT_COUNT` `200`, `seedProjectId(i: number): string`; plus EZD-005b's `TENANT_1_ID`, `JOSH_USER_ID` |
| env | `webServer.env` | Step 2 keys and values |
| env | `process.env` in specs | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_API_GATE_SECRET`, `EZD_TEST_DB_URL`, `EMAIL_STUB_DIR` |
| test names | `describe('EZD-016c seed', …)`; `describe('EZD-016d …', …)` in `harness-config.test.ts` and `harness-wiring.test.mjs`; `test.describe('EZD-016a harness', …)` in `harness.spec.ts`; `describe('EZD-016a …', …)` in `email-lock.test.ts` and `routing.test.mjs` | Check C9 (`test-harness/` is exempt from C9, so the reviewer checks those titles) |
| used from dependencies | `adminDb`, `sessionClient`, `gateSecret`, `createTenant`, `createMember`, `cleanup`, `closeHarness` (EZD-006); `createTestMember`, `cleanupTestMembers` (EZD-007a); `signInWithCode` (EZD-007f); `clearStubOutboxDir` (EZD-008a); data-testids `confirm-submit`, `confirm-error`, `sign-out` (EZD-007f); `TENANT_1_ID`, `JOSH_USER_ID` (EZD-005b) | Checked against the merged code 2026-10-20 |

## 4. Tests
- Each file has its part's top-level `describe` (C9).
- Browser tests import from `app/test-harness/e2e/test.ts`.
- Fresh users come from EZD-006 `createMember` and are removed with `cleanup()`. Seeded rows are only read.
- Tests match codes, URLs, claims, sizes and names, never message wording.

| Test | AC | Type | Input | Expected value | Source |
| --- | --- | --- | --- | --- | --- |
| T1 [a] Done when, **smoke**. Title `EZD-016a done when: a sample browser test signs in as the seeded owner @smoke`; tags `@desktop @ipad @surface @phone` | AC-EZD-016a-1 | browser (4 projects) | `signInAsOwner(page)`, then read `page.viewportSize()`, `innerWidth`, `innerHeight`, `browserName` | Path `/`; `sign-out` visible. Claims: `email` `josh@example.com`, `app_user_id` `00000000-0000-4000-8000-000000001001`, `tenant_id` `00000000-0000-4000-8000-000000000001`, `project_scope` `all`. Sizes: `desktop` 1600 × 1000 chromium; `ipad-landscape` 1180 × 820 webkit; `surface` 1440 × 960 chromium; `phone` 390 × 844 webkit. Viewport and inner size are equal. It ran in exactly these 4 projects (T8) | Done when; Q-0088 (four sizes); EZD-005b seed; EZD-006 claims; EZD-007f `/`, `sign-out`; 04; S17/S18; Q-0053 |
| T2 [a] Two sessions. Tags `@desktop @ipad @surface` | AC-EZD-016a-1 (harness Scope) | browser | Fresh tenant A (`createTenant`), members `a` and `b` (scope all); `sessions.open([a.email, b.email])` | 2 sessions. Each page is on `/` with `sign-out` visible. `claims.app_user_id` = `a.appUserId` and `b.appUserId`; the two `session_id`s differ; both `tenant_id` = A; each `viewportSize()` = the project viewport. `serverDb` select of `app_user` `id` `.eq('id', own)`: `error` null, ids = [own]. The same through `browserDb`: `data` null, `error` ≠ null. After teardown both contexts are closed | Row Scope; 12 Edit lock row; 02 Platform; Q-0088; Q-0087; docs/architecture.md RLS (`app_user` own row) |
| T3 [a] Network. Tags `@desktop @phone` | AC-EZD-016a-1 (harness Scope) | browser | `/sign-in` with `online`/`offline` event counters; `network.set(page,'off')`; `fetch('/api/health')`; `network.set(page,'on')`; fetch again | After off: `navigator.onLine` false, offline events 1, the fetch rejects. After on: `navigator.onLine` true, online events 1, status `200` | Row Scope; 12 Offline row; EZD-004b health; EZD-007d `PUBLIC_PATHS` |
| T4 [c] Seed contents | Part c Done when | unit (Vitest, admin client) | (a) Read `tenant`, `app_user`, `membership`, `project`. (b) Read the `supabase/seed.sql` text (moved from T9) | (a) Tenant 2 `name` `Test Tenant 2`. Its owner: `Tenant 2 Owner`, `tenant2-owner@example.com`, `en`, `owner`, exactly 1 membership, `active`, `all`. Tenant 1 is still `Worth Properties` with Josh's membership (EZD-005b T1 values). Project counts: tenant 1 = `200`, tenant 2 = `0`. ids = `seedProjectId(1…200)`. Status: `draft`, `client_review`, `permit_submitted`, `approved`, `in_build` 40 each. Type: `kitchen` 67, `bath` 67, `whole_home_interior` 66. All `archived_at` null. `created_at`: project 1 `2026-10-01T12:00:00Z`, project 200 `2026-09-23T05:00:00Z`, all 200 distinct. `updated_at` = `created_at`. `seed-ids.ts` constants equal these ids. (b) The text contains `generate_series(1, 200)` and `00000000-0000-4000-8000-000000000002` | Step 7 (counts from `(i − 1) % 5`, `(i − 1) % 3`); EZD-005b T1; `set_updated_at` fires on update only |
| T5 [d] Projects and config, **smoke** | Part d Done when | unit (Vitest) | Snapshot `process.env`, dynamically import `app/playwright.config.ts` and `devices.ts`, assert, then restore `process.env` in `finally` (V3) | Project names exactly `['desktop','ipad-landscape','surface','phone']`. `desktop`: chromium, 1600 × 1000, scale 1, `hasTouch` false, `isMobile` false. `ipad-landscape`: webkit, 1180 × 820, scale 2, true, true. `surface`: chromium, 1440 × 960, scale 2, true, false, no `channel`. `phone`: webkit, 390 × 844, true, true. `workers` = `4`; `retries` = `0`; `timeout` = `60000`; `use.baseURL` = `http://127.0.0.1:3000`. `webServer.url` = `http://127.0.0.1:3000/api/health`. `webServer.env`: `EMAIL_TRANSPORT` `stub`, `EMAIL_FROM` `EZ Draft Test <test@example.test>`, `EMAIL_STUB_DIR` ends with `app/.e2e/email-outbox` (normalized); `SUPABASE_API_GATE_SECRET` non-empty and equal to `process.env.SUPABASE_API_GATE_SECRET` read before the restore; `SUPABASE_SECRET_KEY` = `''`; no `NEXT_PUBLIC_` key holds the secret's value. `use.extraHTTPHeaders` unset at the top level and in every project. `testDir`, `outputDir` and `webServer.cwd` are absolute | Step 1; 04; S17/S18; Q-0053; Q-0088; Q-0114 (4); EZD-007f section 3; EZD-008a `EMAIL_FROM`; Step 2 (60,000 ms, 0 retries); Q-0087; V4 (EZD-007f STATUS security note) |
| T6 [d] Routing regexes, **smoke** | Part d Done when | unit (Vitest) | `projectGrep(device, scope)` against `<project> e2e/x.spec.ts <describe> <title> <tags>`, with scope (a) unset, (b) `(?:EZD-0\d{2}[a-z]?(?![0-9]))\|@smoke`, (c) `(?:EZD-1\d{2}[a-z]?(?![0-9]))\|@smoke` (the `\` only escapes the table pipe) | Untagged `EZD-007 x`: desktop only under (a) and (b), nowhere under (c). `EZD-016a x @smoke @desktop @ipad @surface @phone`: all 4 under (a), (b) and (c). `EZD-026b x @phone`: phone only under (a) and (b), nowhere under (c). `EZD-016a x @desktop @ipad`: desktop and ipad-landscape only. `EZD-014 x @surface`: surface only under (a) and (b), nowhere under (c). `EZD-032 x @desktop @ipad @surface @smoke`: desktop, ipad-landscape and surface under (a), (b) and (c), never phone. `EZD-101 x @ipad`: ipad-landscape only under (c), nowhere under (b) | Step 1; Q-0006; docs/architecture.md Test scope; Q-0088 |
| T7 [a] Email lock | AC-EZD-016a-1 (helper) | unit (Vitest) | (a) Two concurrent `withEmailLock('a@x.test')`, each `fn` waiting 300 ms; (b) emails `a@x.test` and `b@x.test`; (c) `lockPathFor('c@x.test')` file with mtime 61,000 ms in the past; (d) `fn` throws | (a) second start ≥ first end. (b) The runs overlap. (c) Runs at once. (d) The error is re-thrown and the lock file is gone | Step 3 (100 ms, 30,000 ms, 60,000 ms) |
| T8 [a] Real routing | AC-EZD-016a-1 | unit (node:test) | `pnpm --filter @ezdraft/app exec playwright test --list --reporter=json`; child env deletes `NODE_TEST_CONTEXT`, and `EZD_TEST_GREP` is (a) deleted, (b) the T6 (c) value | (a) T1 under all 4 projects; T2 under `desktop`, `ipad-landscape`, `surface` only; T3 under `desktop`, `phone` only; every test whose title path starts `EZD-007` under `desktop` only. (b) T1 under all 4; T2 and T3 not listed; EZD-007f's `@smoke` test (`EZD-007f done when: link from the mail catcher signs in and the user signs out`) under `desktop` only; EZD-007f's P-T2 test (`EZD-007f done when: typing the 6-digit code signs in without opening the link`) not listed. Exit 0, and no web server is started | Step 1; Q-0006; EZD-007f tests; EZD-002 deviation (1) |
| T9 [d] Wiring | Part d Done when | unit (node:test) | Repo files | Root `playwright.config.ts` exists and contains `./app/playwright.config`. Root `devDependencies['@playwright/test']` = the `app/package.json` value = the Dependencies row Version; that row's `Used in` contains `root` and `app`. Root `test:e2e` starts with `pnpm run db:up` and runs the fan-out; app `test:e2e` = `playwright test`. `.gitignore` has `app/.e2e/`. docs has `### Browser tests (EZD-016a)` under `## Tests` naming `desktop`, `ipad-landscape`, `surface`, `phone`, `@ipad`, `@surface`, `@phone`. `node scripts/conventions/check.mjs .` exits 0 | Steps 2, 8; `ci.yml`; check C1; EZD-007f scripts |
| T9b [a] Docs helpers | AC-EZD-016a-1 | unit (node:test) | `docs/architecture.md` | `### Browser tests (EZD-016a)` names `signInAs`, `sessions`, `network` (moved from T9) | Step 8 |
| T12 [a] Gate secret stays out of the browser (untagged, so `desktop` only) | AC-EZD-016a-1 (harness) | browser | Record every request of the context (`allHeaders()`) and the bodies of every `document` and `script` response; `signInAsOwner(page)`; load `/` again; read `outerHTML` | Requests with a header named `x-ezd-api-gate` (any case): **0**. Bodies and HTML containing the value of `process.env.SUPABASE_API_GATE_SECRET`: **0**. `serverDb` select of `app_user` `.eq('id', JOSH_USER_ID)`: `error` null, ids [`JOSH_USER_ID`]. The same through `browserDb`: `error` ≠ null | Q-0087; CLAUDE.md rule 8; 03 rule 1; EZD-005b |
| T10 Gate (orchestrator, per part) | all | gate | Docker running; Chromium and WebKit installed; `node scripts/gate.mjs .claude/worktrees/<part>` | Exit 0: `typecheck`, `lint`, `test`, `build` and `test:e2e` pass in phase 0 + `@smoke` scope | CLAUDE.md rule 12; Q-0006 |
| T11 CI (orchestrator) | AC-EZD-016a-1 | CI | The Phase 0 PR `gate` check | `ci.yml` "Install browsers" runs (not skipped), and `test:e2e` passes | `ci.yml`; Q-0021, Q-0022 |

## 5. Visual checklist
None. No screen is built or changed; the sign-in pages are EZD-007f's.

## 6. Proposed wording
None. The harness errors (`no active membership for <email>`, `Seed missing: run pnpm db:up`, `Gate secret missing: run pnpm db:up`) are developer messages in test output, not app text.

## 7. Security review
security-review: **yes**. Areas: auth, data access, API.
- The secret key and Auth admin calls stay in Node test processes.
- The web server gets `SUPABASE_SECRET_KEY` = `''` (V4).
- The per-run gate secret reaches only the web server env and Node, never a browser (T5, T12).
- Sign-in goes through the real `/auth/confirm` page.
- The seed adds a local-only tenant and users with reserved-domain emails (03 rule 1; CLAUDE.md rule 8; Q-0087).

Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation
**High** (per-part ratings in the split proposal). The work is a new harness pattern across about 22 files, touching auth (admin sign-in, session cookies, gated clients) and the server env that carries the gate secret. test-author and builder: Opus 5.5 (Sonnet 5.5 for part c); security-reviewer Fable 5.1 on the high parts (PROCESS.md section 4).

## 9. Dependencies
- **Row:** EZD-007a–f, EZD-002, EZD-006 (all done).
- **Used directly but not in the row:** EZD-005b (seed, ids), EZD-004a (`db:up`, `local.mjs env`), EZD-004b (Vitest global setup, `/api/health`), EZD-008a (stub transport, outbox reader), EZD-001 (scope grep, C9).
- **Before the build (orchestrator):**
  - Docker running.
  - WebKit installed once: `pnpm --filter @ezdraft/app exec playwright install webkit`. Chromium is already installed.
- **Later users:** EZD-009, 011, 012, 013, 014, 015, 016b, 017, 018, 024, 026b, 027, 032, 033 and 101 (EZD-101 adds one user per preset to the seed).

**Risks:**
- **Pinned-version details the test-author confirms against the installed packages:**
  - whether project `grep` sees tags;
  - whether `--list` starts the web server or global setup (T8 assumes not; if it does, raise a question, don't drop T8);
  - whether `/auth/confirm` accepts a `generateLink` `hashed_token` with `type=email`;
  - the `@supabase/ssr` 0.12.7 cookie name, chunking and `base64-` encoding;
  - whether Vitest can import the config (T5).
- **WebKit on macOS is not Safari on an iPad or iPhone.** The field checks stay the real test (tickets README rule 7). Josh has no iPad (Q-0053). Service workers in WebKit are unverified until Phase 14 (KNOWN-LIMITS 7).
- **Chromium touch emulation is not a real Surface.** EZD-014 asserts `(any-pointer: coarse)` first and raises a question if it fails. This ticket asserts only size, engine and settings.
- **The Surface size is "about" until Josh confirms the model** (Q-0053, Q-0088). The ticket that changes it also changes T1 and T5.
- **No Android project** (R26 R15). It can be added later under Q-0013.
- **A stale server or build.**
  - A server started by hand holds an old gate secret, so stop it before `pnpm test:e2e`; in CI `reuseExistingServer` is off.
  - `next start` needs `pnpm build` first; the gate always builds first.
  - Q-0114 keeps it to one gate at a time.
- **Josh's sign-in links his `auth_user_id`.** Every `test` and `test:e2e` run starts with `db:up`, which resets it, so EZD-005b T1 (`auth_user_id` null) still holds.
- **What `/` shows** (Q-0039 (c)). T1 relies on EZD-007f's `/` showing `sign-out`. Any Phase 1 ticket that replaces `/` keeps a Sign out or updates T1.
- **The root config.** If Josh changes `ci.yml` to `**/playwright.config.*` with a filtered install, the root config and the root devDependency can go, together with a T9 change.
- **Timers and Realtime.** Lock timeouts use Defaults or Playwright's clock (tickets README rule 4). `setOffline` may not close an open Realtime WebSocket, so EZD-018 checks that itself.

## 10. Open questions
None. The split is for the orchestrator to apply (skill plan-ticket, ledger step).

Not re-asked:
- Q-0053, Q-0088 (sizes, Surface project);
- Q-0006, Q-0114 (scope, workers);
- Q-0013 (a), Q-0033 (a), Q-0039 (c), Q-0045 (a), Q-0085 (a), Q-0087 (ii), Q-0197 (b);
- Q-0021, Q-0022 (CI on the phase PR);
- Q-0065 (b) (EZD-016b);
- Q-0002 (answered; no effect).
