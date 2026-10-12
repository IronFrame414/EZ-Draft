# EZD-026b · Message helper: language from the user record

Phase: 0 · Planned by: planner · Date: 2026-10-11 (revised 2026-10-12 for Josh's answer to Q-0029) · Status: planned (Q-0029 answered-josh (a); Q-0002 is deferred and does not block: R17 stands)

## Ticket (copied from the phase file)
Scope: The language comes from the signed-in user's record (read per request); dev test page wired to it. Split from EZD-026 (Q-0028); plan Part B.
Done when: A test page renders in Spanish for a Spanish user.
Depends on: EZD-026a, EZD-005, EZD-006, EZD-007, EZD-016a (`tickets.json`).

What each dependency provides:
- **EZD-026a**: `languageFor`, `catalogFor`, `MessagesProvider`, and the `MessagesSample` component in `app/src/app/dev/messages/` (vault/plans/EZD-026a.md, Steps 1–3).
- **EZD-005**: table `app_user` (03 Tables `user`), column `language` text `not null default 'en'`, `check (language in ('en','es'))` (vault/plans/EZD-005.md Data). A user record therefore always has a language.
- **EZD-006**: the RLS policy under which a signed-in user reads their own `app_user` row ("`app_user` shows self and the tenant's users", vault/plans/EZD-006.md Step 5), and the PostgREST pre-request gate (Q-0087 answered (ii)): every anon/authenticated PostgREST request without the server-only header `x-ezd-api-gate` (value from env `SUPABASE_API_GATE_SECRET`) is refused. Its revised harness `signIn()` returns `serverDb` (with the header) and `browserDb` (without) (Q-0087; orchestrator, plan-review revision).
- **EZD-007**: `getSession(): Promise<Session | null>` with `Session = { authUserId, appUserId, email }`, cached per request, and the recorded rule "the signed-in user's own `app_user` row is `session.appUserId`"; `createSessionClient()`, which under Q-0087 sends the gate header from the server-only env name (vault/plans/EZD-007.md Step 3; Step 10 docs).
- **EZD-016a**: Playwright, the `phone` project and its tag routing (untagged = desktop only; `@phone` = phone), `signInAs`, `adminDb()` and the seed (vault/plans/EZD-016a.md Steps 1, 3, 6, 7).

Also, not in the row:
- **EZD-004**: the server db client in `app/src/server/db/` (vault/plans/EZD-004.md, Step 6). It comes in transitively through EZD-005.
- **EZD-010**: the dev-page convention, a 404 when `VERCEL_ENV === 'production'` (vault/plans/EZD-010.md, Step 5). It comes in transitively through EZD-026a.
- **EZD-000**: the server-only data access rule (the secret key is never used on request paths) and the `### Messages and language (t())` docs section that EZD-026a creates.
- **Q-0029** (answered-josh (a), 2026-10-12): "new users default to English; the inviter or the user switches to Spanish in settings". This matches EZD-005's column default `not null default 'en'`, so EZD-005 does not change and B7's expected value is `en`.
- **Q-0002** (escalated, deferred; does not block): R26 R17 stands as written.
- **EZD-026a is no longer held by questions**: Q-0030 (a) and Q-0086 (a) are answered (decisions.md · Build answers (Josh)).

Spec ref: R26 R17 (`tickets.json` `spec_files: ["spec/decisions.md"]`).

## Sources read
- Decisions:
  - R26 R17: Spanish for the field pack and crew phone screens; the office editor and client link are English.
  - R26 R1: server-only data access.
  - R24 #40: Spanish users always see Spanish.
  - Build answers (Josh): Q-0029 (a) (new users default to English), Q-0030 (a) (builder writes the Spanish; EZD-026a), Q-0047 (a) (EZD-007's sign-in page has its own device-remembered English / Español switch; see Risks). Q-0019 sets Playwright workers to 2.
- Questions: the whole of `vault/questions/QUESTIONS.md`.
  - Q-0028 (split applied) and Q-0029 (answered-josh (a)) belong here.
  - Q-0087 (answered-agent (ii)): server requests carry the gate header; the browser path is refused.
  - Q-0002 is escalated.
  - Q-0021 and commit aad5540: proof comes from the local gate.
- Spec:
  - `03-data-model.md`: Architecture rule 1; Tables `user` ("language (en/es) … Language is per user, not a field-pack toggle"; "Email required").
  - `04-app-shell-and-global-ui.md`: whole file.
  - `11-non-functional-requirements.md`: Performance intro and Budgets; Security and audit ("row-level security on every table").
  - `S15-settings-users-permissions.md`: Save "Applies on the user's next request"; the invite dialog lists language but does not mark it required.
  - `S17-field-pack-phone.md`: "Language from the user's setting".
  - `07-hooks-events-and-integrations.md`: user sync (`user.synced`), which matters for Q-0029.
- Ticket rows: phase-00 (EZD-005, 006, 007, 016a, 026a), phase-01 (EZD-102, 105, 108), phase-15 (EZD-1503).
- Plans: `vault/plans/EZD-000.md`, `EZD-001.md`, `EZD-004.md`, `EZD-005.md` (Data: `app_user.language`), `EZD-006.md` (Step 5 policies; Q-0087 gate), `EZD-007.md` (Session, `createSessionClient`), `EZD-010.md`, `EZD-016a.md` (projects, routing, helpers), `EZD-026a.md`.
- Process: `vault/PROCESS.md`, `vault/KNOWN-LIMITS.md`, `vault/tickets/README.md` (rule 4), `CLAUDE.md` (rules 9, 10, 12), `.claude/hooks/guard-paths.mjs`.
- Mockup: none (`tickets.json` `mockups: []`; dev page only).

## Approach

Choices that no source makes are marked *planner's choice (CLAUDE.md rule 4)*.

### Step 1: `app/src/server/messages/request-language.ts`
`getRequestLanguage(surface): Promise<Language>` is wrapped in React `cache()`, so it reads at most once per request.

- **`office` and `client`** return `'en'` without reading the session or the database.
  - Source: R17 makes them English.
  - Reason: no extra query on office pages (11 Performance).
- **`field` and `dev`** work in three steps:
  1. `const session = await getSession()` (EZD-007 Step 3). The signed-in user's own row is `session.appUserId` (EZD-007 Step 10 docs, "the signed-in user's own `app_user` row is `session.appUserId`").
  2. `createSessionClient().from('app_user').select('language').eq('id', session.appUserId).single()`. The table is `app_user`, not `user` (vault/plans/EZD-005.md Data; phase 0 plan review, finding 24). `createSessionClient()` is the server path: it carries the user's session and the server-only gate header `x-ezd-api-gate` (Q-0087 answered (ii); EZD-007 Step 3), so the request passes EZD-006's pre-request gate, and EZD-006's RLS on `app_user` stays the backstop (EZD-006 Step 5). Never use the secret-key client (EZD-000 Server-only data access; 03 rule 1). A query error or a missing row throws (EZD-000 Errors and logging); it never falls back to a language.
  3. Return `languageFor(surface, row)` from EZD-026a. `row.language` is never null: EZD-005 makes the column `not null default 'en'` (finding 26), and EZD-026a's `languageFor` has no null branch. `language.ts` is not changed by this ticket.
- **No session**: throw `NotSignedInError` (exported). The caller decides what to do.
- **Where the language is not stored**: the user's language is never put in a token claim, a cookie or a cross-request cache. A change therefore applies on the next request (S15 Save).
- **The sign-in page's language cookie is not read here.** EZD-007 remembers the sign-in page's English / Español choice on the device (Q-0047 (a)); that choice is for the signed-out pages only and never changes or replaces `app_user.language` (Q-0029 (a): "the inviter or the user switches to Spanish in settings"). `getRequestLanguage` never reads that cookie.

### Step 2: Test page route `app/src/app/dev/messages/page.tsx` (EZD-010 convention)
- When `process.env.VERCEL_ENV === 'production'`, call `notFound()` (EZD-010 Step 5).
- Otherwise call `getRequestLanguage('dev')`. On `NotSignedInError`, call `notFound()` (*planner's choice*: it is a dev page, so it needs no sign-in redirect). Then render `<MessagesSample user={{ language }} />` from EZD-026a.
- The route is dynamic, because it reads the session.
- The file sits in EZD-026a's lint block for `app/src/app/dev/messages/**` and holds no literal text.

### Step 3: `docs/architecture.md` (same commit; under EZD-026a's `### Messages and language (t())`, no new `##`)
Add these points:
- `getRequestLanguage` is the only way a page resolves the language.
- Office and client cost no query.
- Field reads `app_user.language` for `session.appUserId` once per request through `createSessionClient()` (gated server path, Q-0087).
- There is no claim or cookie.
- A user record always has a language; a new user gets the column default `en` (EZD-005; Q-0029 (a)), and the inviter or the user switches it to Spanish in settings.

Add one line to Machine checks: "language read per request, session client only: `request-language.test.ts` + review".

## Files
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/server/messages/request-language.ts` | New | builder | Language from the user record (Scope) |
| `app/src/app/dev/messages/page.tsx` | New | builder | Test page route (Done when) |
| `docs/architecture.md` | Change | builder | Step 3 |
| `app/src/server/messages/request-language.test.ts` | New | test-author | B5, B6 |
| `app/src/app/dev/messages/page.test.tsx` | New | test-author | B4 |
| `app/e2e/messages.spec.ts` | New | test-author | B1–B3 (Done when), B7. Users come from EZD-006's `createMember` (removed with `cleanup()`); the language is set with EZD-016a's `adminDb()`; sign-in with `signInAs` (vault/plans/EZD-016a.md Steps 3, 6). No new harness file |
| `app/src/lib/messages/language.ts`, `language.test.ts` (EZD-026a's) | Not touched | — | No null branch to replace (EZD-005 `not null default 'en'`; finding 26) |
| `package.json` files, `pnpm-lock.yaml`, `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**` | Not touched | — | No new dependency |

## Data
- No new table, column, migration, policy or `schema_version`.
- Reads `app_user.language` (EZD-005) for the signed-in user's own row (`session.appUserId`, EZD-007) only, through `createSessionClient()` with the gate header (Q-0087) under RLS (EZD-006).
- The column is already required (`not null default 'en'`, EZD-005 Data), and Q-0029 (a) keeps English as the default, so EZD-005 does not change.
- No money fields.

## Tests (written by test-author before any code)
- B1–B3 and B7 are Playwright tests in EZD-016a's `phone` project (workers = 2, Q-0019). Each title carries the tag `@phone`: under EZD-016a's routing an untagged test runs in `desktop` only (vault/plans/EZD-016a.md Step 1; phase 0 plan review, finding 23).
- B4–B6 are Vitest (`node` environment). EZD-007's `getSession` and `createSessionClient` are mocked with `vi.mock`.
- Expected strings come from EZD-026a's dev catalog (vault/plans/EZD-026a.md, Step 2 table).
- Tests never call live services (CLAUDE.md rule 10). Sign-in uses EZD-016a's `signInAs`, which uses the local Auth admin API and sends no email (vault/plans/EZD-016a.md Step 3).

| Test | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- |
| B1 Spanish user sees Spanish (Done when) | browser (phone) | Member made with `createMember` (active, all scope), `app_user.language` set to `'es'` with `adminDb()`, signed in with `signInAs`; open `/dev/messages`. Title `EZD-026b done when: a test page renders in Spanish for a Spanish user @phone` | `[data-testid=field-sample]` has `lang="es"`. Inside it: `sample` = `Mensaje de ejemplo`, `items-1` = `1 elemento`, `items-2` = `2 elementos`. `[data-testid=office-sample]` has `lang="en"` and `sample` = `Sample message` | Ticket Done when; R26 R17; EZD-026a Step 2 table |
| B2 English user sees English | browser (phone) | Same with a `language = 'en'` user. Title ends `@phone` | Both sections `lang="en"`; `sample` = `Sample message`; `items-2` = `2 items` | 03 `user`; EZD-026a Step 2 |
| B3 Change applies on the next request | browser (phone) | B1's user; `adminDb()` sets their `app_user.language` to `en` in the local database; reload with no sign-out. Title ends `@phone` | `field-sample` `sample` = `Sample message`, `lang="en"` | S15 Save ("Applies on the user's next request"); Step 1 (no claim or cookie) |
| B4 Test page hidden in production | unit | `vi.stubEnv('VERCEL_ENV','production')`, call `Page()` | Throws Next's not-found error (matched as in EZD-010 T4); `getRequestLanguage` not called | EZD-010 Step 5 |
| B5 Office and client read nothing | unit | `getRequestLanguage('office')` and `('client')` with no session | Each resolves `'en'`. The session helper and db client are called 0 times | R26 R17; 11 Performance |
| B6 Field reads the user record | unit | `getRequestLanguage('field')`, `getSession` mocked to `{ authUserId: 'a1', appUserId: 'u1', email: 'x@example.com' }`, `createSessionClient` mock whose query returns `{ data: { language: 'es' }, error: null }`; then with `getSession` returning `null`; then with the query returning an error | Resolves `'es'`. `createSessionClient` is called once; the query targets table `app_user`, column `language`, filter `id` = `u1` (the session's `appUserId`, not `authUserId`); the secret-key client is called 0 times. No session → rejects with `NotSignedInError`. Query error → rejects (no fallback language) | 03 rule 1; EZD-000 Server-only data access; EZD-005 Data (table `app_user`); EZD-007 Session (`appUserId`); Q-0087 (server path is the gated session client); finding 24 |
| B7 New user gets the default language | browser (phone) | Member made with `createMember` without setting `language`; signed in with `signInAs`; open `/dev/messages`. Title ends `@phone` | The member's `app_user.language` read with `adminDb()` = `en`. `[data-testid=field-sample]` has `lang="en"` and `sample` = `Sample message` | Q-0029 (a) ("new users default to English"); EZD-005 Data (`language` `not null default 'en'`); EZD-026a Step 2 table |
| Gate | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-026b` | Exit 0: `typecheck`, `lint`, `test`, `build` and `test:e2e` pass. This is the per-ticket proof (CI runs only on the phase PR, aad5540) | CLAUDE.md rule 9; `vault/PROCESS.md` |

## Reviewers needed
- **code-reviewer:** always.
- **calc-auditor:** no.
- **ui-verifier:** no. This is a dev page, not a product screen; B1–B3 check its text in a browser.
- **security-reviewer:** yes. `getRequestLanguage` reads the `app_user` table on the request path. It must use `createSessionClient()` (the gated server path, Q-0087) with RLS and never the secret key, and it may read only the signed-in user's own row, `session.appUserId` (03 rule 1; EZD-000; EZD-006; EZD-007). The dev page's production 404 (B4) and its no-session 404 are also in scope.

## Risks
- **One extra query per field-pack request.** EZD-102 loads membership and permissions once per request; it should fold `language` into that query, and `getRequestLanguage` should then read from its per-request context.
- **Interfaces of other tickets.** This plan relies on EZD-007's `getSession()` / `Session.appUserId` / `createSessionClient()` and EZD-005's `app_user` table, as their plans now state. If the merged code differs from those plans, the builder stops and asks rather than guessing.
- **Gate header on the server path (Q-0087).** If `createSessionClient()` did not send the header, the `app_user` read would be refused by EZD-006's gate and every field page would fail. B1–B3 catch that in the browser; B6 checks that `createSessionClient()` is the only client used.
- **Harness user creation.** B1–B3 and B7 make their own members with EZD-006's `createMember` and set the language with EZD-016a's `adminDb()` (seeded rows are never changed, EZD-016a Step 6 seed rule). Local stack only.
- **Sign-in page language.** A crew member who is not signed in has no user record, so the sign-in screen cannot follow it. Settled by Q-0047 (a): EZD-007's sign-in page has an English / Español switch remembered on the device, separate from `app_user.language` (Step 1).
- **Blocked dependencies.** If EZD-005, 006, 007 or 016a is blocked, this ticket waits, and so does EZD-1503. EZD-011 to EZD-015 depend only on EZD-026a and are not affected.

## Open questions
None open.

Answered, applied above: Q-0029 (answered-josh (a), 2026-10-12): "new users default to English; the inviter or the user switches to Spanish in settings". Applied in Depends on, Step 3, Data and B7 (expected `en`); EZD-005's `not null default 'en'` stands unchanged.

Referenced, not re-asked: Q-0028 (answered-agent; split applied), Q-0030 (a) and Q-0086 (a) (answered-josh; they no longer hold EZD-026a), Q-0047 (a) (EZD-007's sign-in page language switch), Q-0087 (answered-agent (ii); gated server path), Q-0002 (escalated, deferred; does not block, R26 R17 stands), Q-0021.
