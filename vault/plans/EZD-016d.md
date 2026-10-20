# EZD-016d · Test harness: device projects and runner config

- **ACs:** AC-EZD-016d-1 (`vault/spec/acceptance-criteria.md` line 72; generated from Done-when).
- **Complexity:** high (section 8).
- **User-visible result:** nothing on screen. The browser test runner can now run every test at the desktop, iPad landscape, Surface and iPhone sizes Josh uses. Each test runs only on the devices it is tagged for, and CI installs the browsers it needs.
- Phase: 0 · Planned by: planner · Date: 2026-10-20 (part plan after the split, Q-0198) · Status: planned

**Pre-split plan:** `git show 548a74e:vault/plans/EZD-016a.md` (Split proposal "Part EZD-016d", Steps 1, 2, 6 [global setup], 8 [d], section 3, T5, T6, T9; findings V2–V6, V11, V12). This plan keeps its names, test IDs T5, T6 and T9, and every expected value (Q-0198). It adds assertions and tests T14 and T15 so that every refuse rule and the real routing have a test (L-012).
**Short forms:**
- **PS** = that pre-split plan.
- **arch** = docs/architecture.md.
- **7f** = vault/plans/EZD-007f.md section 3 and the merged `app/playwright.config.ts` (b0f5e1a).
- **16a** / **16c** = the part plans' section 3.

## 1. What to build

**Ticket row (phase-00.md line 36).**
- **Scope:** Plan vault/plans/EZD-016a.md Steps 1, 2 and 6 (global setup): desktop, iPad landscape 1180 × 820 (Q-0053), Surface (Q-0088) and phone projects in app/playwright.config.ts (extends EZD-007f's), root playwright.config.ts, device tag routing inside the gate scope, web server env without the secret key; plus Step 8's wiring and docs lines. Split from EZD-016a (Q-0198); plan Part EZD-016d.
- **Done when:** The browser runner has desktop, iPad landscape, Surface and phone projects at their sizes, routes each test by its device tags inside the gate's test scope, and CI's browser install finds a root config.
- **Depends on:** EZD-016c, EZD-007f, EZD-002, EZD-006, EZD-008a.
- **Spec ref:** Build phases and acceptance tests; Import and export · Imports. Imports belongs to EZD-016b; nothing from 08 is built here.

**Harness ticket** (PROCESS.md Special tickets): the test-author writes configs, harness modules and tests (test paths in `.claude/hooks/guard-paths.mjs` line 15); the builder writes only root `package.json`, `pnpm-lock.yaml`, `.gitignore` and arch (L-002 checked).

**Data:** no table, column, migration, RLS policy, `schema_version` or money field. The global setup only reads seed rows.

### Step 1 · Device projects (`app/test-harness/e2e/devices.ts`, test-author)
Device settings were read from the pinned `@playwright/test` 1.64.1 `devices` on 2026-10-20.

| Project | Browser | `use` | Source |
| --- | --- | --- | --- |
| `desktop` (7f's, kept) | Chromium | `{ ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } }`: scale 1, `hasTouch` false, `isMobile` false | 04 Frame "Desktop frame 1600 × 1000"; 7f |
| `ipad-landscape` | WebKit | `{ ...devices['iPad Pro 11 landscape'], viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 }`: `hasTouch` true, `isMobile` true, iPadOS user agent | Q-0053; Q-0088; 02 Platform. Every iPad browser is WebKit. The descriptor is a *planner's choice*: it is the pinned iPad landscape descriptor whose scale is already 2 (PS: scale 2, iPad Air is a 2× screen) |
| `surface` | Chromium | `{ ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, hasTouch: true, isMobile: false }`, no `channel` | Q-0053; Q-0088 (Surface Pro, about 1440 × 960). Edge is Chromium, and `ci.yml` installs only `chromium webkit`. Scale 2 is PS's *planner's choice* |
| `phone` | WebKit | `{ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }`: `hasTouch` true, `isMobile` true. The descriptor's own viewport is 390 × 664, so it is overridden | S17 and S18 Layout "Phone 390x844"; R26 R15; Q-0053 |

- Firefox is not a project, because `ci.yml` does not install it (PS Step 1).
- **Routing** (PS Step 1, *planner's choice*; keeps runs short, Q-0114):
  - A test with none of `@desktop`, `@ipad`, `@surface`, `@phone` runs in `desktop` only.
  - A tagged test runs in exactly its tagged projects.
- **`projectGrep(device, scope?)`** returns `new RegExp('^' + S + body)`. A project `grep` replaces the config-level one, so the gate scope (Q-0006; `scripts/gate.mjs` line 45) has to be repeated inside it:
  - `S` = `(?=[\s\S]*(?:<scope>))` when `scope` is a non-empty string, else empty.
  - `body` for each project:
    - `desktop`: `(?:(?=[\s\S]*@desktop\b)|(?![\s\S]*@(?:ipad|surface|phone)\b))`
    - `ipad-landscape`: `(?=[\s\S]*@ipad\b)`
    - `surface`: `(?=[\s\S]*@surface\b)`
    - `phone`: `(?=[\s\S]*@phone\b)`
- `DEVICE_PROJECTS` lists the four projects in table order.

### Step 2 · Config (`app/playwright.config.ts` extended; root `playwright.config.ts` new; test-author)
1. **Keep from 7f:** the module-load env (four `local.mjs env` names and `EZD_TEST_DB_URL` into `process.env`; PS V2); `findRepoRoot()` with no `import.meta` (Q-0197 (b)); `workers: 4` (Q-0114); the top-level `grep` from `EZD_TEST_GREP`; `use.baseURL` `http://127.0.0.1:3000`; `webServer.command`, `url`, `reuseExistingServer`.
2. **Absolute paths** under `app = path.join(repo, 'app')`:
   - `testDir` `<app>/e2e`
   - `outputDir` `<app>/test-results`
   - `globalSetup` `<app>/test-harness/e2e/global-setup.ts`
   - `webServer.cwd` `<app>`
   - html report folder `<app>/playwright-report`

   Why absolute: so the root re-export works from either folder (PS V5).
3. **`projects`:** one per entry of `DEVICE_PROJECTS`, each `{ name, use, grep: projectGrep(name, process.env.EZD_TEST_GREP) }`.
   - Top-level `use` adds `trace: 'retain-on-failure'` and `screenshot: 'only-on-failure'`.
   - Top level also gets `timeout: 60000` and `retries: 0` (*planner's choices*, PS; a flaky test fails the gate).
   - `fullyParallel` stays at its default.
   - `reporter`: `[['list'], ['html', { open: 'never', outputFolder: <app>/playwright-report }]]`.
4. **`webServer.env`:**
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_API_GATE_SECRET`, taken from `local.mjs env` (Q-0087; EZD-007c).
   - `SUPABASE_SECRET_KEY: ''` and `EZD_TEST_DB_URL: ''`: Playwright passes `process.env` through to the server (PS V4), so leaving a name out is not enough; no `app/src` file reads either (grep 2026-10-20). Blanking `EZD_TEST_DB_URL` is a *planner's choice* for the same reason (7f security note).
   - `EMAIL_TRANSPORT: 'stub'`, `EMAIL_FROM: 'EZ Draft Test <test@example.test>'` and `EMAIL_STUB_DIR: <app>/.e2e/email-outbox` (EZD-008a; arch Environment variables). The folder is PS's *planner's choice*.
5. At load, also set `process.env.EMAIL_STUB_DIR` to the same folder, so specs and the global setup read what the server writes.
6. **Keep the secret out of the browser** (Q-0087; CLAUDE.md rule 8):
   - no `use.extraHTTPHeaders` at the top level or in any project;
   - no `NEXT_PUBLIC_*` value equals the secret.
7. **Root `playwright.config.ts`:** exactly `export { default } from './app/playwright.config';`.
   - Why: `ci.yml` "Install browsers" runs only when `hashFiles('playwright.config.*')` matches at the repo root, and it runs `pnpm exec playwright` from the root (PS V11; Q-0045 (a)).
   - `ci.yml` is Josh's file and is not edited (arch CI).

### Step 3 · Global setup (`app/test-harness/e2e/global-setup.ts`, test-author)
- Default export `globalSetup(): Promise<void>`. It never prints or logs a secret. It runs these checks in order:
  1. `process.env.SUPABASE_API_GATE_SECRET` is empty or unset → throw `Gate secret missing: run pnpm db:up` (PS V3).
  2. `process.env.EMAIL_STUB_DIR` is empty or unset → throw `EMAIL_STUB_DIR missing`.
  3. With `adminDb()` (EZD-006), read:
     - whether the `tenant` row `TENANT_1_ID` exists;
     - whether the `app_user` row `JOSH_USER_ID` exists;
     - whether the `tenant` row `TENANT_2_ID` exists;
     - the exact count of `project` rows with `tenant_id = TENANT_1_ID`.

     If `seedMissing(found)` is true → throw `Seed missing: run pnpm db:up` (PS Step 6; 16c).
  4. `mkdirSync(EMAIL_STUB_DIR, { recursive: true })`, then `clearStubOutboxDir(EMAIL_STUB_DIR)` (EZD-008a).
- Named export `seedMissing(found: SeedFound): boolean` (pure). It returns true when any of the three booleans is false or when `tenant1Projects !== SEED_PROJECT_COUNT` (16c).
- No `import.meta` anywhere (Q-0197 (b)).

### Step 4 · Vitest include (`app/vitest.config.ts`, test-author)
- `include` becomes `['src/**/*.test.{ts,tsx}', 'test-harness/**/*.test.ts']`, so T5, T6 and T14 (and 16a's T7) run in the app project. Nothing else changes.

### Step 5 · Wiring and docs (builder; PS Step 8 [d])
1. Root `package.json`: devDependency `@playwright/test` `1.64.1`, the same as the app's (check C1). Install it with `pnpm add -D -w @playwright/test@1.64.1`. Scripts are unchanged.
2. `pnpm-lock.yaml`: regenerated by that install.
3. `.gitignore`: append `app/.e2e/`. `playwright-report/` and `test-results/` are already ignored at any depth (PS V12).
4. arch, existing `##` headings only:
   - `## Tests`:
     - Add `### Browser tests (EZD-016a)` (16a Step 7 appends to it): Steps 1–3 in short (projects with browser, size, scale, touch, device and descriptor; routing and the per-project scope; setup checks; server env with the two blanked names and the outbox); run commands; WebKit install `pnpm --filter @ezdraft/app exec playwright install webkit`; why the root config exists.
     - Change the 7f bullet's "one project `desktop`" and "EZD-016a extends the config" to point to the new subsection.
     - In `### Test scope (Q-0006)`, add to the runners bullet that each Playwright project's `grep` repeats the scope.
   - `## Folder layout`:
     - add `app/test-harness/e2e/` and the root `playwright.config.ts`;
     - the `playwright.config.ts` line becomes "(EZD-007f; EZD-016d extends it)".
   - `## Environment variables`: in the `EMAIL_TRANSPORT` and `EMAIL_STUB_DIR` rows, `EZD-016a` becomes `EZD-016d`.
   - `## Dependencies`: in the `@playwright/test` row, `Used in` becomes `root, app`.
   - `## Machine checks`: add three rows, each with Built by EZD-016d:
     - "Browser device projects, sizes and tag routing inside the gate scope | `app/test-harness/e2e/harness-config.test.ts` (T5, T6), `scripts/e2e/__tests__/harness-wiring.test.mjs` (T15)";
     - "Browser web server env: gate secret only in the server env and Node; secret key and test DB URL empty; no browser headers | `harness-config.test.ts` (T5; Q-0087)";
     - "CI's browser install finds a root Playwright config | `harness-wiring.test.mjs` (T9)".

### Files
| Path | New / change | By | Why |
| --- | --- | --- | --- |
| `app/test-harness/e2e/devices.ts` | New | test-author | Step 1 |
| `app/playwright.config.ts` | Change (extends 7f's) | test-author | Step 2 |
| `playwright.config.ts` (root) | New | test-author | Step 2.7 |
| `app/test-harness/e2e/global-setup.ts` | New | test-author | Step 3 |
| `app/vitest.config.ts` | Change (`include`) | test-author | Step 4 |
| `app/test-harness/e2e/harness-config.test.ts` | New | test-author | T5, T6, T14 |
| `scripts/e2e/__tests__/harness-wiring.test.mjs` | New | test-author | T9, T15 |
| root `package.json`, `pnpm-lock.yaml`, `.gitignore` | Change | builder | Step 5.1–5.3 |
| `docs/architecture.md` | Change | builder | Step 5.4 |
| Not touched: 7f's specs and `app/test-harness/*.ts`; `app/test-harness/rls/**`; `supabase-env.global-setup.ts`; `seed.sql`, `seed-ids.ts` (16c); `app/package.json`; `app/src/**`; `scripts/gate.mjs`; `ci.yml`; `.env.example` | — | — | Reused as they are; no new app env name |

11 files, 5 tests plus the gate: the size Q-0198 agreed; three files are one-line wiring.

## 2. Sources
- **Spec:**
  - `12-build-phases-and-acceptance-tests.md` (the harness serves the area tests: Edit lock and Offline);
  - `02-product-overview.md` Platform (desktop, iPad, phone);
  - `04-app-shell-and-global-ui.md` line 7 (desktop frame 1600 × 1000);
  - `screens/S17-field-pack-phone.md` line 20 and `S18-client-approval-phone.md` line 15 (Phone 390x844);
  - `11-…` Performance (no budget changes); `03-…` rule 1 (secret key server-only); `08-…` Imports (EZD-016b's).
- **Decisions:**
  - Q-0006 (scope plus smoke);
  - Q-0013 (a) (browser floor);
  - Q-0045 (a) (7f's config is extended here);
  - Q-0053 and Q-0088 (iPad 1180 × 820; Surface about 1440 × 960; a project for each);
  - Q-0087 (ii) (server-only gate header);
  - Q-0114 (workers 4);
  - Q-0197 (b) (no `import.meta` under Playwright);
  - Q-0198 (the split; names, IDs and values kept);
  - R26 R15 (iPhone in the field).
- **Merged code, read 2026-10-20 on develop 65b0135:**
  - `app/playwright.config.ts`, `app/vitest.config.ts`, `app/e2e/sign-in.spec.ts` (titles, `{ tag: '@smoke' }` at line 78), `app/e2e/gate-secret.spec.ts`;
  - `app/test-harness/rls/fixtures.ts` (`adminDb`), `app/test-harness/email-outbox.ts` (`clearStubOutboxDir` removes `.json` files only), `app/test-harness/supabase-env.global-setup.ts`;
  - `app/src/server/email/transport.ts` (the only `app/src` reader of `EMAIL_STUB_DIR`);
  - root and app `package.json`, `.gitignore`, `ci.yml`, `scripts/gate.mjs` lines 45, 70–71, 151, `guard-paths.mjs`, `check.mjs` (C1 checks the version only);
  - `@playwright/test` 1.64.1 `devices` (iPad Pro 11 landscape: 1194 × 834, scale 2, WebKit; iPhone 13: 390 × 664, scale 3, WebKit; Desktop Chrome: scale 1, Chromium).
- **Plans and status:**
  - 7f section 3;
  - 16a and 16c section 3;
  - STATUS.md Notes for EZD-002 (deviation (1) child env deletes `NODE_TEST_CONTEXT`; (2) 180 s per spawning test) and EZD-007f (security minor: secret key passed to `pnpm start`);
  - arch Tests, Test scope, Environment variables, Policy test harness, CI;
  - KNOWN-LIMITS item 7.
- **Mockup:** none (`mockups: []`).
- **Research:** no R-NNN report covers this ticket.

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| project names | `desktop`, `ipad-landscape`, `surface`, `phone` | Step 1 settings; tags `@desktop`, `@ipad`, `@surface`, `@phone`; untagged runs in `desktop` only (16a relies on these) |
| export | `app/test-harness/e2e/devices.ts` `type DeviceName = 'desktop' \| 'ipad-landscape' \| 'surface' \| 'phone'`; `DEVICE_PROJECTS: ReadonlyArray<{ name: DeviceName; use: PlaywrightTestOptions-compatible object }>` | In table order |
| export | same file `projectGrep(device: DeviceName, scope?: string): RegExp` | Step 1; an empty `scope` behaves as unset |
| config | `app/playwright.config.ts` default | Step 2; `projects[i].grep` = `projectGrep(name, process.env.EZD_TEST_GREP)` |
| config | `playwright.config.ts` (root) | `export { default } from './app/playwright.config';` |
| export | `app/test-harness/e2e/global-setup.ts` default `globalSetup(): Promise<void>`; `type SeedFound = { tenant1: boolean; josh: boolean; tenant2: boolean; tenant1Projects: number }`; `seedMissing(found: SeedFound): boolean` | Step 3; errors `Gate secret missing: run pnpm db:up`, `EMAIL_STUB_DIR missing`, `Seed missing: run pnpm db:up` |
| config | `app/vitest.config.ts` `include` | `['src/**/*.test.{ts,tsx}', 'test-harness/**/*.test.ts']` (16a relies on it) |
| env | `webServer.env` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_API_GATE_SECRET` (`local.mjs env`); `SUPABASE_SECRET_KEY` `''`; `EZD_TEST_DB_URL` `''`; `EMAIL_TRANSPORT` `stub`; `EMAIL_FROM` `EZ Draft Test <test@example.test>`; `EMAIL_STUB_DIR` `<app>/.e2e/email-outbox` |
| env | `process.env` in specs and the global setup | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_API_GATE_SECRET`, `EZD_TEST_DB_URL`, `EMAIL_STUB_DIR` (16a's list) |
| docs | arch `### Browser tests (EZD-016a)` under `## Tests` | Created here; 16a Step 7 appends |
| test names | `describe('EZD-016d harness config', …)` in `harness-config.test.ts`; `describe('EZD-016d harness wiring', …)` in `harness-wiring.test.mjs`; T5 title contains `EZD-016d done when:` and `@smoke`; T6 title contains `@smoke` | C9 exempts `test-harness/`, so the reviewer checks the title; arch Tests (the closing test's title) |
| used from dependencies | `adminDb` (EZD-006 `fixtures.ts`); `clearStubOutboxDir` (EZD-008a); `TENANT_1_ID`, `JOSH_USER_ID` (EZD-005b); `TENANT_2_ID`, `SEED_PROJECT_COUNT` (16c); 7f config items listed in Step 2.1; scripts `test:e2e` (7f) | Checked against merged code and 16c section 3, 2026-10-20 |

## 4. Tests
- Vitest tests import config and setup dynamically, snapshot `process.env` and restore it in `finally` (the config overwrites the Vitest gate secret; PS V3).
- Spawning node tests delete `NODE_TEST_CONTEXT` in the child env and allow 180 s each (EZD-002 deviations (1), (2)).

| Test | AC | Type | Input | Expected value | Source |
| --- | --- | --- | --- | --- | --- |
| T5 Projects and config, **smoke**. Title `EZD-016d done when: the browser runner has desktop, iPad landscape, Surface and phone projects at their sizes @smoke` | AC-EZD-016d-1 | unit (Vitest) | Import `app/playwright.config.ts` and `devices.ts` | **Projects:**<br>(a) Names exactly `['desktop','ipad-landscape','surface','phone']`.<br>`desktop`: chromium, 1600 × 1000, scale 1, `hasTouch` false, `isMobile` false.<br>`ipad-landscape`: webkit, 1180 × 820, scale 2, `hasTouch` true, `isMobile` true.<br>`surface`: chromium, 1440 × 960, scale 2, `hasTouch` true, `isMobile` false, no `channel`.<br>`phone`: webkit, 390 × 844, `hasTouch` true, `isMobile` true.<br>(b) Each project's `grep` is a RegExp whose `source` equals `projectGrep(name, <EZD_TEST_GREP at import>).source`.<br>**Runner:**<br>(c) `workers` `4`; `retries` `0`; `timeout` `60000`; `use.baseURL` `http://127.0.0.1:3000`; `webServer.url` `http://127.0.0.1:3000/api/health`.<br>`testDir`, `outputDir`, `globalSetup` and `webServer.cwd` are absolute; `globalSetup` ends with `test-harness/e2e/global-setup.ts`.<br>**Server env:**<br>(d) `webServer.env`: `EMAIL_TRANSPORT` `stub`; `EMAIL_FROM` `EZ Draft Test <test@example.test>`; `EMAIL_STUB_DIR` ends with `app/.e2e/email-outbox` (separators normalized).<br>`SUPABASE_API_GATE_SECRET` is non-empty and equals `process.env.SUPABASE_API_GATE_SECRET` read before the restore.<br>`SUPABASE_SECRET_KEY` `''`; `EZD_TEST_DB_URL` `''`; no `NEXT_PUBLIC_` value equals the secret.<br>(e) `use.extraHTTPHeaders` is unset at the top level and in every project | Step 1; 04 line 7; S17/S18; Q-0053; Q-0088; Q-0114; 7f; EZD-008a `EMAIL_FROM`; Step 2.3 (60,000, 0); Q-0087; PS V4; Step 2.4 |
| T6 Routing regexes, **smoke** | AC-EZD-016d-1 | unit (Vitest) | Match `projectGrep(device, scope)` against `<project> e2e/x.spec.ts <describe> <title> <tags>`, with scope (a) unset, (b) `(?:EZD-0\d{2}[a-z]?(?![0-9]))\|@smoke`, (c) `(?:EZD-1\d{2}[a-z]?(?![0-9]))\|@smoke`. Here `\|` only escapes the table pipe. Also (d) scope `''` | **Untagged and single-tag cases:**<br>Untagged `EZD-007 x`: desktop only under (a) and (b); nowhere under (c).<br>`EZD-026b x @phone`: phone only under (a) and (b); nowhere under (c).<br>`EZD-014 x @surface`: surface only under (a) and (b); nowhere under (c).<br>`EZD-101 x @ipad`: ipad-landscape only under (c); nowhere under (b).<br>**Multi-tag cases:**<br>`EZD-016a x @smoke @desktop @ipad @surface @phone`: all 4 under (a), (b) and (c).<br>`EZD-016a x @desktop @ipad`: desktop and ipad-landscape only.<br>`EZD-032 x @desktop @ipad @surface @smoke`: desktop, ipad-landscape and surface under (a), (b) and (c); never phone.<br>**Empty scope:**<br>(d) gives the same results as (a) | Step 1; Q-0006; `scripts/gate.mjs` line 45; Q-0088 |
| T9 Wiring | AC-EZD-016d-1 | unit (node:test) | Repo files | **Root config:** root `playwright.config.ts` exists and contains `./app/playwright.config`.<br>**Dependency:** root `devDependencies['@playwright/test']` = the `app/package.json` value = the arch Dependencies row Version. That row's `Used in` contains `root` and `app`.<br>**Scripts:** root `test:e2e` starts with `pnpm run db:up` and runs the fan-out; app `test:e2e` = `playwright test`.<br>**Ignore and docs:** `.gitignore` has a line `app/.e2e/`. arch has `### Browser tests (EZD-016a)` under `## Tests`, naming `desktop`, `ipad-landscape`, `surface`, `phone`, `@ipad`, `@surface`, `@phone`.<br>**Check:** `node scripts/conventions/check.mjs .` exits 0 | Steps 2.7, 5; `ci.yml`; check C1; 7f scripts |
| T14 Global setup (added, L-012) | AC-EZD-016d-1 | unit (Vitest, local stack) | (a) `SUPABASE_API_GATE_SECRET` `''`. (a2) Secret `'x'`, `EMAIL_STUB_DIR` deleted. (b) `seedMissing` with `{true,true,true,200}`, then each boolean false in turn, then `tenant1Projects` 199 and 201. (c) Secret `'x'`; `EMAIL_STUB_DIR` = a fresh temp folder holding `old.json` and `keep.txt`. (c2) `EMAIL_STUB_DIR` = a temp path that does not exist | (a) rejects with `Gate secret missing: run pnpm db:up`. (a2) rejects with `EMAIL_STUB_DIR missing`. (b) `false`, then `true` in all 5 other cases. (c) resolves; `old.json` is gone and `keep.txt` is kept. (c2) resolves and the folder exists | Step 3; PS Step 6; 16c (`SEED_PROJECT_COUNT` 200); EZD-008a `clearStubOutboxDir` |
| T15 Real routing on 7f's specs (added, L-012) | AC-EZD-016d-1 | unit (node:test) | `pnpm --filter @ezdraft/app exec playwright test --list --reporter=json`, with `EZD_TEST_GREP` (a) deleted, (b) the T6 (c) value | (a) Every test whose title path starts `EZD-007f` is listed under `desktop` and under no other project, and at least one is listed. (b) `EZD-007f done when: link from the mail catcher signs in and the user signs out` (tag `@smoke`) is listed under `desktop` only. `EZD-007f done when: typing the 6-digit code signs in without opening the link` is not listed. Exit 0 in both runs | Step 1; Q-0006; `app/e2e/sign-in.spec.ts` lines 76–78, 110; this proves a project `grep` sees `{ tag }` tags (16a T8 covers the device tags) |
| T10 Gate (orchestrator) | all | gate | Docker running; Chromium and WebKit installed; `node scripts/gate.mjs .claude/worktrees/EZD-016d` | Exit 0: `typecheck`, `lint`, `test`, `build` and `test:e2e` pass in phase 0 + `@smoke` scope. 7f's 10 browser tests still pass, in `desktop` only | CLAUDE.md rule 12; Q-0006 |

AC-EZD-016d-1, clause by clause:
- the projects at their sizes: T5;
- routes by device tags inside the gate scope: T5 (b), T6, T15;
- CI's browser install finds a root config: T9. The CI run itself is 16a's T11, at the Phase 0 PR.

## 5. Visual checklist
None. No screen is built or changed.

## 6. Proposed wording
None. The three setup errors are developer messages in test output, not app text.

## 7. Security review
security-review: **yes**. Areas: auth, API, data access.
- **Gate secret:** it reaches only the web server env and the Node test process, never a browser (no `extraHTTPHeaders`, no `NEXT_PUBLIC_` copy; T5 (d), (e)).
- **Secret key and test DB URL:** blanked in the server env, because Playwright passes `process.env` through to the server (T5 (d); PS V4; 03 rule 1; CLAUDE.md rule 8).
- **Global setup:** reads seed rows with the admin client in Node only; writes nothing. **Root devDependency:** same pinned version the app already locks.

**Reviewers:**
- code-reviewer: always.
- calc-auditor: no.
- ui-verifier: no.
- security-reviewer: yes.

## 8. Complexity and model recommendation
**High.** It is a new pattern: each project's `grep` composed with the gate scope, plus the server env that carries the gate secret, which every later browser test depends on (Q-0198 rating).
- test-author: Opus 5.5.
- builder: Opus 5.5.
- security-reviewer: Fable 5.1 (PROCESS.md section 4).

## 9. Dependencies
- **Row:** EZD-016c (seed ids and rows the setup checks), EZD-007f (the config extended here), EZD-002 (`ci.yml`, child-env pattern), EZD-006 (`adminDb`), EZD-008a (stub transport, `clearStubOutboxDir`).
- **Used but not in the row:** EZD-005b (`TENANT_1_ID`, `JOSH_USER_ID`), EZD-004a (`local.mjs env`, `db:up`), EZD-004b (Vitest global setup), EZD-001 (scope grep, C9). All are done.
- **Before the build (orchestrator):**
  - Docker running.
  - WebKit installed once: `pnpm --filter @ezdraft/app exec playwright install webkit`. Chromium is already installed (EZD-007f STATUS).
- **Later users:** EZD-016a, then every ticket that depends on EZD-016a (16a section 9).

**Risks** (confirm on the pinned version; if one fails, raise a question rather than drop a test):
- **Pinned-version behaviour:**
  - a project `grep` matches `{ tag }` tags (T15 (b) shows it);
  - `--list` starts neither the web server nor the global setup;
  - Vitest can import the Playwright config (T5).
- **Surface size:** it is "about" 1440 × 960 until Josh confirms the model (Q-0088). A change edits T5 and 16a's T1.
- **Emulation is not hardware:** field checks stay the real test (tickets README rule 7; KNOWN-LIMITS 7).
- **Stale server:** a dev server started by hand holds an old gate secret. The root `test:e2e` runs `db:up` first, and CI turns `reuseExistingServer` off.

## 10. Open questions
None.
