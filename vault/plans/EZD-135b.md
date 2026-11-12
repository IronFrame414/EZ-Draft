# EZD-135b · System status page, cards and alert link

- **ACs:** AC-EZD-135-1, AC-EZD-135-2, AC-EZD-135-3 (`vault/spec/acceptance-criteria.md:1091-1093`; `tickets.json` EZD-135b `acs`)
- **Complexity:** medium (section 8)
- **Areas:** ui, api, testing, security
- **User-visible result:** Settings → System status shows four cards (job failures, webhook failures, last off-site backup, last restore drill), each with an empty state; users without the System status switch see the no-access line; the job-failed and webhook-failed alert emails open this page.
- Phase: 6 · Planned by: planner · Date: 2026-11-11 · Status: planned
- Template: v2
- Plan step: code-bound

## Brief
Part b of the split of EZD-135 (`vault/tickets/phases/phase-01.md:49`; split proposal in `vault/plans/EZD-135.md` history, part a is EZD-135 at `phase-01.md:48`). The page reads only what EZD-135's loaders and route return; it adds no table, migration or function.
| Item | Value |
| --- | --- |
| Plain words | Build the Settings → System status page on EZD-135's data: four cards in the Settings shell (Job failures with 50 per page, Webhook failures, Last off-site backup, Last restore drill with a Failed mark when the drill failed), an empty state on each card, the no-access line for a user without the switch, and change the job-failed and webhook-failed alert emails' button to open `/settings/system-status` |
| ACs | AC-EZD-135-1 (page part: shown with the switch, no-access line without it), AC-EZD-135-2 (page part: a failed test job and a stub backup record appear on the page), AC-EZD-135-3 (empty state per card) |
| Screens | Settings → System status (`/settings/system-status`; section `system_status` in `app/src/lib/settings/sections.ts:112-118`), no board (Q-0665, escalated) |
| Tables | none written; read through EZD-135's loaders: `job`, `error_alert`, and `backup_run` through `public.system_backup_status()` |
| Routes | page `/settings/system-status` (new static page over `app/src/app/(office)/settings/[section]/page.tsx`); data `GET /api/settings/system-status?part=jobs\|webhooks\|backups[&page=n]` (EZD-135) for the next job-failures page |
| Files (estimate) | 8 |
| Tests (estimate) | 22 |
| Split | no |

## 1. What to build
The design is the page half of the whole v2 plan of EZD-135 kept in git at 6a0539ee (plan-checker rounds 1 and 2 settled there), split off by d90b6f94 ("Part EZD-135b"). Every code fact below was re-read at develop a02dc35c (2026-11-11). The builder starts only after EZD-135 has merged (section 9).

### Build steps
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/src/lib/system-status/system-status.ts` | change (created by EZD-135) | add `formatStatusTime(iso: string, timeZone?: string): string` and `formatBytes(n: number): string` (Decided "Times", "Sizes"); every EZD-135 export stays as merged | `app/src/lib/notifications/time.ts` (line 17, `plain`) | `pnpm --filter @ezdraft/app exec vitest run src/lib/system-status/system-status.test.ts` (U1) |
| 2 | `app/src/server/messages/catalogs/en.ts` | change | the 27 `office.system_status.*` keys of section 6, in section 6 order, inserted after line 254 (`office.customers.save_failed`) | `app/src/server/messages/catalogs/en.ts` (the `office.customers.*` block, lines 223-254) | `pnpm --filter @ezdraft/app exec vitest run src/server/messages/catalog.test.ts` (A5) |
| 3 | `app/src/components/settings/system-status/SystemStatus.module.css` | new | the classes of Decided "CSS" | `app/src/components/settings/company/Customers.module.css` | U6; `pnpm --filter @ezdraft/app lint` |
| 4 | `app/src/components/settings/system-status/StatusCards.tsx` | new | `JobFailuresBody`, `WebhookFailuresBody`, `BackupsBody`, `DrillBody` with the section 3 props; one non-exported `Pager` | `app/src/components/settings/company/CustomersPanel.tsx` (`body()` lines 66-189, pager lines 164-186) | U6 |
| 5 | `app/src/components/settings/system-status/SystemStatusPanel.tsx` | new | `'use client'`; `export function SystemStatusPanel()` (no return-type annotation, as `CustomersPanel`; the pinned `@types/react` has no global `JSX`) | `app/src/components/settings/company/CustomersPanel.tsx` (load lines 36-60, `AsyncView` lines 236-247) | U5, B1, B4, B5 |
| 6 | `app/src/app/(office)/settings/system-status/page.tsx` | new | `export default async function Page()` | `app/src/app/(office)/settings/company/page.tsx` (lines 17-29) | U5, B2 |
| 7 | `app/src/server/errors/alert-email.ts` | change | `content()` only: the `job_failed` (line 63) and `webhook_failed` (line 76) links become `statusLink`; the `error` kind (lines 36-50, fallback `openApp` at line 48) unchanged; exports unchanged | `app/src/server/errors/alert-email.ts` (its own `openApp` object, line 35) | U7 |
| 8 | `docs/architecture.md` | change | in `### System status (EZD-135)` (written by EZD-135): the Page bullet right after its first bullet and the Alert link bullet as its last bullet, word for word as Decided "Architecture bullets" | `docs/architecture.md` (`### Customers (EZD-113)`) | code-reviewer reads it against the code (L-039) |

Test-author edits to existing files (not the builder): `app/src/lib/system-status/system-status.test.ts` (created by EZD-135; new top-level describe), `app/src/server/errors/alert-email.test.ts` (new top-level describe), `app/test-harness/money/page-cases.ts`, `app/src/server/db/money-routes.test.ts` (C4), `app/test-harness/e2e/disclaimer-pages.ts`, `app/e2e/settings-shell.spec.ts` (B5 filter). New test files: `app/src/app/(office)/settings/system-status/page.test.tsx`, `app/src/components/settings/system-status/status-cards.test.tsx`, `app/e2e/system-status.spec.ts`. Exact edits: section 3 Shared lists and section 9 Done-when list.

### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Who may open the page | `await connection(); await requireSession(); const ctx = await settingsPermissionContext();` then `ctx === 'failed'` → `return null`; `!can(ctx, 'settings_system_status')` → `<SettingsMain><NoAccess /></SettingsMain>` (HTTP 200, URL unchanged). The nav item is already filtered by the shell; the page does not touch it | AC-EZD-135-1; Q-0225; Q-0211; ARCH Settings shell "Page-ticket contract"; `app/src/app/(office)/settings/company/page.tsx:17-29` |
| Page markup | allowed branch returns exactly `<SettingsMain section="system_status" title="office.settings.section.system_status"><SystemStatusPanel /></SettingsMain>`; no `subtitle`, no `flush`, no `loading.tsx`, no server data load. EZD-237 later adds its card as the next sibling of `<SystemStatusPanel />` in this branch | ARCH Settings shell; Q-0665 (a) (escalated); `vault/plans/EZD-237.md:41` (its Build step 15) |
| Page file header | first lines: `// EZD-135b Build step 6 (vault/plans/EZD-135b.md Decided "Who may open the page"; AC-EZD-135-1; Q-0225): Settings > System status.` then `// This static folder takes precedence over [section].`, nothing else | `app/src/app/(office)/settings/company/page.tsx:1-4` |
| Card order and ids | root `div[data-testid="system-status-panel"]` with class `cards`; four `section` elements in this order with `data-testid` `system-status-jobs`, `system-status-webhooks`, `system-status-backups`, `system-status-drill`; each `section` has class `panel` and holds `div.head` > `h2.title` (the card's title key) and then `div[data-testid="<card id>-body"]` holding that card's `AsyncView` | Q-0664 (list order); Q-0665 (a) ("four cards"); `CustomersPanel.tsx:192,236` |
| Card titles | jobs `office.system_status.jobs_title`, webhooks `webhooks_title`, backups `backup_title`, drill `drill_title`; no icon in any title | section 6; Decided "Icons" |
| Data per card | four `AsyncView`s, each with its own `useCallback` load: jobs `{ part: 'jobs', page: String(jobsPage) }` (deps `[jobsPage]`), webhooks `{ part: 'webhooks', page: String(webhooksPage) }` (deps `[webhooksPage]`), backups and drill each `{ part: 'backups' }` (deps `[]`). Two fetches of `part=backups`, so one failing card never blanks another | ARCH Errors and logging ("a failed load uses the inline error with Retry"); ARCH State components ("`load` is stable (`useCallback`)"); AC-EZD-135-3 |
| Fetch | `fetch('/api/settings/system-status?' + new URLSearchParams(<params of the row above>), { cache: 'no-store', credentials: 'same-origin', signal })`; `res.status !== 200` → `throw new Error('system_status_load_failed')`; else `(await res.json()) as StatusPage<JobFailureRow>` (jobs), `StatusPage<WebhookFailureRow>` (webhooks) or `BackupStatus` (backups, drill); a body that is not JSON rejects in `res.json()` and shows the same inline error | `CustomersPanel.tsx:43-50`; EZD-135 route contract (section 3) |
| Paging state | `const [jobsPage, setJobsPage] = useState(1)` and `const [webhooksPage, setWebhooksPage] = useState(1)`; in each table load, after the parse: `if (data.rows.length === 0 && data.total > 0 && page > 1) set<Part>Page(Math.ceil(data.total / SYSTEM_STATUS_PAGE_SIZE))`, then `return data` | `CustomersPanel.tsx:53-56` |
| Skeleton and error | every card: `skeleton={<SkeletonGroup count={3}><Skeleton height="36px" /></SkeletonGroup>}` and `errorMessage="office.system_status.load_failed"` | `CustomersPanel.tsx:237-245` |
| Body components | `AsyncView` children: jobs `(d) => <JobFailuresBody data={d} onPage={setJobsPage} />`, webhooks `(d) => <WebhookFailuresBody data={d} onPage={setWebhooksPage} />`, backups `(d) => <BackupsBody data={d} />`, drill `(d) => <DrillBody data={d} />`; the panel passes no `timeZone` (the browser's zone) | section 3 props |
| Table bodies | `data.total === 0` → `div.empty[data-testid="system-status-<part>-empty"]` with `jobs_empty` / `webhooks_empty`, no table, no pager. Else `table.table[data-testid="system-status-<part>-table"]`: `thead` one `tr` of `th.th` in column order, `tbody` one `tr.tr` per row with `data-testid` `system-status-job-row` / `system-status-webhook-row` and `td.td` per column; then the `Pager` | `CustomersPanel.tsx:66-189`; AC-EZD-135-3 |
| Columns | jobs, in order: `col_failed` (`formatStatusTime(row.finishedAt, timeZone)`), `col_job` (`row.kind`), `col_error` (`row.error`), `col_tries` (`String(row.attempts)`); webhooks: `col_last_failed` (`formatStatusTime(row.lastSeenAt, timeZone)`), `col_delivery` (`row.title`), `col_event` (`row.ref`), `col_times` (`String(row.occurrences)`) | Q-0664; `error_alert.title` is `<event>: <status>` for deliveries (`app/src/server/errors/report.ts:206-207`), `ref` the event id |
| Codes shown as stored | job `kind` and `error` and webhook `ref` in `span.mono`, as stored; a null `error` or `ref` shows `t('office.system_status.none')` (`—`) in the same `span.mono` | `supabase/migrations/20261022130000_create_job.sql:18` (`error` holds a stable code); `supabase/migrations/20261023120000_create_error_alert.sql:14` (`ref` pattern) |
| Pager | one non-exported `function Pager({ part, data, onPage }: { part: 'jobs' \| 'webhooks'; data: StatusPage<unknown>; onPage: (page: number) => void })` in `StatusCards.tsx`, used by both table bodies; rendered only when `data.total > SYSTEM_STATUS_PAGE_SIZE`; `div.pager[data-testid="system-status-<part>-pager"]` holding, in order, `span[data-testid="system-status-<part>-range"]` with `t('office.system_status.range', { from, to, total: data.total })` where `from = (data.page - 1) * 50 + 1` and `to = Math.min(data.page * 50, data.total)`, then `StateButton compact data-testid="system-status-<part>-prev"` (`disabled={data.page <= 1}`, click → `onPage(data.page - 1)`, text `prev`) and `StateButton compact data-testid="system-status-<part>-next"` (`disabled={to >= data.total}`, click → `onPage(data.page + 1)`, text `next`). `StateButton` already adds `touch.target`; no extra class | `CustomersPanel.tsx:164-186`; `app/src/components/states/StateButton.tsx:18`; 11 Accessibility (44 px); L-060 |
| Backups card | `div.lines` holding two `div.line` rows: `data-testid="system-status-backup-files"` (label `backup_files`) then `system-status-backup-db-dump` (label `backup_db_dump`); each row is `span.lineLabel` (label) then one `span` (value) | 11 Data retention (nightly files, weekly dump; line 88); ARCH Off-site backups (cron `0 7 * * *` files, `0 8 * * 0` dump) |
| Backup value text | row `null` → `not_recorded`; `location === null` → `backup_line` `{ time, size }`; else `backup_line_location` `{ time, size, location }`, with `time = formatStatusTime(row.finishedAt, timeZone)` and `size = formatBytes(row.bytesCopied)` | section 6; Q-0664 (finished at, bytes copied, location) |
| Drill card | `data.restoreDrill === null` → `div.empty[data-testid="system-status-drill-empty"]` with `drill_empty`. Else `div.line[data-testid="system-status-drill-line"]`: the text `formatStatusTime(finishedAt, timeZone)` when `location === null`, else `drill_line_location` `{ time, location }`; no bytes (drills record 0); when `status === 'failed'`, after the text one space then `span.failed[data-testid="system-status-drill-failed"]` with `drill_failed` | Q-0672 (b); Q-0664 |
| Times | `formatStatusTime(iso, timeZone?)` returns `new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))` with every U+202F and U+00A0 replaced by U+0020. The inputs are `timestamptz` text from EZD-135's route, so an unparseable string is not a reachable input (no guard). The server render shows skeletons only (`AsyncView` starts pending), so no time text differs at hydration | `app/src/lib/notifications/time.ts:17` (`plain`); run on Node 22.23.3, 2026-11-11 (U1) |
| Sizes | `formatBytes(n)` for a non-negative safe integer (EZD-135's zod parse guarantees it): `n < 1000` → `` `${n} B` ``; else `v = n / 1000`, unit index 0 of `['KB', 'MB', 'GB', 'TB']`; while index < 3 and `Number(v.toFixed(1)) >= 1000`: `v = v / 1000`, index + 1; return `` `${v.toFixed(1)} ${unit}` `` | KB = 1,000 bytes: 11 Budgets "Projects and Settings 200 KB" (`vault/spec/sections/11-non-functional-requirements.md:21`) held as 200,000 bytes (Q-0579); run on Node 22.23.3, 2026-11-11 (U1) |
| Email link | in `content()` after line 35: `const statusLink = { url: appOrigin(env) + SYSTEM_STATUS_PATH, label: t('office.alert.open_app') };`; `link: openApp` at lines 63 and 76 become `link: statusLink`; `SYSTEM_STATUS_PATH` imported from `../../lib/system-status/system-status`; the label stays `office.alert.open_app` ("Open EZ Draft", en.ts line 449) | Q-0069 (a) ("job and webhook emails opening EZ Draft until the System status page (EZD-135) exists"); `app/src/lib/settings/sections.ts:113` (slug) |
| Message namespace | `office.system_status.*`, English only (no `es.ts` entry); never under `office.settings.*` (EZD-103a U7 pins exactly 30 `office.settings.` keys) | R17 (`vault/spec/decisions/13b-round-26.md:27`); ARCH Messages and language ("`client` and `office` are English only"); `app/src/components/settings/settings-messages.test.ts:5` |
| CSS | `.cards` (display flex, flex-direction column, gap 16px). Copied with their values from `Customers.module.css`: `.panel`, `.head`, `.title` (lines 4-26), `.table`, `.th`, `.th:first-child`, `.td`, `.td:first-child`, the `@media (hover: hover) { .tr:hover .td }` block (lines 79-123, without `.th:last-child` and `.td:last-child`), `.pager` (lines 190-197), `.empty` (lines 199-207). New: `.th:last-child { padding: 8px 0 }` and `.td:last-child { padding: 9px 0 }` (no 24px width, the last column holds text); `.mono` (font-family `var(--ez-font-mono)`, font-size 12px, color `var(--ez-slate-700)`); `.lines` (display flex, flex-direction column, gap 8px); `.line` (display flex, gap 12px, font-size 13px, color `var(--ez-ink)`); `.lineLabel` (width 140px, flex none, no padding or border, so the outer box is 140px; color `var(--ez-slate-500)`); `.failed` (color `var(--ez-red)`, font-weight 500). Colors only from those tokens (`app/src/styles/tokens.css:6-8,17`; `--ez-font-mono` from `app/src/styles/fonts.ts:19`); sizes in px (L-013) | `Customers.module.css`; card gap 16px = the S15a Company page's section gap (`app/src/components/settings/company/CompanyForm.module.css:24`); Q-0665 (a) |
| Icons | none on the page (no sprite entry, no icon list edit) | Q-0665 (a); L-021 |
| Imports | `connection` from `next/server`; `requireSession` from `app/src/server/auth/session.ts`; `can` from `app/src/server/permissions`; `settingsPermissionContext` from `app/src/server/settings/shell-data.ts`; `SettingsMain` from `app/src/components/settings/SettingsShell.tsx`; `NoAccess` from `app/src/components/states/NoAccess.tsx`; `AsyncView` from `app/src/components/states/AsyncView.tsx`; `Skeleton`, `SkeletonGroup` from `app/src/components/states/Skeleton.tsx`; `StateButton` from `app/src/components/states/StateButton.tsx`; `useT` from `app/src/lib/messages`; `SYSTEM_STATUS_PAGE_SIZE`, `SYSTEM_STATUS_PATH`, `formatStatusTime`, `formatBytes` and the types from `app/src/lib/system-status/system-status.ts` | grep at develop a02dc35c (L-043); EZD-135 contract |
| Client boundary | `SystemStatusPanel.tsx` starts with `'use client'`; `StatusCards.tsx` has no `'use client'` line (imported only by the panel) and calls `useT()`; neither imports anything under `app/src/server/` (keys are passed to `t()` as literals; no `MessageKey` import) | ARCH Messages and language ("client components call `useT()`"); ARCH Server-only data access |
| File headers | each new non-test file starts with `// EZD-135b Build step <n> (vault/plans/EZD-135b.md): <one line saying what the file is>`; the CSS file with the same text in `/* */` | `app/src/components/settings/company/CustomersPanel.tsx:3-6` |
| Architecture bullets | Page bullet: "**Page.** `/settings/system-status` (`app/src/app/(office)/settings/system-status/page.tsx`, EZD-135b) needs `settings_system_status`; without it `NoAccess` in place. `SystemStatusPanel` shows four cards (job failures, webhook failures, last off-site backup, last restore drill), each loading on its own." Alert link bullet: "**Alert link.** Job and webhook alert emails link to `/settings/system-status` (`SYSTEM_STATUS_PATH`, `app/src/lib/system-status/system-status.ts`; EZD-135b); error alerts are unchanged." Nothing else in the subsection changes | 6a0539ee Build step 12 bullets (2) and (4); split proposal d90b6f94 ("the page bullet and alert-link bullet") |

### Do not touch
`app/src/lib/settings/sections.ts`, `app/src/components/settings/SettingsShell.tsx`, `app/src/server/settings/settings-root.tsx`, `app/src/server/settings/shell-data.ts`, `app/src/app/(office)/settings/[section]/page.tsx`, `layout.tsx` and `page.tsx` of `app/src/app/(office)/settings/`; everything EZD-135 merged (its migration, `database.types.ts`, `app/src/server/system-status/system-status.ts`, `app/src/app/api/settings/system-status/route.ts`, and every existing export of `app/src/lib/system-status/system-status.ts`); `app/test-harness/money/route-cases.ts` and `app/test-harness/rls/gate.ts` (EZD-135's edits); `record_error_alert`, `reportJobFailure`, `reportWebhookFailure`; `scripts/backup/**`; the `office.alert.*` and `office.settings.*` texts; `appOrigin()`; `app/src/server/errors/alert-recipients.ts`; `app/src/components/settings/company/**`.

### Behaviour per role
| AC | Role | Behaviour |
| --- | --- | --- |
| AC-EZD-135-1 | owner | Owner preset holds `settings_system_status` (Q-0225): nav item shown; page shows the four cards |
| AC-EZD-135-1 | office | Designer preset lacks the switch (Q-0225 "Owner only"): no nav item; `/settings/system-status` shows `NoAccess` in place, HTTP 200, URL unchanged; no card and no data fetch |
| AC-EZD-135-1 | field | Foreman and Crew presets lack it: as office |
| AC-EZD-135-1 | view-only | any member without the switch: as office |
| AC-EZD-135-1 | no permission | not signed in: `requireSession()` sends to sign-in before any render |
| AC-EZD-135-2 | owner | cards show what EZD-135's route returns: the tenant's failed jobs of the last 30 days (50 per page, newest first), its webhook failures, the last succeeded files copy and database dump, the last finished drill (Failed mark when failed) |
| AC-EZD-135-2 | office, field, view-only, no permission | cannot open (rows above); a member given the switch sees what the route returns for them (RLS scope, EZD-135) |
| AC-EZD-135-3 | owner | nothing recorded: each card shows its empty text, never an error; a failed fetch shows `InlineError` with Retry on that card only |
| AC-EZD-135-3 | office, field, view-only, no permission | cannot open |

### Failure and edge cases
| Function or action | Case | Behaviour | What the user sees |
| --- | --- | --- | --- |
| card load | route answers non-200 (400, 401, 403, 500) | `throw new Error('system_status_load_failed')` | that card's `InlineError` "Couldn't load this section." with Retry; the other cards unaffected |
| card load | 200 with a body that is not JSON | `res.json()` rejects | as above |
| card load | offline (`fetch` rejects) | rejects | as above; Retry reloads that card |
| Retry | pressed twice fast | `useAsync` aborts the earlier run and keeps the newest (EZD-015a, `use-async.ts:17-26`) | skeleton, then data or the error |
| Next / Previous | double click before the reload | each click calls `onPage(data.page ± 1)` from the reply on screen, so both clicks ask for the same page | the next page once |
| Next / Previous | page change while the previous fetch is pending | the new `load` identity aborts the old fetch (`use-async.ts:18`) | the newest page |
| table load | `rows: []`, `total > 0`, `page > 1` (rows went away) | sets that card's page to `Math.ceil(total / 50)`, which loads once more | the last page |
| table load | `total === 0` | empty text | `No failed jobs in the last 30 days` / `No webhook failures` |
| table body | `total` exactly 50 | no pager (shown only when `total > 50`) | 50 rows, no pager |
| table body | null `error` or `ref` | `—` | a dash |
| `BackupsBody` | `files` or `dbDump` null | `not_recorded` | `Not recorded yet` |
| `DrillBody` | `restoreDrill` null | `drill_empty` | `No restore drill recorded yet` |
| `DrillBody` | `status` `failed` | Failed mark after the line | `… Failed` in red |
| `formatBytes` | 999, 1000, 999949, 999950, 1500000000000 | `999 B`, `1.0 KB`, `999.9 KB`, `1.0 MB` (rounding moves up a unit), `1.5 TB` (TB is the last unit) | as text |
| page | `settingsPermissionContext()` answers `'failed'` | `return null` | the layout's `SettingsLoadError` |
| alert email | `job_failed` or `webhook_failed` | link `appOrigin(env) + '/settings/system-status'` | "Open EZ Draft" opening System status |
| alert email | `error` kind | unchanged (Sentry link or bare origin) | as before |

### Database columns
None: no table or column change (the page reads through EZD-135's route).

### RLS policies
None: no policy change.

### Grants
None: no database object added or changed.

### Database functions
None: no function added; `public.system_backup_status()` is EZD-135's.

### Migrations
None: no migration.

Ticket row (`vault/tickets/phases/phase-01.md:49`): Scope "Settings → System status page with four cards (job failures, webhook failures, last off-site backup, last restore drill) on EZD-135's route; job and webhook alert emails link to the page. Layout follows Q-0665 (a), escalated to Josh." · Done when "A failed test job and a stub backup record appear on the page. Without the switch the page shows the no-access line in place; with nothing recorded each card shows its empty state; job and webhook alert emails link to /settings/system-status." · Depends on EZD-135 · Spec ref "Non-functional · Operations; R26 R12".

## 2. Sources
- `vault/spec/sections/11-non-functional-requirements.md`: Operations (line 64, the System status page shows recent job failures, webhook failures, the last backup and the last restore drill; line 63, a failed job or failed webhook emails the owner), Data retention (line 88, nightly files, weekly dump, restore drill), Budgets (line 21, "Projects and Settings 200 KB"), Accessibility (44 px).
- Decisions: Q-0664 "System status content" (`vault/spec/decisions/03-data-model.md:30`: the four lists, 30 days, newest first, 50 per page; finished at, bytes copied, location); Q-0211 (`vault/spec/decisions/11-non-functional-requirements.md:17`, Owner only; render usage comes with EZD-1117 per Q-0664, not this ticket); Q-0225 (`vault/spec/decisions/10-permissions-and-settings.md:37`); R12 (`vault/spec/decisions/13b-round-26.md:22`, a System status page); R17 (`13b-round-26.md:27`, office screens English only, so no `es.ts` strings).
- Questions: Q-0225 (`vault/questions/QUESTIONS-answered.md:376`, the System status switch, Owner only); Q-0672 (b) (`QUESTIONS-answered.md:388`, answered-agent: last drill of any status, the card marks Failed); Q-0069 (a) (`QUESTIONS-answered.md:377`: job and webhook alert emails open EZ Draft until the System status page exists; this ticket points them at it); Q-0579 (200 KB budget held as 200,000 bytes); Q-0665 (`vault/questions/QUESTIONS.md:12`, escalated to Josh, design: no board for this page; recommended (a) four cards in the Settings shell, which this plan follows).
- ACs: `vault/spec/acceptance-criteria.md:1091-1093`. Ticket row: `vault/tickets/phases/phase-01.md:49`. Non-goals: none touched. Glossary: no System status row.
- Mockup: none for this page (Q-0665); the Settings shell frame follows S15 (`vault/mockups/S15Settings.png`), already built by EZD-103a; the card parts follow the S15a Customers block as built in `app/src/components/settings/company/Customers.module.css` (`vault/mockups/S15aCompany.png`).
- Design of record: the whole v2 plan of EZD-135 at git 6a0539ee (`vault/plans/EZD-135.md` sections 1, 3, 4, 5, 6 page rows) and the split proposal at d90b6f94 ("Part EZD-135b", "Contract between the parts"); review finding `vault/plans/review-phase-06.md:7` (size, the reason for the split).
- Merged code the page rests on (develop a02dc35c, 2026-11-11): `app/src/lib/settings/sections.ts:112-118,122,126`; `app/src/app/(office)/settings/[section]/page.tsx:14-30`; `app/src/app/(office)/settings/company/page.tsx:17-29` and its test `page.test.tsx:12-31,42-66`; `app/src/components/settings/SettingsShell.tsx:177-206`; `app/src/server/settings/shell-data.ts:46`; `app/src/components/settings/company/CustomersPanel.tsx`, `Customers.module.css`; `app/src/components/states/` (`AsyncView.tsx`, `Skeleton.tsx:10,23`, `StateButton.tsx:18`, `InlineError.tsx:19`, `NoAccess.tsx`, `use-async.ts`); `app/src/server/errors/alert-email.ts:35,48,63,76`, `app-origin.ts:4-8`; `app/src/server/email/body.ts:18,22-23`, `transport.ts:36`; `app/src/server/messages/catalogs/en.ts:44,50,169,179,254,449`.
- Dependencies: EZD-135 (row; planned, not built). Its contract here comes from the "Contract between the parts" of d90b6f94 and section 3 of 6a0539ee, because EZD-135's current plan is still a brief with no section 3 (`node vault/tools/outline.mjs vault/plans/EZD-135.md --section 3` prints the whole brief).
- No research report covers this ticket; no retriever was dispatched.

Architecture: Settings shell (EZD-103a); Company settings (EZD-112); Customers (EZD-113); State components (EZD-015); Messages and language (t()); Design tokens, fonts and icons; Error reporting (EZD-024); Off-site backups and restore (EZD-025); Background jobs (EZD-009); Permission enforcement (EZD-102); Server-only data access and can(); Browser tests (EZD-016a)

## 3. Interface contract
| Kind (file / export / signature / route / props / data-testid) | Name or path | Details |
| --- | --- | --- |
| file (exists) | `app/src/lib/system-status/system-status.ts` | created by EZD-135 (section 9); browser-safe |
| export (exists) | `SYSTEM_STATUS_PAGE_SIZE` from `app/src/lib/system-status/system-status.ts` | `50` (EZD-135) |
| export (exists) | `SYSTEM_STATUS_PATH` from `app/src/lib/system-status/system-status.ts` | `'/settings/system-status'` (EZD-135) |
| export (exists) | `StatusPage` from `app/src/lib/system-status/system-status.ts` | type `{ rows: T[]; total: number; page: number; pageSize: number }` (EZD-135) |
| export (exists) | `JobFailureRow` from `app/src/lib/system-status/system-status.ts` | type `{ id: string; kind: string; error: string \| null; attempts: number; finishedAt: string }` (EZD-135) |
| export (exists) | `WebhookFailureRow` from `app/src/lib/system-status/system-status.ts` | type `{ id: string; title: string; ref: string \| null; occurrences: number; lastSeenAt: string }` (EZD-135) |
| export (exists) | `BackupRow` from `app/src/lib/system-status/system-status.ts` | type `{ finishedAt: string; bytesCopied: number; location: string \| null }` (EZD-135) |
| export (exists) | `DrillRow` from `app/src/lib/system-status/system-status.ts` | type `BackupRow & { status: 'succeeded' \| 'failed' }` (EZD-135) |
| export (exists) | `BackupStatus` from `app/src/lib/system-status/system-status.ts` | type `{ files: BackupRow \| null; dbDump: BackupRow \| null; restoreDrill: DrillRow \| null }` (EZD-135) |
| route | `GET /api/settings/system-status?part=<jobs\|webhooks\|backups>[&page=<1..999999>]` | EZD-135: 200 `StatusPage<JobFailureRow>` / `StatusPage<WebhookFailureRow>` / `BackupStatus`; 400 `invalid_input`; 401 `not_signed_in`; 403 `permission_denied` / `error.not_authorized`; 500 `db_unavailable`; all `Cache-Control: no-store` |
| signature (new) | `formatStatusTime(iso: string, timeZone?: string): string` from `app/src/lib/system-status/system-status.ts` | Decided "Times" |
| signature (new) | `formatBytes(n: number): string` from `app/src/lib/system-status/system-status.ts` | Decided "Sizes" |
| file (new) | `app/src/components/settings/system-status/StatusCards.tsx` | no `'use client'` line; calls `useT()` |
| export (new) | `JobFailuresBody` from `app/src/components/settings/system-status/StatusCards.tsx` | props `{ data: StatusPage<JobFailureRow>; onPage: (page: number) => void; timeZone?: string }` |
| export (new) | `WebhookFailuresBody` from `app/src/components/settings/system-status/StatusCards.tsx` | props `{ data: StatusPage<WebhookFailureRow>; onPage: (page: number) => void; timeZone?: string }` |
| export (new) | `BackupsBody` from `app/src/components/settings/system-status/StatusCards.tsx` | props `{ data: BackupStatus; timeZone?: string }` |
| export (new) | `DrillBody` from `app/src/components/settings/system-status/StatusCards.tsx` | props `{ data: BackupStatus; timeZone?: string }` |
| file (new) | `app/src/components/settings/system-status/SystemStatusPanel.tsx` | `'use client'` |
| export (new) | `SystemStatusPanel` from `app/src/components/settings/system-status/SystemStatusPanel.tsx` | no props; EZD-237 adds its card after this component, not inside it |
| file (new) | `app/src/components/settings/system-status/SystemStatus.module.css` | Decided "CSS" |
| file (new) | `app/src/app/(office)/settings/system-status/page.tsx` | default export `Page()`; takes precedence over `[section]` for slug `system-status` |
| data-testid | panel | `system-status-panel` (root of `SystemStatusPanel`) |
| data-testid | jobs | `system-status-jobs` (section), `system-status-jobs-body`, `system-status-jobs-empty`, `system-status-jobs-table`, `tr[data-testid="system-status-job-row"]` with cells in order time, kind, error, attempts |
| data-testid | webhooks | `system-status-webhooks`, `system-status-webhooks-body`, `system-status-webhooks-empty`, `system-status-webhooks-table`, `tr[data-testid="system-status-webhook-row"]` with cells time, title, ref, occurrences |
| data-testid | backups | `system-status-backups`, `system-status-backups-body`, lines `system-status-backup-files`, `system-status-backup-db-dump` (each `span.lineLabel` then one value `span`) |
| data-testid | drill | `system-status-drill`, `system-status-drill-body`, then `system-status-drill-empty` or `system-status-drill-line`; inside the line `system-status-drill-failed` only when `status` is `failed` |
| data-testid | pager | `system-status-jobs-pager`, `system-status-jobs-range`, `system-status-jobs-prev`, `system-status-jobs-next`; `system-status-webhooks-pager`, `system-status-webhooks-range`, `system-status-webhooks-prev`, `system-status-webhooks-next` |
| data-testid (exists) | `no-access` | `app/src/components/states/NoAccess.tsx` |
| export (exists) | `SettingsMain` from `app/src/components/settings/SettingsShell.tsx` | `({ section?, title?, subtitle?, flush?, children? })`, line 177; renders `main[data-settings-page]` and `h1` (lines 192, 195) |
| export (exists) | `settingsPermissionContext` from `app/src/server/settings/shell-data.ts` | `(): Promise<PermissionContext \| null \| 'failed'>`, line 46 |
| export (exists) | `NoAccess` from `app/src/components/states/NoAccess.tsx` | `common.no_access` |
| export (exists) | `AsyncView` from `app/src/components/states/AsyncView.tsx` | `{ load, skeleton, errorMessage, errorParams?, children }` |
| export (exists) | `sendOwnerAlert` from `app/src/server/errors/alert-email.ts` | U7 calls it; signature unchanged |
| export (exists) | `readStubOutbox` from `app/src/server/email/test-harness/stub-transport.ts` | U7 |
| export (exists) | `clearStubOutbox` from `app/src/server/email/test-harness/stub-transport.ts` | U7 `beforeEach` |
| export (exists) | `settingsHref` from `app/src/lib/settings/sections.ts` | `(s: SettingsSection): string` |
| export (exists) | `setPermissions` from `app/test-harness/permissions/grant.ts` | B1-B5 (via `app/test-harness/e2e/test.ts:81`) |
| export (exists) | `expectTouchTargets` from `app/test-harness/touch-targets.ts` | `(page, root): Promise<number>`, line 8; B3 (via `app/test-harness/e2e/test.ts:59`) |
| export (exists) | `harnessSql` from `app/test-harness/rls/fixtures.ts` | B1, B3, B5 (via `app/test-harness/e2e/test.ts:65`) |

### Connections
| Kind | Name | File:line | What changes |
| --- | --- | --- | --- |
| route | `[section]` served `/settings/system-status` | `app/src/app/(office)/settings/[section]/page.tsx:14-30` | the static page takes precedence; file unchanged |
| consumer | `system_status` section entry (slug, label, switch) | `app/src/lib/settings/sections.ts:112-118` | read only |
| caller | `SettingsMain` | `app/src/components/settings/SettingsShell.tsx:177-206` | used by the new page |
| caller | `settingsPermissionContext` | `app/src/server/settings/shell-data.ts:46` | used by the new page |
| caller | alert email links | `app/src/server/errors/alert-email.ts:35`, `app/src/server/errors/alert-email.ts:63`, `app/src/server/errors/alert-email.ts:76` | job and webhook links get `SYSTEM_STATUS_PATH` |
| caller | alert senders that reach `content()` | `app/src/server/errors/report.ts:206-207` | unchanged; their emails now carry the new link |
| other test | EZD-151 alert subject | `app/src/server/errors/alert-email.test.ts:11-40` | unchanged; U7 added in its own describe |
| other test | EZD-103a B5 unbuilt pages | `app/e2e/settings-shell.spec.ts:143-153` | line 146 filter becomes `([id]) => id !== 'company' && id !== 'system_status'`; line 145 comment becomes `// EZD-112 and EZD-135b built these pages, so they are no longer unbuilt, title-only pages.` |
| other test | EZD-103a U10 section page | `app/src/app/(office)/settings/settings-pages.test.tsx:83-105` | unchanged (renders `[section]` with `title-block`) |
| shared list | money-page-count (C4 page count) | `app/src/server/db/money-routes.test.ts:147-151` | `toBe(35)` → `toBe(36)`, title "there are 36 pages" |
| shared list | money-page-paths (EXPECTED_PATHS) | `app/e2e/money-pages.spec.ts:26` | stays 43 (one `[section]` path becomes the new page's path) |
| shared list | disclaimer-pages (DISCLAIMER_PAGES) | `app/src/components/disclaimer/disclaimer-pages.test.ts:29`, `app/test-harness/e2e/disclaimer-pages.ts:64-69` | one row after line 69 |
| shared list | secret-key-clients (createJobsDbClient users) | `app/src/server/db/test-only-functions.test.ts:207` | unchanged: `alert-email.ts` and `en.ts` gain no `createJobsDbClient` |
| other test | money page cases | `app/test-harness/money/page-cases.ts:3`, `app/test-harness/money/page-cases.ts:18`, `app/test-harness/money/page-cases.ts:64` | new page file after line 18; line 64 filter `s.slug !== 'company' && s.slug !== 'system-status'`; line 3 `` `company` (which has its own page) `` becomes `` `company` and `system-status` (which have their own pages) `` |
| other screen | EZD-237 benchmark card | `vault/plans/EZD-237.md:41` | later adds its card after `SystemStatusPanel` in this page |

### Shared lists
| List | Test file | Current value | New value |
| --- | --- | --- | --- |
| page files (C4) | `app/src/server/db/money-routes.test.ts` | 35 (a02dc35c) | 36; if develop has another page file at merge, develop's count + 1 |
| `PAGE_FILES` and `[section]` filter | `app/test-harness/money/page-cases.ts` | `[section]` minus `company` | plus `'app/src/app/(office)/settings/system-status/page.tsx'` after line 18; filter `s.slug !== 'company' && s.slug !== 'system-status'` |
| money page paths | `app/e2e/money-pages.spec.ts` | 43 | 43 |
| `DISCLAIMER_PAGES` | `app/src/components/disclaimer/disclaimer-pages.test.ts` | settings rows: index, company, `[section]`, dev | plus `{ file: 'src/app/(office)/settings/system-status/page.tsx', path: '/settings/system-status', signedIn: true, placement: 'bar' }` after line 69 |
| B5 unbuilt sections | `app/e2e/settings-shell.spec.ts` | 9 | 8 |
| `office.settings.` keys | `app/src/components/settings/settings-messages.test.ts` | 30 | 30 (unchanged) |

### Data flow
| Hop | From | To | Exact name |
| --- | --- | --- | --- |
| 1 | page (server) | permission check | `settingsPermissionContext()` then `can(ctx, 'settings_system_status')` |
| 2 | `SystemStatusPanel` card load | route (EZD-135) | `fetch('/api/settings/system-status?part=jobs&page=<n>')`, `part=webhooks&page=<n>`, `part=backups` (twice) |
| 3 | route | browser | JSON `StatusPage<JobFailureRow>`, `StatusPage<WebhookFailureRow>` or `BackupStatus` |
| 4 | `AsyncView` | card body | `JobFailuresBody`, `WebhookFailuresBody`, `BackupsBody`, `DrillBody` |
| 5 | job runner or webhook final failure | email | `sendOwnerAlert` → `content()` → link `appOrigin(env) + SYSTEM_STATUS_PATH` |

### Live site
None: no database object changes; main's code calls nothing this ticket alters.

## 4. Tests
All titles inside a top-level `describe('EZD-135b …')` (ARCH Test scope; phase 6 grep holds `135b`). Browser specs run in the `desktop` project unless tagged.

### Tests
| Test | AC | Type | Input | Expected value | Source of the expected value | Fixture | Wait method | Gate scope | CI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U1 format (`app/src/lib/system-status/system-status.test.ts`, new top-level `describe('EZD-135b system status formatting')`) | 2 | unit | (a) `formatStatusTime('2026-11-09T15:04:00Z', 'UTC')`, `formatStatusTime('2026-11-09T15:04:00Z', 'America/New_York')`, `formatStatusTime('2026-01-02T00:30:00Z', 'UTC')`; (b) `formatBytes` of 0, 999, 1000, 999949, 999950, 1234567, 7340032, 123456789, 5000000000, 1500000000000 | (a) `'Nov 9, 2026, 3:04 PM'`, `'Nov 9, 2026, 10:04 AM'`, `'Jan 2, 2026, 12:30 AM'` (each compared with `toBe`, so a kept U+202F fails); (b) `'0 B'`, `'999 B'`, `'1.0 KB'`, `'999.9 KB'`, `'1.0 MB'`, `'1.2 MB'`, `'7.3 MB'`, `'123.5 MB'`, `'5.0 GB'`, `'1.5 TB'`. Rejects: 1,024-byte units (7340032 would be `7.0 MB`), a missing round-up (999950 would be `1000.0 KB`) | Decided "Times", "Sizes"; run on Node 22.23.3, 2026-11-11 | none | none | phase | yes |
| U5 page (`app/src/app/(office)/settings/system-status/page.test.tsx`) | 1 | unit | mocks as `app/src/app/(office)/settings/company/page.test.tsx:12-26` (`next/navigation` with `usePathname: () => '/settings/system-status'`, `next/server`, `server/auth/session`, `server/auth/supabase-server`, `server/settings/shell-data` with `settingsPermissionContext: vi.fn()`), without the `loadCompany` and `reportError` mocks; `ctxWith` as that file lines 46-52; render `renderToStaticMarkup(<MessagesProvider language="en" messages={catalogFor('office', 'en')}>{(await Page()) as ReactElement}</MessagesProvider>)`; (a) ctx keys `['settings_company']`; (b) ctx keys all `PERMISSION_KEYS`; (c) ctx `'failed'` | (a) contains `data-testid="no-access"`, no `data-settings-page=` attribute with a value, no `system-status-panel`; (b) contains `data-settings-page="system_status"`, `<h1` with text `System status`, `system-status-panel`, the four card ids in Decided order (index of each in the markup strictly increasing), each `system-status-<card>-body` holding one `data-skeleton-group=""`, and 12 `data-skeleton=""` in all (4 × 3); (c) `Page()` resolves `null`. Rejects: a page that loads data on the server (no skeletons) | Decided "Who may open the page", "Page markup", "Card order and ids", "Skeleton and error"; en.ts line 169; `Skeleton.tsx:10,23` | copied mocks | none | phase | yes |
| U6 cards (`app/src/components/settings/system-status/status-cards.test.tsx`) | 2, 3 | unit | `renderToStaticMarkup` inside `MessagesProvider` (`catalogFor('office','en')`), `timeZone: 'UTC'`, `onPage: vi.fn()`. (a) empty: jobs and webhooks `{rows:[],total:0,page:1,pageSize:50}`, backups `{files:null,dbDump:null,restoreDrill:null}` for both `BackupsBody` and `DrillBody`; (b) filled: job `{id:'j1',kind:'test',error:'ezd135_probe_failed',attempts:5,finishedAt:'2026-11-09T15:04:00Z'}` total 1; webhook `{id:'w1',title:'project.updated: 500',ref:'evt-1',occurrences:3,lastSeenAt:'2026-11-09T15:04:00Z'}` total 1; files `{finishedAt:'2026-11-09T07:30:00Z',bytesCopied:7340032,location:null}`, dbDump `{finishedAt:'2026-11-08T08:10:00Z',bytesCopied:123456789,location:'db/20261108T080000Z'}`; (c) the job with `error:null` and the webhook with `ref:null`; (d) drill `{finishedAt:'2026-11-01T12:00:00Z',bytesCopied:0,location:'db/20261025T080000Z',status:'succeeded'}`; (e) drill `{finishedAt:'2026-11-01T12:00:00Z',bytesCopied:0,location:null,status:'failed'}`; (f) jobs total 51 page 1, 50 rows, each the (b) job with only `id` changed to `j<k>` for k = 1..50; (g) webhooks total 51 page 2, one row: the (b) webhook with `id` `w51`; (h) jobs total 50 page 1, the 50 rows of (f) | (a) texts `No failed jobs in the last 30 days`, `No webhook failures`, both backup values `Not recorded yet`, `No restore drill recorded yet`; no `<table`, no `-pager`; (b) job row cells `Nov 9, 2026, 3:04 PM`, `test`, `ezd135_probe_failed`, `5`; webhook row cells `Nov 9, 2026, 3:04 PM`, `project.updated: 500`, `evt-1`, `3`; files value `Nov 9, 2026, 7:30 AM · 7.3 MB`; dump value `Nov 8, 2026, 8:10 AM · 123.5 MB · db/20261108T080000Z`; (c) error and ref cells `—`; (d) drill line text `Nov 1, 2026, 12:00 PM · from db/20261025T080000Z`, no `system-status-drill-failed`; (e) drill line text `Nov 1, 2026, 12:00 PM Failed`, `system-status-drill-failed` text `Failed`; (f) range `1–50 of 51`, prev has `disabled`, next has no `disabled`, `onPage` not called; (g) range `51–51 of 51`, prev no `disabled`, next `disabled`; (h) no `system-status-jobs-pager`. Rejects: a pager at exactly 50 rows; a Failed mark on a succeeded drill | section 6; Decided "Times", "Sizes", "Pager", "Drill card", "Codes shown as stored", "Table bodies" | inline props | none | phase | yes |
| U7 email link (`app/src/server/errors/alert-email.test.ts`, new top-level `describe('EZD-135b alert email link')`) | 2 | unit | `sendOwnerAlert` as the EZD-151 case (lines 16-32) with `tenantId: null`, `db: { rpc: vi.fn() } as unknown as SupabaseClient<Database>`, env `{ EMAIL_TRANSPORT:'stub', EMAIL_FROM:'EZ Draft Test <test@example.test>', ALERT_EMAIL_TO:'owner@example.test' }`: (a) kind `job_failed`, params `{kind:'job_failed',jobKind:'test',attempts:5,error:'ezd135_probe_failed',jobId:'j1',projectId:null}`; (b) kind `webhook_failed`, params `{kind:'webhook_failed',event:'project.updated',eventId:'evt-1',attempts:5,status:500}`; (c) as (a) with env plus `VERCEL_ENV:'preview'`, `VERCEL_URL:'ezdraft-git-t.vercel.app'` (the stub transport refuses `VERCEL_ENV=production`, `transport.ts:36`); (d) kind `error`, params `{kind:'error',title:'Error: x',source:'function',location:'/api/x',eventId:null}`, no `SENTRY_ISSUES_URL` | each: result `'emailed'`, `readStubOutbox()` length 1; (a), (b): `[0].text` ends with `http://localhost:3000/settings/system-status\n`, `[0].html` contains `<a href="http://localhost:3000/settings/system-status">Open EZ Draft</a>` and `<p>http://localhost:3000/settings/system-status</p>`; (c) text ends with `https://ezdraft-git-t.vercel.app/settings/system-status\n`, html contains `<a href="https://ezdraft-git-t.vercel.app/settings/system-status">`; (d) text ends with `http://localhost:3000\n`, html contains `<a href="http://localhost:3000">Open EZ Draft</a>`. Rejects: a job or webhook link left at the bare origin (old value `http://localhost:3000`) | `app-origin.ts:4-8`; `body.ts:18,22-23`; Decided "Email link"; en.ts line 449 | `clearStubOutbox()` in `beforeEach` | none | phase | yes |
| B1 done when (`app/e2e/system-status.spec.ts`) | 2, 3 | browser | own tenant, member `scope: 'all'` with `setPermissions(t, m.membershipId, ['settings_system_status'])`, `signInAs(m.email)`; one job (Fixture calls) with `i = 1`; one `backup_run` row through `harnessSql()`: ``insert into public.backup_run (kind, scope, status, started_at, finished_at, bytes_copied) values ('files', 'all', 'succeeded', now() + interval '1 day', now() + interval '1 day', 7340032) returning id``, deleted by that id in the test's own `finally`; `page.goto('/settings/system-status')` | response status 200; `system-status-job-row` count 1, containing `test` and `ezd135_probe_failed`; `system-status-webhooks-empty` text `No webhook failures`; `system-status-backup-files` contains `7.3 MB`; `system-status-drill-body` holds `system-status-drill-empty` or `system-status-drill-line` (the drill row is system-wide, so either). Rejects: a page that leaves out the job or the backup row | AC-EZD-135-2 Done when; Decided "Sizes"; the future time makes the row the latest (backup tests write `files` only under `buckets:` scopes, `scripts/backup/__tests__/files.test.mjs:48`) | `createTenant`, `createMember`, `setPermissions`, `harnessSql` from `app/test-harness/e2e/test.ts` | web-first `expect` auto-wait | phase | yes |
| B2 no switch (same file) | 1 | browser | own tenant, member with `['settings_libraries']`, `signInAs`; `page.goto('/settings/system-status')`; then `page.request.get('/api/settings/system-status?part=jobs')` | page response 200; URL path stays `/settings/system-status`; `[data-settings-nav="system_status"]` count 0; `[data-testid="no-access"]` visible; `system-status-panel` count 0; API status 403, body `{error:{code:'permission_denied',message_key:'error.not_authorized'}}`. Rejects: the panel shown without the switch | AC-EZD-135-1; Q-0225; EZD-135 route contract | as B1 | auto-wait | phase | yes |
| B3 paging and touch targets (same file, tag `@ipad`) | 2 | browser | own tenant, member `scope: 'all'` with `['settings_system_status']`; 51 jobs (Fixture calls, i = 1..51); `goto('/settings/system-status')`; wait for `system-status-jobs-range` text `1–50 of 51`; `await page.getByTestId('system-status-jobs-next').evaluate((el) => el.scrollIntoView({ block: 'center' }))` (as `app/e2e/states.spec.ts:182`); `expectTouchTargets(page, page.getByTestId('system-status-jobs-pager'))`; click `system-status-jobs-next` | 50 `system-status-job-row`, range `1–50 of 51`; `expectTouchTargets` returns 2; after Next: 1 row, range `51–51 of 51`, Next `disabled`. Rejects: a Next that does not advance. The webhooks pager is the same `Pager` (checked in U6 (g)), so no spec writes 51 `error_alert` rows | Q-0664 (50 per page); Decided "Pager"; `app/test-harness/touch-targets.ts:8`; L-060 | as B1 | web-first `expect` after the click | phase (`ipad-landscape` project) | yes |
| B4 one card fails, the others show (same file) | 3 | browser | as B1 with one job and no backup row; before `goto`: `page.route((u) => u.pathname === '/api/settings/system-status' && u.searchParams.get('part') === 'webhooks', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"db_unavailable","message_key":"error.db_unavailable"}}' }))`; `goto`; then `await page.unrouteAll()` and click the `Retry` button inside `system-status-webhooks-body` | `system-status-webhooks-body` holds `[role="alert"]` with text `Couldn't load this section.` and a `Retry` button, while `system-status-job-row` count is 1; after Retry: `system-status-webhooks-empty` visible and no `[role="alert"]` in that body. Rejects: one shared load for all cards (jobs would fail too) | Decided "Data per card", "Skeleton and error"; ARCH Errors and logging; `InlineError.tsx:19`; en.ts line 44 (`Retry`) | as B1 | web-first `expect` | phase | yes |
| B5 past the end goes to the last page (same file) | 2 | browser | as B3 (51 jobs); before `goto`: `page.route((u) => u.pathname === '/api/settings/system-status' && u.searchParams.get('part') === 'jobs' && u.searchParams.get('page') === '2', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"rows":[],"total":50,"page":2,"pageSize":50}' }))`; `goto`; wait for range `1–50 of 51`; `const again = page.waitForRequest((q) => q.url().includes('part=jobs') && q.url().includes('page=1'))` set before clicking `system-status-jobs-next`; click; `await again` | the panel requests `page=1` again after the click and shows 50 rows with range `1–50 of 51` (the real page 1, total 51). Rejects: no clamp (an empty table) | Decided "Paging state"; `CustomersPanel.tsx:53-56` | as B1 | `waitForRequest` promise held before the click (L-062) | phase | yes |
| E1 test-author edits | 1, 2 | inventory | the section 3 Shared lists rows | C4 `toBe(36)` with title "there are 36 pages"; disclaimer U6, money-pages W1/W2 and settings-shell B5 pass. Rejects: a skipped inventory row (C4 stays 35 and fails) | section 3 Shared lists | none | none | phase and smoke | yes |

Exact titles (L-034). One `it` or `test` per lettered case; 22 new tests in 3 new files and 2 changed files, nothing else:
- `app/src/lib/system-status/system-status.test.ts`, `describe('EZD-135b system status formatting')`: `U1 (a) times in UTC and New York`, `U1 (b) sizes in decimal units` (2).
- `app/src/app/(office)/settings/system-status/page.test.tsx`, `describe('EZD-135b system status page')`: `U5 (a) without the switch, NoAccess in place`, `U5 (b) with the switch, four cards loading`, `U5 (c) context load failed returns null` (3).
- `app/src/components/settings/system-status/status-cards.test.tsx`, `describe('EZD-135b status cards')`: `U6 (a) empty`, `U6 (b) filled`, `U6 (c) null codes show a dash`, `U6 (d) drill succeeded`, `U6 (e) drill failed`, `U6 (f) jobs pager at 51`, `U6 (g) webhooks pager on the last page`, `U6 (h) no pager at 50` (8).
- `app/src/server/errors/alert-email.test.ts`, `describe('EZD-135b alert email link')`: `U7 (a) job alert opens System status`, `U7 (b) webhook alert opens System status`, `U7 (c) preview address`, `U7 (d) error alert unchanged` (4).
- `app/e2e/system-status.spec.ts`, `test.describe('EZD-135b system status page')`: `EZD-135b done when: a failed test job and a stub backup record appear on the page` (B1), `B2 without the switch: no nav item, NoAccess, API 403`, `B3 paging and touch targets @ipad`, `B4 one card fails, the others show`, `B5 past the end goes to the last page` (5).
- E1 adds no test; it changes C4's title and value only.
- Proof commands: each Vitest file with `pnpm --filter @ezdraft/app exec vitest run <file relative to app/>`; the browser file with `node /Users/josh/Projects/ezdraft/scripts/ui-run.mjs EZD-135b e2e/system-status.spec.ts` (ARCH Browser tests "Inside a launcher unit"); everything in the gate `node /Users/josh/Projects/ezdraft/scripts/gate.mjs .claude/worktrees/EZD-135b`.

Fixture calls, written in full (B rows). The job insert (with `i` bound as a parameter: `prepare … $1 * interval '1 minute'` resolves), the `backup_run` insert and the delete by id were run once on the pinned local stack (`supabase_db_ezdraft`, inside `begin … rollback`) on 2026-11-11 by the planner (L-009):
- Member: `const tenant = await createTenant(); const m = await createMember({ tenantId: tenant, scope: 'all' }); await setPermissions(tenant, m.membershipId, ['settings_system_status']);` (B2 passes `['settings_libraries']`); then `await signInAs(m.email)`. Each test makes its own tenant.
- Jobs: one `harnessSql()` statement per job ``insert into public.job (tenant_id, kind, status, attempts, max_attempts, error, finished_at) values (${tenant}::uuid, 'test', 'failed', 5, 5, 'ezd135_probe_failed', now() - ${i} * interval '1 minute') returning id`` (columns and checks: `supabase/migrations/20261022130000_create_job.sql:5-30`); a tenant-level job (null `project_id`) is visible to an all-projects member (`job_select`, same file lines 45-50).
- Teardown: `test.afterAll(async () => { try { await cleanup(); } finally { await closeHarness(); } })` as `app/e2e/customers.spec.ts:51-55` (tenant rows, jobs included, go with the tenant); B1's `backup_run` row (system-wide, no tenant) is deleted by its id in B1's own `finally` before that: ``delete from public.backup_run where id = ${id}::uuid``.
- Touch-target note (L-060): the webhooks pager is the same `Pager` as the jobs pager whose two buttons B3 checks; U6 (f, g) check its markup. B3 seeds no 51 `error_alert` rows because browser specs hold no `holdErrorAlertLock` (ARCH Tests, EZD-252).

### Regression list
| Test file | Test name | Why |
| --- | --- | --- |
| `app/src/server/db/money-routes.test.ts` | C4 | new page |
| `app/e2e/money-pages.spec.ts` | W1, W2 | page paths moved from `[section]` to the new page |
| `app/src/components/disclaimer/disclaimer-pages.test.ts` | U6 | new page file |
| `app/e2e/disclaimer.spec.ts` | EZD-136 done when | new row opened |
| `app/e2e/settings-shell.spec.ts` | B3, B4, B5 | system-status no longer title-only; no-access pages |
| `app/src/app/(office)/settings/settings-pages.test.tsx` | U10 | `[section]` page unchanged |
| `app/src/server/errors/alert-email.test.ts` | EZD-151 alert subject | same module changed |
| `app/src/server/errors/jobs-webhooks.db.test.ts` | all | alert emails for jobs and webhooks |
| `app/src/server/messages/catalog.test.ts` | A5 | new keys |
| `app/src/components/settings/settings-messages.test.ts` | U7 | `office.settings.` key count stays 30 |
| `app/src/server/db/test-only-functions.test.ts` | EZD-323 T8 | server files changed |

## 5. Visual checklist

### Visual checklist
Viewport: desktop 1600 × 1000. Mockup: none (Q-0665, escalated); the parts follow `vault/mockups/S15aCompany.png` Customers block as built in `Customers.module.css`.
| Element | State (empty / loading / error / filled / no permission) | Mockup |
| --- | --- | --- |
| Nav item System status active (`aria-current="page"`), location `Settings · System status`, h1 `System status` | filled | S15 shell (EZD-103a) |
| Four cards in Decided order, 16px apart, each title 12px weight 600 color `--ez-slate-500` (#5e6672), no icon | loading (three 36px skeleton rows each) | S15a Customers block (`.panel`, `.title`, `Customers.module.css:17-26`) |
| Job failures table: columns Failed, Job, Error, Tries; header cells 12px weight 600 with padding 8px 12px (first 8px 12px 8px 0, last 8px 0); body cells 13px with padding 9px 12px; kind and error in DM Mono 12px `--ez-slate-700` | filled | S15a Customers table (`Customers.module.css:85-117`) |
| Webhook failures table: columns Last failed, Delivery, Event, Times; event in DM Mono 12px | filled | S15a Customers table |
| Job and webhook empty texts, 13px `--ez-slate-500`, 16px vertical padding | empty | S15a Customers empty (`.empty`, `Customers.module.css:199-207`) |
| Backup lines: label column outer width 140px in `--ez-slate-500`, value 13px `--ez-ink`; `Not recorded yet` | empty / filled | not on a mockup (`.line`, `.lineLabel`) |
| Drill line, or `No restore drill recorded yet` | empty / filled | not on a mockup |
| Drill line with `Failed` in `--ez-red` weight 500 after one space | filled, latest drill failed | not on a mockup; Q-0672 (b) |
| Card inline error `Couldn't load this section.` with Retry | error | EZD-015a `InlineError` (S01 Error) |
| No-access line in place, no cards | no permission | EZD-102 `NoAccess` |
| Pager right-aligned, 12px `--ez-slate-500`, 10px gap: range, then Previous and Next | filled (> 50 rows) | S15a Customers pager (`.pager`, `Customers.module.css:190-197`) |

### Component tree
| Component | New / change | Copies | Parent |
| --- | --- | --- | --- |
| `Page` (system-status) | new | `app/src/app/(office)/settings/company/page.tsx` | settings layout |
| `SystemStatusPanel` | new | `CustomersPanel` | `SettingsMain` |
| `JobFailuresBody`, `WebhookFailuresBody` (with `Pager`) | new | `CustomersPanel` `body()` | `AsyncView` in the panel |
| `BackupsBody`, `DrillBody` | new | `CustomersPanel` `.empty` and head | `AsyncView` in the panel |

### Screen states
| Screen | State | Mockup | What shows |
| --- | --- | --- | --- |
| System status | loading | not on a mockup | four cards with three skeleton rows each |
| System status | empty | not on a mockup | four empty texts (section 6) |
| System status | filled | not on a mockup | tables and lines |
| System status | error | not on a mockup | per card `Couldn't load this section.` with Retry |
| System status | no permission | EZD-102 `NoAccess` | the no-access line in place |
| System status | offline | not on a mockup | fetch fails → per card error with Retry (no offline banner of its own; the shell's banner is EZD-015's) |
| System status | partial | not on a mockup | one card's error while the others show data |

### Interactions
| Control | Input | Behaviour | Drag threshold | Size and position | Tap area |
| --- | --- | --- | --- | --- | --- |
| Previous / Next | click, tap, Enter, Space | page − 1 / + 1, reloads that card only; disabled at the ends | none | `StateButton compact` in `.pager`, right-aligned after the range | 44 px on a coarse pointer (`touch.target`, `StateButton.tsx:18`) |
| Retry | click, tap, Enter, Space | reloads that card | none | `InlineError` | 44 px on a coarse pointer (`StateButton`) |

### Neighbours
| Element | Owner ticket | How it sits |
| --- | --- | --- |
| Settings nav, header, status bar | EZD-103a | unchanged; the page is the `SettingsMain` card |
| Benchmark card | EZD-237 | later, after `SystemStatusPanel` |

### Viewports
| Viewport | Size | Applies |
| --- | --- | --- |
| desktop | 1600 × 1000 | visual checklist, B1, B2, B4, B5 |
| iPad landscape | 1180 × 820 | B3 touch targets |
| phone | 390 × 844 | not applicable (Settings is office only, 04 App shell) |

## 6. Proposed wording
Style of the approved `office.customers.*` texts (no period on short empty lines; en.ts lines 236, 250-253). All keys under `office.system_status.` (27), English only, in this order in `en.ts`.
| Where | Text |
| --- | --- |
| `jobs_title` / `webhooks_title` / `backup_title` / `drill_title` | Job failures / Webhook failures / Last off-site backup / Last restore drill |
| `col_failed` / `col_job` / `col_error` / `col_tries` | Failed / Job / Error / Tries |
| `col_last_failed` / `col_delivery` / `col_event` / `col_times` | Last failed / Delivery / Event / Times |
| `jobs_empty` | No failed jobs in the last 30 days |
| `webhooks_empty` | No webhook failures |
| `backup_files` / `backup_db_dump` | Files (nightly) / Database (weekly) |
| `backup_line` / `backup_line_location` | {time} · {size} / {time} · {size} · {location} |
| `not_recorded` | Not recorded yet |
| `drill_empty` | No restore drill recorded yet |
| `drill_line_location` | {time} · from {location} |
| `drill_failed` | Failed |
| `load_failed` | Couldn't load this section. |
| `none` | — |
| `range` / `prev` / `next` | {from}–{to} of {total} / Previous / Next |

## 7. Security review
security-review: yes — permissions (the page's `settings_system_status` gate and the no-access path; Q-0225 Owner only) and data access (the page shows system-wide backup and drill rows that EZD-135's function returns only to a holder of the switch). No auth, money, migration or new API change.
Reviewers needed: code-reviewer yes · calc-auditor no · ui-verifier yes · security-reviewer yes.

## 8. Complexity and model recommendation
medium: a page, four cards with one shared pager and an email link over merged patterns (Customers panel, Company page), with five browser tests and inventory edits; no database work. Test-author: sonnet, medium effort. Builder: sonnet, medium effort.

## 9. Dependencies
- From the row: EZD-135 (planned, not built; its brief has no section 3 yet). The builder and test-author start only after EZD-135 merges; if its merged contract differs from section 3 here (from d90b6f94 "Contract between the parts"), this plan is re-validated (Stage 3 step 1), not patched by the builder.
- `(exists)` claims that EZD-135 creates (contract_check and connections_check will flag them until it merges; EZD-383): file `app/src/lib/system-status/system-status.ts` (Build step 1 `change`), exports `SYSTEM_STATUS_PAGE_SIZE`, `SYSTEM_STATUS_PATH`, `StatusPage`, `JobFailureRow`, `WebhookFailureRow`, `BackupRow`, `DrillRow`, `BackupStatus`; the test file `app/src/lib/system-status/system-status.test.ts`; the route `GET /api/settings/system-status`; the `### System status (EZD-135)` subsection of `docs/architecture.md`.
- Missing from the row (all done): EZD-016a (browser harness; the page has a visual checklist), EZD-103a and EZD-103b (Settings shell), EZD-112 and EZD-113 (Company page and Customers panel patterns), EZD-015a (`AsyncView`, `InlineError`, `Skeleton`, `StateButton`), EZD-102 (`NoAccess`, `can`), EZD-101 (the `settings_system_status` switch; Q-0225), EZD-024 (alert emails), EZD-133 (money page inventory), EZD-136 (disclaimer list).
- Held by Q-0665 (escalated to Josh, design): the page layout. This plan follows the recommended (a).
- Dependents: EZD-237 (benchmark card on this page: it uses `SystemStatusPanel`, the page file and `formatStatusTime`, `vault/plans/EZD-237.md:41,115`, but its `depends_on` names only EZD-135; the orchestrator should add EZD-135b to it), EZD-1117 (render usage).

### Risks
| Risk | What could break | Gate notices it | Covered by |
| --- | --- | --- | --- |
| An inventory row skipped | C4, disclaimer U6, settings-shell B5 fail | yes | Shared lists; Regression list |
| Another phase 6 ticket adds a page file first | C4 value 36 is wrong at merge | yes (C4) | Shared lists "develop's count + 1" |
| B1's future `files` row left behind | the backups card of later local runs | no | `finally` delete by id in B1 |
| EZD-135's merged contract differs | types, query params, empty-page reply | yes (typecheck, B tests) | re-validation (section 9) |
| Settings download size | `download.projects-settings` budget (11 Budgets line 21; Q-0586) | yes (perf) | no new dependency; the cards reuse loaded components |
| Q-0665 answered other than (a) | the layout | no | re-plan on Josh's answer |

### Done-when list
Every artifact the change touches (L-057), against develop a02dc35c plus EZD-135's merge; nothing else changes:
- Step 1, `system-status.ts`: `formatStatusTime` and `formatBytes` appended after EZD-135's exports, with one comment line above them `// EZD-135b Build step 1 (vault/plans/EZD-135b.md Decided "Times", "Sizes"): the card time and size texts.`
- Step 2, `en.ts`: the 27 keys of section 6 after line 254, nothing else.
- Steps 3-6: the four new files, each with the header of Decided "File headers" (the page with Decided "Page file header").
- Step 7, `alert-email.ts`: hunk 1, one comment line after line 4: `// EZD-135b (vault/plans/EZD-135b.md Decided "Email link"; Q-0069 (a)): job and webhook alerts open the System status page.`; hunk 2, `import { SYSTEM_STATUS_PATH } from '../../lib/system-status/system-status';` after line 10; hunk 3, the `statusLink` line after line 35; hunks 4 and 5, `link: openApp` → `link: statusLink` at lines 63 and 76. `openApp` and the `error` branch stay.
- Step 8, `docs/architecture.md`: the two bullets of Decided "Architecture bullets", word for word.
- Test-author: `page-cases.ts` line 3 `` `company` (which has its own page) `` → `` `company` and `system-status` (which have their own pages) ``, the new line after line 18, the filter at line 64; `money-routes.test.ts` line 147 title "there are 36 pages" and line 151 `toBe(36)`; `disclaimer-pages.ts` one row after line 69; `settings-shell.spec.ts` line 145 comment → `// EZD-112 and EZD-135b built these pages, so they are no longer unbuilt, title-only pages.` and line 146 filter `([id]) => id !== 'company' && id !== 'system_status'`; `system-status.test.ts` and `alert-email.test.ts` their new describes; the 3 new test files of section 4.

## 10. Open questions
- Q-0665 (escalated to Josh, design): the page has no board; the code-bound step waits on his answer. Until he answers, the planned layout is the recommended (a): four cards in the Settings shell.
- Q-0672 (answered-agent): the Last restore drill card shows the latest finished drill of any status and marks a failed one Failed.
- None (no QP questions).
