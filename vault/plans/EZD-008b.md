# EZD-008b · Email setup: names, docs, runbook and live check

- **ACs:** AC-EZD-008b-1, AC-EZD-008b-2 (`vault/spec/acceptance-criteria.md` lines 35–36; generated from Done-when, KNOWN-LIMITS last item). AC-EZD-008b-1 ("Live delivery is a field check") is a note, mapped to the field check row in section 4, not to a test.
- **Complexity:** medium (section 8)
- **User-visible result:** Josh has plain steps to turn on real email (Resend, Vercel, Supabase sign-in emails) and a one-command check that a test email reaches his inbox; agents can see every email setting name in the docs.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

Planned from the parent plan `vault/plans/EZD-008.md` ("Split proposal" Part EZD-008b; "Re-validation findings" V1–V12; Approach Step 6 part B, Step 7, Step 9; Tests T10–T13 and the field check), split by Q-0152 (confirmed). Every name other plans cite is kept: the three `.env.example` names (EZD-023b lines 30, 261–262, 472), runbook step 6 = Supabase Auth SMTP in `## Email (EZD-008)` (EZD-007 lines 24, 292, 394, 418), `scripts/email/send-test.mjs` (Q-0153). Changes against the parent are listed at the end of section 2, each with its reason.

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 20):
- **Scope:** Email env names in .env.example and docs/architecture.md; Josh's Resend and Supabase Auth email steps in docs/runbook.md, sending from the verified ezcontractorbinder.com (Q-0035 (a)); live check script scripts/email/send-test.mjs, run by hand and never by the gate (Q-0153). Split from EZD-008 (Q-0152); plan Part EZD-008b.
- **Done when:** Live delivery is a field check. The email variable names are in .env.example and documented, the runbook has Josh's email steps, and the live check script sends nothing without his key and never runs in the gate.
- **Depends on:** EZD-008a, EZD-004b, EZD-004c
- **Spec ref:** External services; R24 #15

Letter note: the decisions file records Josh's Q-0035 and Q-0036 answers as option (b) of the question text ("Josh answered with the batch file's letter (a)"; `vault/spec/decisions/07-hooks-events-and-integrations.md` lines 8–9). The ticket row's "Q-0035 (a)" and this plan's "Q-0035" mean the same answer: send from `ezcontractorbinder.com` for now, and every send shows a Copy link.

### Step 1 · Names file (builder) `.env.example`
Append three lines after `SUPABASE_SECRET_KEY=`, in this order, each with an empty value: `EMAIL_TRANSPORT=`, `EMAIL_FROM=`, `RESEND_API_KEY=` (parent finding V2; CLAUDE.md rule 8: names only). The header comment and the three Supabase lines stay as they are. `EMAIL_STUB_DIR` is not added: it is test-only and never set on Vercel (parent V3).

### Step 2 · Env-name test list (test-author) `scripts/db/__tests__/env.test.mjs`
Append `'EMAIL_TRANSPORT'`, `'EMAIL_FROM'`, `'RESEND_API_KEY'` to `NAMES` after the three existing names, and change T7's title from "exactly the three names" to "exactly the six names". Nothing else in the file changes. This is the change EZD-004b's plan provides for (vault/plans/EZD-004b.md line 84: "Later tickets that add names update T7's list"; parent V2); the code-reviewer records it as an authorized list change. T8 then requires an `### Environment variables` row for each new name (Step 4).

### Step 3 · Live check script (builder) `scripts/email/send-test.mjs`
Node 22 built-ins only, global `fetch`; plain ESM, no TypeScript, so it cannot import the app's TS email module (docs/architecture.md: internal packages are TS source with no build step). Never run by the gate (ticket Scope; Q-0153). Builder write access to `scripts/email/` is the exception Q-0153 (a) adds at build start (precondition, section 9). Exact exports in section 3.
- Sends one message straight to Resend's REST API: `POST https://api.resend.com/emails`, header `Authorization: Bearer <RESEND_API_KEY>`, JSON body with `from`, `to`, `subject`, `text`, `html` (R-003, confirmed on resend.com/docs/api-reference/emails/send-email; success body `{ "id": … }`, status 200 per the API introduction). No `reply_to`: the check is a no-company email (Q-0036 rule for emails no company sends, EZD-008a Step 6 item 3).
- From is `EMAIL_FROM` exactly as set (the production value is `EZ Draft <no-reply@ezcontractorbinder.com>`, Step 4); to is the address after `--to`.
- Message: subject `EZ Draft email check`; one link, `https://ezdraft.ezcontractorbinder.com/` (R24 #1, the app address). Body format mirrors EZD-008a Step 2: `text` = sentence + `\n\n` + URL + `\n`; `html` = `<!doctype html><html lang="en"><body><p>sentence</p><p><a href="URL">Open EZ Draft</a></p><p>URL</p></body></html>`, with the URL escaped by the same five escapes (`&`, `<`, `>`, `"`, `'`). Wording in section 6.
- `main` checks in this order; every return before the send is a failure, so no check can be skipped (lesson L-004):
  1. `env.CI` non-empty after trim → exit 1 (the gate sets `CI: '1'` for every step, scripts/gate.mjs line 69; GitHub Actions sets `CI=true`).
  2. Arguments: no `--to`, an unknown argument, or a `--to` value not matching `/^[^\s@]+@[^\s@]+$/` → exit 1 (*planner's choice*: one address, nothing else).
  3. `RESEND_API_KEY` unset or empty after trim → exit 1 (Done when: "sends nothing without his key"; same rule as EZD-008a Step 4 row 5).
  4. `EMAIL_FROM` unset or empty after trim → exit 1.
  5. `fetchImpl(url, { method, headers, body })`; a throw → exit 1 printing only the error's `name`.
  6. Response not `ok` → exit 1 printing the HTTP status and, if the JSON body has a string `name`, that name (R-003: Resend error names such as `validation_error`; the error body shape is not confirmed, so nothing else from it is printed).
  7. `ok` with a string `id` → print the id, exit 0; `ok` without one → exit 1.
- Output goes only through `io.log` / `io.error` (default: `process.stdout` / `process.stderr`). No output ever contains the key (*security*). `main` returns the exit code and never calls `process.exit`.
- Entry guard: `main` runs only when the file is the process entry (`process.argv[1]` resolved with `pathToFileURL` equals `import.meta.url`), then sets `process.exitCode`. Importing the module sends nothing (same pattern as `scripts/hosting/check-live.mjs`, EZD-003).

### Step 4 · Architecture (builder) `docs/architecture.md`
Under existing `##` headings only (EZD-000 T5 checks the 13 `##` headings; parent Step 9).
1. `## Runtime` → `### Environment variables`: four rows, five cells each (parent V3), first cell the backticked name, second cell `never` (none starts `NEXT_PUBLIC_`, and the module is under `src/server/`, docs/architecture.md Folder layout; same cell as the `SUPABASE_DEV_DB_URL` row):

   | Name | Reaches the browser | Local value | Dev / prod value | Used by |
   | --- | --- | --- | --- | --- |
   | `EMAIL_TRANSPORT` | never | `stub` in unit tests (`app/vitest.config.ts`) and browser tests (EZD-016a's web server); empty in `.env.example`, so a plain `pnpm dev` fails every send with `email_transport_not_set` and still returns the link | Preview `stub` by default, `resend` allowed (Q-0041; EZD-023b enters it); Production `resend` (the stub is refused when `VERCEL_ENV` is `production`) | `app/src/server/email/transport.ts` |
   | `EMAIL_FROM` | never | `EZ Draft Test <test@example.test>` in tests | `EZ Draft <no-reply@ezcontractorbinder.com>` (Q-0035; Q-0036); company emails keep its address and show "<Company> via EZ Draft" | `app/src/server/email/transport.ts`, `send.ts`; `scripts/email/send-test.mjs` |
   | `RESEND_API_KEY` | never | none (tests never send, CLAUDE.md rule 6) | Production: the sending-only key `ezdraft-production` (runbook `## Email (EZD-008)` step 3); Preview only if Josh switches a preview to `resend` (Q-0041) | `app/src/server/email/resend-transport.ts` through `transport.ts`; `scripts/email/send-test.mjs` |
   | `EMAIL_STUB_DIR` | never | browser tests only (EZD-016a); not in `.env.example` | never set on Vercel | `app/src/server/email/transport.ts` |

2. `## Runtime` → new `### Email (EZD-008)` after the Environment variables table and before `## Named tools` (*planner's choice* of the `(EZD-xxx)` suffix, as `### Tenancy tables (EZD-005)`; no plan cites a heading `### Email`, grep 2026-10-19). Bullets, each citing its source (parent Step 9):
   - Resend through `app/src/server/email/` (`sendEmail`, EZD-008a); one recipient per call; server-only, never imported by browser code (11 Budgets, 200 KB; docs/architecture.md Server-only data access).
   - Transport by `EMAIL_TRANSPORT` (`stub` or `resend`), no default; both selectable per environment (Q-0041); the stub is refused in production; unit tests read `readStubOutbox()`, browser tests read `EMAIL_STUB_DIR` (EZD-008a).
   - **Sender (Q-0036):** emails sent for a company pass `company: { name: tenant.name, replyTo: tenant.contact.email ?? null }`; the From shows "<Company> via EZ Draft" and replies go to the company email from company settings (S15a Contact), never to the person who pressed Send. Emails no company sends omit `company` and show `EMAIL_FROM` as is.
   - **Copy link (Q-0035; R24 #15):** every feature that sends an email shows the person who sent it the link from `SendEmailResult.link`, with a Copy link button, whether the send succeeded or failed, because emails land in spam. Each sending ticket's plan names where its Copy link appears and tests it. **Exception: sign-in emails** (EZD-007) never show their link on screen, since anyone who typed an email address would get in; the sign-in page tells the user to check spam and accepts the 6-digit code (Q-0035 orchestrator note; R26 R15). Emails no person sends from a screen (EZD-024's alert emails, Q-0067 (b)) have no sender screen; EZD-024's plan records how it meets the rule.
   - Sign-in emails are sent by Supabase Auth through Resend SMTP (runbook `## Email (EZD-008)` step 6), not through `sendEmail`.
   - Live check `scripts/email/send-test.mjs`, run by Josh by hand only, refused under `CI`, never by the gate (Q-0153).
   - Agents never change Resend, DNS, Vercel or Supabase settings; those steps are in `docs/runbook.md` (CLAUDE.md rule 3; Q-0003: the Resend account is shared with EZ Binder).
3. `## Folder layout` code block: one line after `scripts/db/`: `scripts/email/            send-test.mjs: the live email check Josh runs by hand; never run by the gate (EZD-008b)` (*planner's choice*, same form as the `scripts/db/` line).
4. `## Tests`: one bullet: `Email: unit tests read readStubOutbox() (app/src/server/email/test-harness/stub-transport.ts); browser tests set EMAIL_STUB_DIR and read it with readStubOutboxDir from app/test-harness/email-outbox.ts (EZD-008a).` (parent Step 9; names from vault/plans/EZD-008a.md section 3).
5. `## Machine checks` table, before `### CI` (the four-cell form EZD-004c's T4 reads), two rows:
   - `| — | Unit tests never reach Resend: without an injected client the Resend transport returns email_live_blocked_in_tests | \`app/src/server/email/email.test.ts\` | EZD-008a |`
   - `| — | The live email check stays out of the gate, refuses to run under CI and sends nothing without RESEND_API_KEY | \`scripts/email/__tests__/email-docs.test.mjs\` | EZD-008b |`
6. `## Dependencies`: no edit. The `resend` row (`6.34.1`, `Used in` `app`, `Added by` EZD-000) already matches what EZD-008a installs (parent V7); T10 checks the two agree.

### Step 5 · Runbook (builder) `docs/runbook.md`
Append the section `## Email (EZD-008)` at the end of the file, after `## Tenant 1 setup (EZD-005)` (parent V11; same base-ID heading form as `## Supabase cloud projects (EZD-004)`). Text: section 6 below, copied verbatim once Josh approves it at Stage 2. Step 6 must stay the Supabase Auth SMTP step (EZD-007 lines 292, 394 cite "EZD-008 runbook step 6"). Values: Resend steps and SMTP values from R-003 (host `smtp.resend.com`, username `resend`, password = an API key, port `465` = implicit TLS; permission "Sending access" restricted to one domain; "API keys" page, "Create API Key"); Supabase SMTP page from R-003 (Authentication settings, SMTP; direct link `https://supabase.com/dashboard/project/_/auth/smtp`; values: sender email, sender name, host, port, username, password; Supabase advises turning off link tracking at the SMTP provider). The orchestrator copies steps 1–7 to `vault/tickets/needs-from-josh.md` after merge (parent Step 6 part B).

### Files

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `.env.example` | Change (3 lines appended) | builder | Step 1 |
| `scripts/email/send-test.mjs` | New | builder (needs the Q-0153 (a) exception in `.claude/hooks/guard-paths.mjs`, added by the orchestrator at build start) | Step 3 |
| `docs/architecture.md` | Change | builder | Step 4 |
| `docs/runbook.md` | Change (one section appended) | builder | Step 5 |
| `scripts/email/__tests__/email-docs.test.mjs` | New | test-author | T10–T12 |
| `scripts/db/__tests__/env.test.mjs` | Change (`NAMES` list and T7 title only) | test-author | Step 2 |

Write rules checked against `.claude/hooks/guard-paths.mjs` (lesson L-002): both test-author paths contain a `__tests__/` segment (line 15, `isTest`); `.env.example` is excluded from the `.env` deny (line 20); `docs/*` is outside every builder deny (line 82); `scripts/email/send-test.mjs` is denied by line 82 today and allowed once Q-0153 (a)'s exception exists. Not touched: `app/**` (EZD-008a's), `scripts/gate.mjs`, `.github/workflows/ci.yml`, `.claude/**`, `CLAUDE.md`, `vault/**`. Size: 4 builder + 2 test-author files, 3 new tests plus one list change.

**Data:** none. No tables, columns, migrations, RLS or `schema_version`; no money fields. `RESEND_API_KEY` values exist only in Vercel and in Josh's terminal for the live check, never in the repo or an agent's context (CLAUDE.md rule 8).

## 2. Sources
- `vault/spec/sections/07-hooks-events-and-integrations.md` · External services: "Email provider | Share links, notifications, magic links | —".
- `vault/spec/decisions/13a-rounds-24-25.md` line 43, R24 #15: "Everything sent by email also shows a Copy link button, because email from the new domain may land in spam." R24 #1: the app address `ezdraft.ezcontractorbinder.com`.
- `vault/spec/decisions/07-hooks-events-and-integrations.md`: Q-0035 (send from `ezcontractorbinder.com` for now; Copy link for every send; sign-in exception), Q-0036 (with a change: "<Company> via EZ Draft", replies to the company email), Q-0041 (both transports, per environment, previews on the stub), Q-0067 (b) (alert emails). `02-product-overview.md` decisions: Q-0003 (Resend account shared with EZ Binder), Q-0024 (a) (`ezdraft-dev`, `ezdraft-prod`). `13b-round-26.md` R26 R15 (crew sign-in email carries link and 6-digit code).
- `vault/questions/QUESTIONS.md`: Q-0152 (split, names and values kept), Q-0153 (a) (`scripts/email/` builder exception at build start). Q-0154 (open, EZD-008a sender quoting) does not touch this ticket: the docs do not state the quoting form and the live check sends no company name.
- `vault/spec/sections/11-non-functional-requirements.md`: Performance Budgets (200 KB: the email module stays server-only), Operations (environments: local, dev, production; preview deploys use the dev database), Security and audit (magic links with a Copy link fallback), Running cost (Email $0). `03-data-model.md` rules 1, 11 (server-only; tokens never exposed). `04-app-shell-and-global-ui.md`: no screen changes (`tickets.json` `mockups: []`).
- `vault/spec/non-goals.md`, `glossary.md`: no email or Resend entries (grep 2026-10-19).
- **Research report R-003** (retriever-web, 2026-10-19): Resend send endpoint, body fields and `{ id }` success body; error names; SMTP host, username, password, ports (465 implicit TLS); API key permissions "Full access" / "Sending access" with one-domain restriction; "API keys" page and "Create API Key"; Supabase SMTP settings page and the advice to turn off link tracking. Not confirmed by R-003: Resend's error body shape, the Domains menu label, the add-domain button label and Supabase's field labels, so the plan relies on none of them as exact text (the runbook names values by meaning; T10's `Add Domain` check only guards that the runbook does not tell Josh to add a domain).
- Code read 2026-10-19: `.env.example`, `scripts/db/__tests__/env.test.mjs` (T7, T8, T19), `scripts/db/__tests__/supabase-dev.test.mjs` lines 255–302 (EZD-004c T4: runbook section, `### Environment variables` section ends at the next `##`/`###`, four-cell Machine checks row before `### CI`), `scripts/db/__tests__/tenancy-bootstrap.test.mjs` T15b, `scripts/db/__tests__/rls-config.test.mjs` T20 (b), `docs/runbook.md` (headings lines 3, 19, 35; 7,719 characters), `docs/architecture.md` (heading list), root `package.json` (scripts; `test` runs `node --test "scripts/**/*.test.mjs"`), `scripts/gate.mjs` line 69 (`CI: '1'`), `scripts/hosting/check-live.mjs` (entry-guard pattern), `.claude/hooks/guard-paths.mjs` lines 15, 20, 82.
- Plans: `vault/plans/EZD-008.md` (parent), `EZD-008a.md` (sections 1, 3), `EZD-004b.md` line 84, `EZD-007.md` lines 24, 292, 394, 418, `EZD-023b.md` lines 30, 258, 261–262, 472, `EZD-016a.md` lines 23, 72.

**Changes against the parent plan** (how-to only; no product change): (1) T12's "no test file calls `main(` without a `fetchImpl`" text scan is replaced by checks that need no source scan (every workspace `package.json` script and `scripts/gate.mjs` name neither `send-test` nor `scripts/email`; the file name is outside the root test glob; importing the module sends nothing): a substring scan for `main(` also matches words such as `domain(` and proves nothing about runtime. (2) `main` takes an `io` sink and returns the exit code, so T11 can read the output. (3) T11 adds cases (b2) blank key, (d2) `CI=true`, (f) a refused send, (g) a network error, (h) a bad `--to`. (4) The architecture heading is `### Email (EZD-008)`, and the two Machine checks rows name the parts that built them (`EZD-008a`, `EZD-008b`), like the EZD-004a/EZD-004c rows; parent T10 expected `### Email` and rows ending `EZD-008`. (5) Runbook: the company reply address moves from item 4a to step 7, so step 6 stays the SMTP step other plans cite; the Supabase SMTP key is one per project (`ezdraft-dev-auth`, `ezdraft-prod-auth`), as the API gate secret is per project (runbook EZD-004 step 10); a link-tracking check is added (R-003); the key is entered in the terminal without echo and without shell history. (6) Env table second cell is `never` for all four names (parent: "no" for two of them), matching the `SUPABASE_DEV_DB_URL` row.

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| file | `scripts/email/send-test.mjs` | ESM, Node 22 built-ins only; run as `node scripts/email/send-test.mjs --to <address>` |
| export | `RESEND_URL` | `'https://api.resend.com/emails'` |
| export | `APP_URL` | `'https://ezdraft.ezcontractorbinder.com/'` |
| export | `SUBJECT` | `'EZ Draft email check'` |
| export | `parseArgs` | `(argv: string[]) => { to: string \| null; unknown: string[] }`; accepts `--to <v>` and `--to=<v>`; anything else goes to `unknown` |
| export | `buildTestRequest` | `({ to, from, appUrl, apiKey }: { to: string; from: string; appUrl: string; apiKey: string }) => { url: string; method: 'POST'; headers: { Authorization: string; 'Content-Type': 'application/json' }; body: string }`; `url === RESEND_URL`; `headers.Authorization === 'Bearer ' + apiKey`; `body` = `JSON.stringify` of an object with keys exactly `from`, `to`, `subject`, `text`, `html` (`to` a string, `subject === SUBJECT`); pure |
| export | `main` | `(argv: string[], env: Record<string, string \| undefined>, fetchImpl: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Response>, io?: { log(line: string): void; error(line: string): void }) => Promise<number>`; returns 0 or 1; calls `fetchImpl` at most once and only after checks 1–4 of Step 3 pass; never calls `process.exit`; no line passed to `io` contains `env.RESEND_API_KEY` |
| behavior | entry guard | the module runs `main(process.argv.slice(2), process.env, globalThis.fetch)` and sets `process.exitCode` only when it is the process entry file; importing it calls nothing |
| file | `.env.example` | non-comment lines exactly `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`, `SUPABASE_SECRET_KEY=`, `EMAIL_TRANSPORT=`, `EMAIL_FROM=`, `RESEND_API_KEY=` |
| doc heading | `docs/architecture.md` | `### Email (EZD-008)` under `## Runtime`, after `### Environment variables`, before `## Named tools` |
| doc rows | `docs/architecture.md` `### Environment variables` | rows for `EMAIL_TRANSPORT`, `EMAIL_FROM`, `RESEND_API_KEY`, `EMAIL_STUB_DIR`, five cells, second cell `never` (Step 4 item 1) |
| doc rows | `docs/architecture.md` `## Machine checks` | four cells; third cell (backticks removed) `app/src/server/email/email.test.ts` with fourth `EZD-008a`; `scripts/email/__tests__/email-docs.test.mjs` with fourth `EZD-008b`; both before `### CI` |
| doc heading | `docs/runbook.md` | `## Email (EZD-008)`, exactly once, after `## Tenant 1 setup (EZD-005)`; numbered steps 1–7; step 6 = Supabase Auth SMTP |
| test file | `scripts/email/__tests__/email-docs.test.mjs` | `node:test`; test titles start `EZD-008b` (parent V6; EZD-004b precedent) |

Consumers: EZD-007 (runbook step 6), EZD-023b (the `.env.example` names; its runbook step 4 enters the Vercel values for every `### Environment variables` name), EZD-024 (the Copy link rule in `### Email (EZD-008)`). No routes, components, props or `data-testid`.

## 4. Tests
`scripts/email/__tests__/email-docs.test.mjs`, `node:test` with `node:assert/strict`, Node 22 built-ins only; never filtered by test scope (docs/architecture.md Test scope: root `scripts/**/*.test.mjs` always run). No test makes a network request: `main` always gets a fake `fetchImpl` (CLAUDE.md rule 6). Test data, not product wording: `TO = 'josh@example.test'`, `FROM = 'EZ Draft Test <test@example.test>'`, `KEY = 're_fake'`, `ENV_OK = { RESEND_API_KEY: KEY, EMAIL_FROM: FROM }` (no `CI` key: the test deletes `CI` from the env object it passes, since the gate sets `CI=1` in the test's own process), `ARGV_OK = ['--to', TO]`. The fake `fetchImpl` records its calls and resolves a real `new Response(JSON.stringify(body), { status })`. `io` collects every line. URL extraction as EZD-008a `linksIn`: text URLs by `/https?:\/\/[^\s<>"']+/g`, html `href="…"` values. smoke: no.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T7 (EZD-004b, list change only) `EZD-004b T7 names file holds exactly the six names with empty values` | AC-EZD-008b-2 | unit (node) | `.env.example` | non-comment lines deep-equal the six `NAME=` lines of section 3, in that order | Step 1; EZD-004b plan line 84; parent V2 |
| T10a `EZD-008b done when: email names are in .env.example and documented in docs/architecture.md` | AC-EZD-008b-2 | unit (node) | `.env.example`, `docs/architecture.md`, `app/package.json` | `.env.example` has lines `EMAIL_TRANSPORT=`, `EMAIL_FROM=`, `RESEND_API_KEY=` and no `EMAIL_STUB_DIR`. In the `### Environment variables` section (to the next `##`/`###` line): for each of the four names, one row whose first cell is the backticked name and second cell `never`; the `EMAIL_FROM` row contains `no-reply@ezcontractorbinder.com` and `EZ Draft Test <test@example.test>`; the `EMAIL_TRANSPORT` row contains `stub`, `resend` and `Q-0041`. A line `### Email (EZD-008)` exists, after the `### Environment variables` line, before `## Named tools`, with no `## ` line between `## Runtime` and it; its section (to the next `##`/`###`) contains `app/src/server/email/`, `EMAIL_TRANSPORT`, `scripts/email/send-test.mjs`, `via EZ Draft`, `Copy link`, `Q-0035`, `Q-0036`, `Q-0041`, `EZD-007`, `docs/runbook.md`. The `## Tests` section contains `readStubOutbox`, `EMAIL_STUB_DIR` and `app/test-harness/email-outbox.ts`. Between `## Machine checks` and `### CI`: the two four-cell rows of section 3. The Dependencies row whose first cell is `` `resend` `` has Version cell `` `6.34.1` `` equal (backticks removed) to `app/package.json` `dependencies.resend`, and its `Used in` cell contains `app`. `node scripts/conventions/check.mjs <repo>` exits 0 | Steps 1, 4; parent T10; docs/architecture.md Dependencies; Q-0035; Q-0036; Q-0041; EZD-008a section 3 |
| T10b `EZD-008b done when: the runbook has Josh's email steps` | AC-EZD-008b-2 | unit (node) | `docs/runbook.md` | Exactly one line `## Email (EZD-008)`, after the line `## Tenant 1 setup (EZD-005)`. Its section (to the next `## ` line or end of file) contains `Resend`, `Sending access`, `ezdraft-production`, `EMAIL_TRANSPORT`, `EMAIL_FROM`, `RESEND_API_KEY`, `no-reply@ezcontractorbinder.com`, `send-test.mjs`, `smtp.resend.com`, `465`, `ezdraft-dev-auth`; has lines starting `1. ` to `7. `; the line starting `6. ` contains `smtp.resend.com`; does not contain `Add Domain`; has no match of `/\bre_[A-Za-z0-9]{8,}/` (no key pasted) | Step 5; section 6 text; parent T10; R-003; Q-0035 (no new domain); EZD-007 line 292 (step 6) |
| T11 `EZD-008b done when: the live check sends nothing without its key or under CI` | AC-EZD-008b-2 | unit (node) | `buildTestRequest({ to: TO, from: FROM, appUrl: APP_URL, apiKey: KEY })`; `main(argv, env, fake, io)` with: (a) `argv []`, `ENV_OK`; (b) `ARGV_OK`, `ENV_OK` without `RESEND_API_KEY`; (b2) `RESEND_API_KEY: '   '`; (c) `ENV_OK` without `EMAIL_FROM`; (d) `ENV_OK` + `CI: '1'`; (d2) `ENV_OK` + `CI: 'true'`; (h) `['--to', 'not-an-email']`, `ENV_OK`; (i) `[...ARGV_OK, '--cc', 'x@example.test']`, `ENV_OK` | Request: `url === 'https://api.resend.com/emails'`, `method === 'POST'`, `headers.Authorization === 'Bearer re_fake'`, `headers['Content-Type'] === 'application/json'`; `JSON.parse(body)` has keys exactly `from, to, subject, text, html`, `to === TO`, `from === FROM`, `subject === 'EZ Draft email check'`; text URLs deep-equal `['https://ezdraft.ezcontractorbinder.com/']`; html hrefs deep-equal the same. Each of (a)–(d2), (h), (i): `main` resolves `1` and the fake has 0 calls; no `io` line contains `re_fake` | Done when; Step 3 checks 1–4; R-003 (endpoint, header, fields); R24 #1 (link); Q-0036 (no reply address without a company); scripts/gate.mjs line 69 (`CI: '1'`) |
| T11e–g `EZD-008b live check send results` | AC-EZD-008b-2 | unit (node) | `main(ARGV_OK, ENV_OK, fake, io)` with the fake: (e) `200 { id: 're_9' }`; (f) `422 { name: 'validation_error', message: 'x' }`; (g) rejects `new TypeError('fetch failed')`; (j) `200 {}` | (e) resolves `0`; fake called once with `('https://api.resend.com/emails', init)` where `init.method === 'POST'` and `init.headers.Authorization === 'Bearer re_fake'`; some `io` line contains `re_9`. (f) resolves `1`, some `io` line contains `422` and `validation_error`. (g) resolves `1`, some line contains `TypeError`. (j) resolves `1`. In every case no `io` line contains `re_fake` | Step 3 checks 5–7; R-003 (`{ id }`, error names) |
| T12 `EZD-008b done when: the live check never runs in the gate` | AC-EZD-008b-2 | unit (node) | Root `package.json`, `app/package.json`, every `packages/*/package.json`, `worker/package.json` if present; `scripts/gate.mjs` text; root `test` script; `await import('../send-test.mjs')` with `globalThis.fetch` replaced by a recording function | No value in any `scripts` object contains `send-test` or `scripts/email`; `scripts/gate.mjs` contains neither string and contains `CI: '1'`; the root `test` script contains `"scripts/**/*.test.mjs"` and `path.basename('scripts/email/send-test.mjs')` does not end in `.test.mjs`; after the import the recording fetch has 0 calls and `process.exitCode` equals its value before the import; `globalThis.fetch` is restored afterwards | Ticket Scope ("never by the gate"); Q-0153; Step 3 entry guard; root `package.json` `test`; scripts/gate.mjs line 69 |
| Gate (orchestrator) | AC-EZD-008b-2 | gate | `node scripts/gate.mjs .claude/worktrees/EZD-008b` with Docker running | Exit 0: typecheck, lint, test, build pass (EZD-004b T7, T8 and EZD-004c T4 included, since `node:test` files are never filtered) | CLAUDE.md rule 12 |
| Field check (Josh; does not close the ticket) | AC-EZD-008b-1 | field | Runbook `## Email (EZD-008)` steps 1, 3, 4, 5 | The check email arrives in the inbox, not spam; the sender shows `EZ Draft <no-reply@ezcontractorbinder.com>`; "Show original" shows SPF, DKIM and DMARC `PASS`; its link opens `https://ezdraft.ezcontractorbinder.com/` | Done when ("Live delivery is a field check"); tickets README rule 7; R24 #15 |

The ticket can be `done` when T7, T10a, T10b, T11, T11e–g, T12 and the gate pass; the field check waits only on Josh (tickets README rules 7, 8).

## 5. Visual checklist
None (no screen; `tickets.json` `mockups: []`). EZD-016a is not a dependency.

## 6. Proposed wording
Josh approves or edits at Stage 2. The runbook is Josh's own instructions; the script lines show only in his terminal; the check email goes only to the address he types. Style follows the existing runbook (bold step title, short plain sentences, "Never paste … into chat, a ticket or the repo").

**Runbook section** (`docs/runbook.md`, verbatim):

> ## Email (EZD-008)
>
> Josh's steps in Resend, Vercel and Supabase. For now EZ Draft sends from EZ Binder's verified domain `ezcontractorbinder.com`, in the Resend account the two apps share. Agents never change Resend, DNS, Vercel or Supabase settings. Never paste a key into chat, a ticket or the repo.
>
> 1. **Check the domain.** In Resend, open Domains. `ezcontractorbinder.com` should show Verified. Do not add a domain; EZ Draft uses this one.
> 2. **DNS at Spaceship: no change.** EZ Draft needs no new email records. Never change the existing `ezcontractorbinder.com` records; EZ Binder's email depends on them.
> 3. **Create EZ Draft's key.** In Resend, open API keys, then Create API Key. Name `ezdraft-production`, permission Sending access, domain `ezcontractorbinder.com`. This key can only send email, and you can delete it without touching EZ Binder. Copy it straight into step 4.
> 4. **Vercel values (Production).** In the `ezdraft` project: Settings, Environment Variables, Production. `EMAIL_TRANSPORT` = `resend`. `EMAIL_FROM` = `EZ Draft <no-reply@ezcontractorbinder.com>`. `RESEND_API_KEY` = the key from step 3, marked Sensitive. The Preview values come with the environments setup (EZD-023b): `EMAIL_TRANSPORT` = `stub`, so previews email nobody and the sender gets the link from Copy link. If you later switch a preview to `resend`, it emails the real addresses in the dev data.
> 5. **Live check (field check).** On this PC, open a terminal in the EZ Draft folder and put the values in that terminal only:
>    - Mac: run `read -rs RESEND_API_KEY && export RESEND_API_KEY`, paste the key (nothing shows) and press Return. Then run `export EMAIL_FROM='EZ Draft <no-reply@ezcontractorbinder.com>'`.
>    - Windows PowerShell: run `$env:RESEND_API_KEY = Read-Host 'Resend key'`, paste the key and press Enter. Then run `$env:EMAIL_FROM = 'EZ Draft <no-reply@ezcontractorbinder.com>'`.
>
>    Then run `node scripts/email/send-test.mjs --to <your email address>`. It prints "Sent." and a message id. In your mailbox: the email "EZ Draft email check" is in the inbox, not spam; the sender shows `EZ Draft <no-reply@ezcontractorbinder.com>`; "Show original" shows SPF, DKIM and DMARC all `PASS`; the link opens `https://ezdraft.ezcontractorbinder.com/` (until the first real release it shows "The deployment could not be found"; that is expected). Close the terminal, which clears the key, and tell the orchestrator what you saw.
> 6. **Sign-in emails through Resend (Supabase).** Supabase sends the sign-in emails itself. Do this for `ezdraft-dev` now, and for `ezdraft-prod` when the Before-launch checklist creates it. In Resend, create one more key: name `ezdraft-dev-auth` (or `ezdraft-prod-auth`), permission Sending access, domain `ezcontractorbinder.com`. In the Supabase project open Authentication, SMTP Settings (https://supabase.com/dashboard/project/_/auth/smtp), turn on custom SMTP and enter: sender email `no-reply@ezcontractorbinder.com`, sender name `EZ Draft`, host `smtp.resend.com`, port `465`, username `resend`, password = that key. Save. Sign-in emails show "EZ Draft", not a company name, because no company is known before sign-in. Then in Resend open Domains, `ezcontractorbinder.com`: if link (click) tracking is on, tell the orchestrator before changing anything. Tracking can break sign-in links, and EZ Binder uses the same domain.
> 7. **Company reply address.** Replies to a company's emails go to the company email in Settings, Company, Contact (that screen comes in Phase 1). Until you fill it in, company emails carry no reply address, so a reply goes to `no-reply@ezcontractorbinder.com`.

**Live check script** (`scripts/email/send-test.mjs`):

| Where | Text |
| --- | --- |
| stderr, check 1 (`CI` set) | `send-test.mjs does not run in CI or the gate. Run it by hand (docs/runbook.md, Email, step 5).` |
| stderr, check 2 (no `--to`, unknown argument) | `Usage: node scripts/email/send-test.mjs --to <your email address>` |
| stderr, check 2 (bad `--to`) | `--to must be one email address.` |
| stderr, check 3 | `RESEND_API_KEY is not set in this terminal (docs/runbook.md, Email, step 5).` |
| stderr, check 4 | `EMAIL_FROM is not set in this terminal (docs/runbook.md, Email, step 5).` |
| stderr, check 5 | `Could not reach Resend: <error name>.` |
| stderr, check 6 | `Resend refused the email: HTTP <status> <error name if given>.` |
| stderr, check 7 (no id) | `Resend answered without a message id (HTTP <status>).` |
| stdout, success | `Sent. Resend message id: <id>. Check your inbox (docs/runbook.md, Email, step 5).` |
| check email subject | `EZ Draft email check` (parent Step 7) |
| check email text | `This is a test email from EZ Draft. If it is in your inbox and not in spam, email is set up.` then the link |
| check email link label (html) | `Open EZ Draft` |

## 7. Security review
security-review: **yes**. Areas: API (Josh's Resend key: read from the terminal env only, never printed, never in the repo; the script refuses under `CI` so no automated run can send); account steps in a Resend account shared with EZ Binder (Q-0003): sending-only keys limited to one domain, one per use and per Supabase project, revocable without touching EZ Binder; Supabase Auth SMTP credentials; the link-tracking check on the shared domain; preview live-sending risk stated in the runbook (Q-0041).
Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no (section 5 empty) · security-reviewer yes.

## 8. Complexity and model recommendation
**medium**: no app code, but a script that handles Josh's provider key, an edit to a merged test's list, and docs several merged tests read (EZD-004b T8, EZD-004c T4) (PROCESS.md section 4; matches the split proposal). test-author Sonnet 5.5; builder Sonnet 5.5 (code-reviewer and security-reviewer Opus 5.5).

## 9. Dependencies
- Ticket row: **EZD-008a** (not merged yet; STATUS `questions`, Q-0154 open): `resend` in `app/package.json` (T10a compares it with the Dependencies row), and the names the docs cite (`app/src/server/email/transport.ts`, `send.ts`, `resend-transport.ts`, `email.test.ts`, `test-harness/stub-transport.ts`, `app/test-harness/email-outbox.ts`, `readStubOutbox`, `readStubOutboxDir`, `SendEmailResult.link`, `email_transport_not_set`, `email_live_blocked_in_tests`). If EZD-008a's STATUS note records a deviation in any of these, this plan is re-validated (Stage 3 step 1). **EZD-004b** (`.env.example`, `scripts/db/__tests__/env.test.mjs` T7, T8; the `### Environment variables` table), **EZD-004c** (runbook section `## Supabase cloud projects (EZD-004)`; its T4 reads `### Environment variables` and the four-cell Machine checks rows before `### CI`). EZD-004b and EZD-004c are `done` (STATUS.md).
- Not in the row, used directly (say so): **EZD-005b** (the runbook section `## Tenant 1 setup (EZD-005)` this section follows; `done`), **EZD-003** (`docs/runbook.md` and the Vercel project `ezdraft`; repo work merged dc6e8e6; not a build dependency), **EZD-000** (`docs/architecture.md`, `scripts/conventions/check.mjs`, T5 headings). All transitive through the row except EZD-005b, which is already done; no row change needed.
- Precondition (not a ticket): Q-0153 (a), the orchestrator adds the builder write exception for `scripts/email/` to `.claude/hooks/guard-paths.mjs` before the builder starts (STATUS row EZD-008b).
- Dependents: EZD-007 (runbook step 6), EZD-023b (the names; Preview `EMAIL_TRANSPORT`), EZD-024, EZD-105, EZD-110 (Copy link rule).
- Risks: the shared Resend account means shared quota and sender reputation with EZ Binder (Q-0003; parent Risks); the live check fails until steps 1, 3 and 5 are done, which blocks nothing; T10a fails if EZD-008a's `resend` version differs from the Dependencies row (intended, CLAUDE.md rule 7). No performance budget is touched (no browser code).

## 10. Open questions
None. Settled from sources: script path and builder access (Q-0153 (a)); sending domain, no new domain or DNS change (Q-0035); production From and the no-company sender (Q-0036, parent Step 6 part B item 4); preview default (Q-0041); Resend and Supabase SMTP values (R-003); SMTP port 465, per-project Supabase keys, key entry without echo, and the script's checks are how-to choices (CLAUDE.md rule 3).
