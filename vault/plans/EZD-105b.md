# EZD-105b · Owner-set password

- **ACs:** AC-EZD-105b-1, AC-EZD-105b-2, AC-EZD-105b-3, AC-EZD-105b-4 (`vault/spec/acceptance-criteria.md:1110-1113`, stage-0)
- **Complexity:** high (section 8)
- **Areas:** auth, security, migrations, api, ui, testing
- **User-visible result:** On Settings → Users + permissions, an Owner presses "Set password" on a member's row menu or in the inspector. EZ Draft makes a 16-character password and shows it once with Copy. The member is signed out on every device and gets an email that their password was set.
- Phase: 7 · Planned by: planner · Date: 2026-11-11 · Status: questions
- Template: v2

## 1. What to build

Ticket row (`vault/tickets/phases/phase-01.md:14`): Scope "'Set password' in the S15 row More menu and the inspector for a member with the Owner preset (no settings_users needed); generates a 16-character password shown once with Copy; signs the member out on every device; emails the member that it was set; event_log row in the same transaction." / Done when "An owner sets a member's password, sees it once, the member is signed out everywhere and gets the email." / Depends on EZD-106, EZD-033 / Spec ref Q-0096 P3, P4, P5, P7, P10; Q-0695. The Stage-0 ACs AC-EZD-105b-1 to -4 replace the Done-when.

Design in one line: a POST route with no body checks the caller and the target inside one database function, makes the password on the server, sets it through the one narrow admin file, then a second database function ends the member's sessions and writes the event_log row in one transaction, and the member gets a company email. The same SQL predicate decides the route and the `canSetPassword` flag the screen reads, so the two cannot drift (rule 18; D3 (a)).

Order of the server steps, and why: (1) `owner_password_target` checks and returns the member's auth id; (2) the password is made; (3) `setMemberPassword` sets it in Auth; (4) `record_member_password_set` ends the sessions and writes event_log in one transaction; (5) the email goes out; (6) the route returns the password once. The event is registered but not emitted: its event_log row is the one written in step 4, so a later event-log sink cannot write a second row (AC-4 "an event_log row"; Q-0695 03 row 33). Auth is reached over HTTP, so step 3 cannot share a database transaction. If step 4 fails after step 3, the new password is known to nobody (it is not returned) and the member's old sessions stay until a retry. That is a safe state. The reverse order would log "password set" and end sessions when Auth then refuses the change. "In the same transaction as the change" (AC-4) is therefore the database part of the change: ending the sessions and the event_log row (Q-0695 row 65 leaves "how" to this plan; architecture "Password sign-in (EZD-033)" "For EZD-105b": ends the member's sessions).

### Build steps
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1 | `supabase/migrations/20261111200000_create_owner_password_functions.sql` | new | `private.owner_password_refusal(p_membership_id uuid) returns text`; `public.owner_password_target(p_membership_id uuid) returns table (auth_user_id uuid, email text)`; `public.record_member_password_set(p_membership_id uuid, p_ip inet) returns table (tenant_id uuid, member_app_user_id uuid, member_email text, member_name text, actor_label text, company_name text, company_reply_to text)`; `public.list_users(p_search text, p_page integer) returns jsonb` redefined with `create or replace` (bodies and grants: "Database functions", "Grants"). Calls `private.tenant_id()` (`20261019170003_create_rls_helpers.sql:21`), `private.require_api_gate()` (`20261027001405_create_require_api_gate.sql:9`), `private.end_user_sessions(uuid)` (`20261022120003_end_sessions_broadcast.sql:7`) and `private.write_event_log` (QP-2) | `supabase/migrations/20261103180001_create_my_profile_functions.sql` (definer, `private.require_api_gate()`, revoke then grant); the newest `list_users` definition on develop (EZD-106a's redefinition, else EZD-104's `20261111120000_create_users_page_functions.sql`) | `pnpm db:up` then `pnpm --filter @ezdraft/app exec vitest run src/server/users/owner-password.db.test.ts` |
| 2 | `app/src/server/db/database.types.ts` | change (generated) | adds `owner_password_target`, `record_member_password_set` under `Functions` | `scripts/db/gen-types.mjs` (run as `pnpm db:types`) | `node scripts/db/gen-types.mjs --check` |
| 3 | `app/src/lib/users/users.ts` | change (EZD-104 created it, commit 397d581a on develop) | `UserRow` gains `canSetPassword: boolean` (after `canCopyLink`) | none (the file is EZD-104's; mirror its `canCopyLink` field) | `pnpm run typecheck` |
| 4 | `app/src/server/users/users.ts` | change (EZD-104 created it, commit 397d581a on develop) | the zod row schema of `listUsers` gains `canSetPassword: z.boolean()` | none (the file is EZD-104's; mirror its `canCopyLink` schema entry) | `pnpm --filter @ezdraft/app exec vitest run src/server/users` |
| 5 | `app/src/server/auth/admin-auth.ts` (QP-2) | new (not at develop HEAD today; EZD-105c creates it before this ticket builds, and this ticket then edits it) | adds `export async function setMemberPassword(authUserId: string, password: string): Promise<void>`: `auth.admin.updateUserById(authUserId, { password })` on the file's own secret-key client; any `error` or throw → `throw new Error('admin_password_failed')` | `app/src/server/jobs/db.ts` (lines 8-15: how a secret-key client is built, copied, never called) and the file's own invite session call (EZD-105c) | `pnpm --filter @ezdraft/app exec vitest run src/server/users/owner-password.test.ts` (S5) |
| 6 | `app/src/server/users/owner-password.ts` | new | `GENERATED_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'`; `GENERATED_PASSWORD_LENGTH = 16`; `GENERATE_TRIES = 10`; `generateMemberPassword(email: string, randomIndex?: (size: number) => number): string`; types `OwnerPasswordCode`, `OwnerPasswordResult`, `OwnerPasswordDeps` (section 3); `buildOwnerPasswordEmail(input: { to: string; actor: string; companyName: string; replyTo: string \| null }, env: Record<string, string \| undefined> = process.env): SendEmailInput`; `setOwnerPassword(client: SupabaseClient<Database>, membershipId: string, ip: string \| null, deps?: OwnerPasswordDeps): Promise<OwnerPasswordResult>`. Imports: `validateNewPassword` (`app/src/lib/auth/password-rules.ts`), `sendEmail` (`app/src/server/email/index.ts`), `getT` (`app/src/server/messages/get-t.ts:7`), `appOrigin` (`app/src/server/errors/app-origin.ts`), `reportError` (`app/src/server/errors/report.ts:103`), `reportRouteFailure` (`app/src/server/errors/route-failure.ts:7`), `setMemberPassword` (`app/src/server/auth/admin-auth.ts`), `randomInt` (`node:crypto`) | `app/src/server/profile/password.ts` (deps object, result union, report by code); `app/src/server/profile/profile.ts:65-97` (`sendPasswordEmail`) | `pnpm --filter @ezdraft/app exec vitest run src/server/users/owner-password.test.ts` |
| 7 | `app/src/lib/events/registry.ts` | change | `EVENTS` gains `'user.password_set': { kind: 'log_only' }` after `'user.language_changed'` (line 64), with the comment `// EZD-105b: written only as an event_log row inside record_member_password_set; never emitted`; `EventPayloads` gains `'user.password_set': { membershipId: string; appUserId: string }` after line 134 | `app/src/lib/events/registry.ts` (the `user.language_changed` entries) | `pnpm run typecheck` |
| 8 | `app/src/app/api/settings/users/[id]/password/route.ts` | new | `export const dynamic = 'force-dynamic'`; `POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response>`. Imports: `requireApiSession` (`app/src/server/auth/session.ts`), `createSessionClient` (`app/src/server/auth/supabase-server.ts`), `reportRouteFailure` (`app/src/server/errors/route-failure.ts:7`), `setOwnerPassword` (step 6), `eventLogIp` (QP-2), `z` (`zod`) | `app/src/app/api/profile/password/route.ts` (session, fail helper, 500); `app/src/app/api/settings/customers/[id]/route.ts:33-40` (params, `z.uuid()` id check) | `pnpm --filter @ezdraft/app exec vitest run "src/app/api/settings/users/[id]/password/route.test.ts"` |
| 9 | `app/src/server/messages/catalogs/en.ts` | change | the `office.users.set_password*` and `office.users.password_*` keys of section 6 after the last `office.users.` key; `error.user_not_found` and `error.password_target_refused` after `error.customer_not_found` (line 84) | `app/src/server/messages/catalogs/en.ts` (the `office.profile.*` password block, lines 359-378) | `pnpm run typecheck` |
| 10 | `app/src/server/messages/catalogs/es.ts` | change | `error.user_not_found` and `error.password_target_refused` (Spanish of section 6) after `error.customer_not_found` (line 91) | `app/src/server/messages/catalogs/es.ts` (the `error.customer_not_found` entry) | `pnpm --filter @ezdraft/app exec vitest run src/server/messages` |
| 11 | `app/src/components/settings/users/SetPasswordDialog.tsx` | new | `'use client'`; `SetPasswordDialog({ row, onClose }: { row: UserRow; onClose: () => void }): JSX.Element` | `app/src/components/settings/company/CustomerDialog.tsx` (Radix `Dialog`, `StateButton` footer, `useOnline`, plain `fetch` with `credentials: 'same-origin'`) | `pnpm --filter @ezdraft/app exec vitest run src/components/settings/users/set-password-dialog.test.tsx` |
| 12 | `app/src/components/settings/users/Users.module.css` | change (EZD-104 created it, commit 397d581a on develop) | classes `passwordSection`, `passwordValue`, `dialogOverlay`, `dialogContent`, `dialogBody`, `dialogTitle`, `dialogText`, `dialogError`, `dialogFooter`, `dialogSpacer` (Decided "CSS") | `app/src/components/settings/company/Customers.module.css:209-292` (dialog block) | `pnpm --filter @ezdraft/app exec playwright test e2e/settings-users-password.spec.ts --project desktop` (B1 computed styles) |
| 13 | `app/src/components/settings/users/UserMoreMenu.tsx` (QP-2) | new (not at develop HEAD today; EZD-105d creates it and EZD-106b adds its member items before this ticket builds, Q-0722 (a); this ticket then edits it) | props gain `onSetPassword: (row: UserRow) => void`; a `MenuItem` `testId="user-menu-set-password"` text `office.users.set_password`, rendered only when `row.canSetPassword`, `onSelect={() => onSetPassword(row)}`, placed after the Edit item | `app/src/components/menu/Menu.tsx` (`MenuItem`, line 184) and the menu's other items | `pnpm --filter @ezdraft/app exec vitest run src/components/settings/users/set-password-dialog.test.tsx` (C4) |
| 14 | `app/src/components/settings/users/UsersPanel.tsx` | change (EZD-104 created it, commit 397d581a on develop) | `UserInspector` props gain `onSetPassword: (row: UserRow) => void`; the inspector section of Decided "Inspector section" (`user-set-password`); `UsersPanel` state `passwordFor: UserRow \| null`, passes `onSetPassword={setPasswordFor}` to `UserInspector` and every `UserMoreMenu`, and renders `<SetPasswordDialog row={passwordFor} onClose={() => setPasswordFor(null)} />` when `passwordFor !== null` | `app/src/components/settings/company/CustomersPanel.tsx` (panel `useState` holding what the open dialog shows) | `pnpm --filter @ezdraft/app exec playwright test e2e/settings-users-password.spec.ts` |
| 15 | `docs/architecture.md` | change | new heading `### Owner-set password (EZD-105b)` after `### My profile (EZD-108)` (five bullets: the three functions and the refusal order; the route and its codes; the step order and why; the admin file call; the dialog); the service-key bullet (line 892) gains "and `setMemberPassword` in the same admin file for the Owner-set password (EZD-105b)" after EZD-105c's exception text | `docs/architecture.md` (the `### My profile (EZD-108)` section) | `node vault/tools/outline.mjs docs/architecture.md --section 'Owner-set password (EZD-105b)'` |

Test-author edits to existing test and harness files are rows E1 to E5 of section 4 (L-049).

### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Who may set | The caller's membership is the token's `membership_id` claim, `active`, in the claim tenant, and its `role_id` points at the tenant's role with `preset = 'owner'`. No permission switch is read, so an Owner without `settings_users` passes | Q-0096 P4; Q-0695 (10 row 59: "the one exception is Set password"); EZD-104 plan `list_users` viewer CTE (`vault/plans/EZD-104.md:136`) |
| The Users page itself | Stays gated by `settings_users` (Q-0695 row 59). An Owner without `settings_users` reaches only the route; no page change in this ticket | Q-0695 (10 row 59); AC-EZD-104-5 |
| Whose password may be set | `private.owner_password_refusal` returns null (allowed) or the first refusal, checked in this order: `not_owner` (caller fails "Who may set"); `not_found` (no membership with that id in the claim tenant); `self` (target is the caller's membership; own password is My profile, Q-0096 P6, with reauthentication); `not_active` (target status is not `active`); `no_account` (target `app_user.auth_user_id` is null, or its `auth.users.email_confirmed_at` is null); `admin` (target role `preset = 'owner'`, or target has `user_permission` `settings_users` with `granted`); `other_company` (the target `app_user` has any `membership` row, any status, in another tenant) | Q-0094 EZD-105b list as recorded in `vault/plans/EZD-033.md:52` ("never another admin, never a login with a membership in another company"; confirmed accounts only); architecture "Password sign-in (EZD-033)" "For EZD-105b"; QP-1 (the `admin` and `not_active` rules) |
| One predicate | `list_users` sets `canSetPassword` = `private.owner_password_refusal(m.id) is null` for every row; both public functions call the same function. No other code decides it | rule 18; D3 (a) |
| Route order | (1) `requireApiSession()` → 401 `not_signed_in`; (2) `z.uuid()` on `id` fails → 404 `user_not_found`; (3) the request body is never read; (4) `setOwnerPassword(createSessionClient(), id, eventLogIp(request.headers))`; (5) map the result | architecture "Errors and logging"; `app/src/app/api/settings/customers/[id]/route.ts:37-38` (malformed id is 404); AC-EZD-105b-2 (the owner cannot type one) |
| Route permission check | The route has no `requireApiPermission(` call. Its check is `owner_password_target` inside the database (step 1 of `setOwnerPassword`). The route is added to `WRITE_PERMISSION_EXEMPTIONS` with reason `'Owner preset, no switch; checked inside owner_password_target and record_member_password_set, Q-0096 P4 (EZD-105b)'`; the code-reviewer and security-reviewer approve it in this ticket's reviews | Q-0695 (10 row 65: "Its plan settles how the Owner-preset check works in a route with no permission key"); `app/test-harness/permissions/write-exemptions.ts:1-3` (approval rule) |
| `setOwnerPassword` steps | (1) `rpc('owner_password_target', { p_membership_id })`: error code `42501` → `{ status: 403, code: 'permission_denied' }`; `P0002` → `{ 404, 'user_not_found' }`; `P0001` → `{ 403, 'password_target_refused' }`; any other error → `reportRouteFailure(error, ROUTE)` and `{ 500, 'db_unavailable' }`; no error and no row → `reportError(new Error('owner_password_target_empty'), { source: 'function', location: ROUTE })` and `{ 500, 'db_unavailable' }`. (2) `deps.newPassword(email)`. (3) `deps.setMemberPassword(authUserId, password)`: a throw → `reportError(new Error('owner_password_admin_failed'), { source: 'function', location: ROUTE })` and `{ 500, 'db_unavailable' }`. (4) `rpc('record_member_password_set', { p_membership_id, p_ip })`: `42501`, `P0002` or `P0001` → report `owner_password_record_refused`, then the same mapping as step 1; any other error, or no error and no row → report `owner_password_record_failed` and `{ 500, 'db_unavailable' }`. (5) `deps.sendEmail(buildOwnerPasswordEmail({ to: member_email, actor: actor_label, companyName: company_name, replyTo: company_reply_to }))`: result `status: 'sent'` → `emailSent = true`; `status: 'failed'` → `false` (sendEmail reports it itself, architecture "Email"); a throw → report `owner_password_email_failed`, `false`. (6) `{ status: 200, body: { password, emailSent } }`. `emit` is never called. `ROUTE = '/api/settings/users/[id]/password'` | this plan's step order (section 1 intro); `app/src/server/profile/password.ts` (report by code); architecture "Email (EZD-008)" |
| Event | `user.password_set` is in `EVENTS` (`log_only`) so the event_log `action` is a registry name; nothing calls `emit` for it. The one record is the event_log row of step 4, with actor and tenant taken from the claims in the database. The event_log ticket's default sink therefore never sees it, and no second row can appear | Q-0695 (03 row 33: action is a registry EventName; permission and membership changes write their row in the same transaction); AC-EZD-105b-4 |
| Password maker | `generateMemberPassword(email, randomIndex = (n) => randomInt(n))` with `randomInt` from `node:crypto` (uniform, cryptographic). It draws 16 indexes into `GENERATED_PASSWORD_ALPHABET` (56 characters: A-Z without I and O, a-z without l and o, 2-9; about 93 bits) and returns the string when `validateNewPassword(candidate, email)` (`app/src/lib/auth/password-rules.ts:13`) returns `[]`. After `GENERATE_TRIES` (10) refused candidates it throws `new Error('owner_password_generate_failed')`, which the route reports and answers 500 `db_unavailable` | Q-0096 P3 (16 characters); architecture "Password sign-in (EZD-033)" ("call `validateNewPassword()` before setting"); alphabet and tries: planner's choice (no look-alike characters for a password read aloud) |
| Secrets | The password never goes into a log, an Error, a report, a cookie, a URL, the database or storage. It is in the route's 200 body only (`Cache-Control: no-store`) and in the dialog's React state until the dialog unmounts | architecture "Errors and logging" (never logged); EZD-108 `app/src/server/profile/password.ts:7-8` |
| Email | `buildOwnerPasswordEmail` returns `{ to, subject: t('office.users.password_email_subject'), paragraphs: [t('office.users.password_email_body', { actor, email: to })], link: { url: appOrigin(env), label: t('office.profile.email_link') }, company: { name: companyName, replyTo }, lang: 'en' }` with `t = getT('office', 'en')`. English, as EZD-108's password emails. The email carries no password and no action link, so no Copy link is shown for it; the password itself has Copy | Q-0096 P5; architecture "Email (EZD-008)" (Sender Q-0036); architecture "My profile (EZD-108)" (one English system email, no Copy link); `app/src/server/errors/app-origin.ts:4` |
| `actor_label` | `coalesce(nullif(btrim(app_user.name), ''), app_user.email)` of the caller | `app_user.email` is `not null` (`20261019165202_create_app_user.sql:8`) |
| `company_reply_to` | `nullif(btrim(tenant.contact ->> 'email'), '')` | architecture "Email (EZD-008)" Sender; `20261019165201_create_tenant.sql:8` |
| IP for event_log | `eventLogIp(request.headers)` from the ticket that creates event_log (QP-2); passed as `p_ip`. Its contract (QP-2): the first `x-forwarded-for` entry, trimmed, when it parses as one IPv4 or IPv6 address, returned in that address's text form; otherwise (missing, empty, unparsable, a list with no first entry) `null`. So `p_ip` is always castable to `inet` or null, and a bad header never fails the request | Q-0695 (03 row 33: first x-forwarded-for value, full address or null, never throttle.ts's /64 key) |
| event_log row | `private.write_event_log('user.password_set', 'membership', p_membership_id, jsonb_build_object('appUserId', <target app_user id>), p_ip)` inside `record_member_password_set`, after `private.end_user_sessions` | Q-0695 (03 row 33); AC-EZD-105b-4; QP-2 (function name) |
| Ending sessions | `perform private.end_user_sessions(<target app_user id>)` (`20261022120003_end_sessions_broadcast.sql`: deletes `auth.sessions` rows and pushes `session.ended`). Nothing else ends sessions | Q-0096 P7; architecture "Auth and session (EZD-007)" |
| Locks | `record_member_password_set` first runs `select 1 from public.membership where id = p_membership_id and tenant_id = private.tenant_id() for update`, then the refusal check, so a status change cannot interleave | rule 18 |
| Two presses at once | The dialog sends at most one request (the confirm button is disabled while pending). Two direct requests each set a password; the last to reach Auth is the one that works; each writes its own event_log row | planner's choice; S15 Controls (one action per press) |
| Dialog steps | `confirm` (title, body text, Cancel `StateButton` default variant, Set password `StateButton` `variant="primary"`) → `pending` (Set password disabled with label `office.users.set_password_pending`; Cancel `disabled`; Esc and overlay click ignored through `onEscapeKeyDown`/`onPointerDownOutside` `preventDefault`) → `shown` (the password in `<code data-testid="set-password-value" className={styles.passwordValue}>`, the help line, Copy `StateButton` default variant, Done `StateButton` `variant="primary"`; Esc and overlay click close). Lines: title `Dialog.Title` `dialogTitle`; body, help, offline and email-failed lines `p.dialogText`; error line `p.dialogError` or back to `confirm` with the error line. Closing in `confirm` or `shown` calls `onClose`; the parent unmounts the dialog, so the password is gone | Q-0096 P3 (shown once); QP-3 (confirm step) |
| Dialog error text | The status decides first. 200: the body must parse as JSON with a 16-character string `password` and a boolean `emailSent`, else `office.users.set_password_failed`. 403: when the body parses and `error.code` is `password_target_refused` → `error.password_target_refused`; any other body (other code, not JSON) → `error.not_authorized`. 404 (any body) → `error.user_not_found`. Any other status or a network error → `office.users.set_password_failed`. Shown in `p[role="alert"][data-testid="set-password-error"]`; pressing Set password again retries | architecture "Errors and logging" (message_key through `t()`) |
| `{name}` in dialog text | `row.name ?? row.email` | `UserRow.name` is `string \| null` (EZD-104 section 3) |
| Copy | `navigator.clipboard.writeText(password)`; fulfilled → `useToast().show({ message: 'office.users.set_password_copied' })`; rejected → `show({ message: 'office.users.set_password_copy_failed' })` | S15 Controls "Row: Copy link" (toast after copy) |
| Offline | `useOnline()` false: the Set password confirm button is disabled and `p[data-testid="set-password-offline"]` shows `office.users.set_password_offline`. The menu item and inspector button still open the dialog (`MenuItem` has no disabled state, `Menu.tsx:184-205`) | S15 States "Offline"; architecture "State components (EZD-015)" (`useOnline`) |
| Email failed | `emailSent` false in `shown`: `p[data-testid="set-password-email-failed"]` with `office.users.set_password_email_failed` under the help line | R26 R16 (nothing fails silently) |
| Inspector section | In `UserInspector`, after the language block and before Permissions, when `row.canSetPassword`: `section.passwordSection` with label `office.users.password_section` and a `StateButton` (default variant) `data-testid="user-set-password"` text `office.users.set_password`, `onClick={() => onSetPassword(row)}` | Q-0096 P10 (inspector button); Q-0696 recommended (a) (built from the spec text with the Settings shell parts); `vault/tickets/README.md` rule 5 (nearest mockup: the board's inspector section blocks) |
| CSS | Dialog classes copy `Customers.module.css` `.overlay`, `.content`, `.body`, `.dialogTitle`, `.fieldError`, `.footer`, `.footerSpacer` (lines 211-292) under the new names; `.dialogText { margin: 0 0 12px; font-size: 14px; color: var(--ez-slate-500); }`; `.dialogError` copies `.fieldError` plus `margin: 0 0 12px`; `.passwordValue { display: block; margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--ez-border); border-radius: var(--ez-radius-8); font: 500 16px var(--ez-font-mono); letter-spacing: 0.04em; user-select: all; color: var(--ez-ink); }`; `.passwordSection { padding: 14px 18px; border-top: 1px solid var(--ez-border); }`. Colors, radius and fonts use only the tokens named here; sizes are px | `Customers.module.css:209-292`; `app/src/styles/fonts.ts:19` (`--ez-font-mono`); L-013 |
| Migration name | `20261111200000_create_owner_password_functions.sql`. If a migration on develop sorts at or after it at build time, the builder renames it to the current UTC time `YYYYMMDDHHMMSS` before committing | L-060 |
| Message keys | `office.*` keys in `en.ts` only (office namespace is English); `error.*` keys in `en.ts` and `es.ts`. If `error.user_not_found` already exists when the builder starts (EZD-106a may add it), reuse it and add only `error.password_target_refused` | architecture "Messages and language (t())"; `en.ts:84`, `es.ts:91` precedent |

### Do not touch
- `app/src/server/profile/password.ts`, `app/src/server/profile/profile.ts` and `/api/profile/password`: own-password change stays EZD-108's.
- `app/src/server/jobs/db.ts`: no new caller of `createJobsDbClient`.
- `private.end_user_sessions`, `private.membership_end_sessions`, the `auth_users_password_guard` trigger and `private.invite_is_valid`: called or relied on, never redefined.
- `app/src/components/menu/Menu.tsx`: no `disabled` prop is added.
- `list_users` fields other than the added `canSetPassword`, and its row order, counts and paging.
- The EZD-007c T34 allowed-file list (`app/src/server/auth/session.test.ts:322-327`): EZD-105c adds `admin-auth.ts`; this ticket adds no file that imports `@supabase/*`.

### Behaviour per role
| AC | Role | Behaviour |
| --- | --- | --- |
| AC-1 | owner (Owner preset, all 37) | Sees "Set password" in the More menu and the inspector of every row whose `canSetPassword` is true: active members with a confirmed account, not Owner preset, without `settings_users`, not themself, with no membership elsewhere |
| AC-1 | owner without `settings_users` (Owner (modified)) | Cannot open the Users page (Q-0695 row 59). `POST /api/settings/users/<id>/password` answers 200 |
| AC-1 | office (Designer or custom role holding `settings_users`) | Opens the Users page; no row shows Set password (`canSetPassword` false everywhere); the route answers 403 `permission_denied` |
| AC-1 | field (Foreman, Crew), view-only, no permission | No Users page (in-place no access, AC-EZD-104-5); the route answers 403 `permission_denied` |
| AC-2 | owner | The dialog has no text field. Set password returns a 16-character password shown once with Copy; Done or closing forgets it |
| AC-3 | owner | After Set password the member's sessions are gone (`auth.sessions` rows deleted, `session.ended` pushed); their open pages go to sign-in on the next request; one email "A new password was set for your EZ Draft account" reaches the member |
| AC-3 | member whose password was set | Signed out everywhere; signs in with the new password or with the emailed code (Q-0091) |
| AC-4 | any | `updateUserById` appears only in `app/src/server/auth/admin-auth.ts`; one event_log row `user.password_set` per success, written in the transaction that ends the sessions |

### Failure and edge cases
| Function or action | Case | Behaviour | What the user sees |
| --- | --- | --- | --- |
| route | no session | 401 `not_signed_in` | (not reachable from the page) |
| route | `id` not a UUID, empty, or longer than 36 characters | 404 `user_not_found`, no database call (`z.uuid()` bounds the form) | `error.user_not_found` |
| route | a request body (any JSON or none) | never read; the password is always made on the server | nothing different |
| `owner_password_target` | caller not an active Owner preset member | `42501` → 403 `permission_denied` | `error.not_authorized` |
| `owner_password_target` | id of another company's member, or no such membership | `P0002` → 404 `user_not_found` (does not reveal it exists) | `error.user_not_found` |
| `owner_password_target` | target is self, not active, no confirmed account, an admin, or in another company | `P0001` → 403 `password_target_refused` | `error.password_target_refused` |
| `generateMemberPassword` | 10 candidates refused by `validateNewPassword` | throws `owner_password_generate_failed` → reported, 500 `db_unavailable` | `office.users.set_password_failed` |
| `setMemberPassword` | Auth error (5xx, network, `weak_password`) | throws `admin_password_failed` → reported `owner_password_admin_failed`, 500; nothing recorded, no email | `office.users.set_password_failed` |
| `record_member_password_set` | target or caller changed between steps 1 and 4 | refused, reported `owner_password_record_refused`, 403 or 404; the Auth password is changed but known to nobody; old sessions stay | the matching error text |
| `record_member_password_set` | database error, or the event_log write fails | whole transaction rolls back (sessions not ended, no row); reported `owner_password_record_failed`; 500, no password returned | `office.users.set_password_failed`; pressing again makes a new password |
| email | send fails (`status: 'failed'`) or throws | `emailSent: false`; a throw is reported `owner_password_email_failed` | password shown plus `office.users.set_password_email_failed` |
| dialog | double click on Set password | one request (button disabled while pending) | Setting password… |
| dialog | offline | confirm disabled | `office.users.set_password_offline` |
| dialog | clipboard refused | toast | `office.users.set_password_copy_failed` |
| dialog | Esc, overlay click or Cancel while pending | ignored (Cancel disabled), so a password made on the server is never lost unseen | dialog stays |

### Database columns
None: no table or column is added or changed; `event_log` is created by the ticket QP-2 names.

### RLS policies
None: no table is added; the functions are `security definer` and check tenant and caller themselves.

### Grants
| Object | anon | authenticated | service_role |
| --- | --- | --- | --- |
| `private.owner_password_refusal(uuid)` | none (`revoke all … from public, anon, service_role`) | execute (called by `list_users`, which is `security invoker`); `PRIVATE_EXECUTE` entry, E2 | none |
| `public.owner_password_target(uuid)` | none | execute | none |
| `public.record_member_password_set(uuid, inet)` | none | execute | none |
| `public.list_users(text, integer)` | none | execute (unchanged) | none |

### Database functions
| Function | Signature | Security definer | Checks inside |
| --- | --- | --- | --- |
| `private.owner_password_refusal` | `(p_membership_id uuid) returns text`, `plpgsql`, `stable`, `set search_path = ''` | yes (reads `auth.users` and other tenants' memberships) | `v_tenant := private.tenant_id()` (raises `42501` on an ended session); `v_caller := nullif(auth.jwt() ->> 'membership_id', '')::uuid`; the refusal order of Decided "Whose password may be set", returning the first code or null |
| `public.owner_password_target` | `(p_membership_id uuid) returns table (auth_user_id uuid, email text)`, `plpgsql`, `stable`, `set search_path = ''` | yes | `perform private.require_api_gate()`; `v := private.owner_password_refusal(p_membership_id)`; `not_owner` → `raise exception 'permission_denied' using errcode = '42501'`; `not_found` → `raise exception 'user_not_found' using errcode = 'P0002'`; any other non-null → `raise exception 'password_target_refused' using errcode = 'P0001'`; else one row `(app_user.auth_user_id, app_user.email)` of the target |
| `public.record_member_password_set` | `(p_membership_id uuid, p_ip inet) returns table (tenant_id uuid, member_app_user_id uuid, member_email text, member_name text, actor_label text, company_name text, company_reply_to text)`, `plpgsql`, `volatile`, `set search_path = ''` | yes | `perform private.require_api_gate()`; the row lock of Decided "Locks"; the same refusal mapping; `perform private.end_user_sessions(<target user_id>)`; `perform private.write_event_log(…)` (Decided "event_log row"); returns one row (tenant id, target app_user id, email and name, `actor_label`, `tenant.name`, `company_reply_to`) |
| `public.list_users` | unchanged signature, `language sql stable security invoker` | no (unchanged) | body of the newest develop definition plus `'canSetPassword', private.owner_password_refusal(m.id) is null` in each row object, after `'canCopyLink'` |

All three new functions: `revoke all on function … from public, anon, service_role; grant execute on function … to authenticated;` (L-016). The two `returns table` functions declare output columns (`tenant_id`, `email`, `auth_user_id`, …) that share names with table columns, so each `plpgsql` body starts with `#variable_conflict use_column` and every column reference in every query is qualified with a table alias (`m.tenant_id`, `u.email`); the output row is returned with `return query select …` (precedent: `20261103180001_create_my_profile_functions.sql:52-55`). Confirm the SQL on the pinned stack before committing tests (L-009).

### Migrations
| Migration file | Order | Type regeneration | Backfill |
| --- | --- | --- | --- |
| `20261111200000_create_owner_password_functions.sql` | after every EZD-104, EZD-105a, EZD-105c, EZD-106a and event_log migration (Decided "Migration name") | `pnpm db:types`, then `node scripts/db/gen-types.mjs --check` | none |

## 2. Sources
- Spec: `vault/spec/sections/screens/S15-settings-users-permissions.md` (Controls: Row More menu, Copy link toast; States: Offline, Error; Events emitted); `vault/spec/sections/09n-users-and-invites-examples.md` (Last settings_users holder: "active memberships" counting rule); `vault/spec/sections/00h-glossary-phase-07.md` (Users page switch, Deactivated, Event log).
- Decisions: `vault/spec/decisions/10-permissions-and-settings.md` Q-0096 (P3, P4, P5, P6, P7, P10; row 25), Q-0695 (rows 58, 59, 65), Q-0706 (row 69); `vault/spec/decisions/03-data-model.md` Q-0695 (row 33, event_log; row 34, claim-based checks); `vault/spec/decisions/05-screens.md` Q-0695 (rows 141, 142: no board for Set password, Q-0696).
- Answered questions: Q-0094 and Q-0095 (`vault/questions/QUESTIONS-answered.md:65-66`; Q-0094's EZD-105b list as recorded in `vault/plans/EZD-033.md:52`), Q-0096 (`:67`), Q-0091 (one wrong-password answer; code sign-in stays).
- Open questions this plan rests on: Q-0696 (escalated design: no board for the Set password button; this plan follows its recommended (a)), Q-0720 (who creates event_log), Q-0722 (who builds the More menu).
- Mockup: `vault/mockups/S15Settings.png` (inspector blocks, row "…" column, footer buttons). No board shows Set password (Q-0696). Sample data is not a decision.
- Dependency contracts: `vault/plans/EZD-104.md` section 3 (`UserRow`, `list_users`, `UserInspector`, `UsersPanel`); `vault/plans/EZD-106.md` split proposal (parts a and b: `UserMoreMenu.tsx`, `list_users` redefinition); `vault/plans/EZD-105.md` split proposal (part a: `invite`, event_log under Q-0720 (a); part c: the narrow secret-key file).
- Code read 2026-11-11 on develop (`9093b28c`): `supabase/migrations/20261024100002_create_role.sql` (`preset`), `20261024100004_add_membership_role_id.sql`, `20261024100005_create_user_permission.sql` (`granted`), `20261019165202_create_app_user.sql`, `20261019165204_create_membership.sql`, `20261019170003_create_rls_helpers.sql:21-34` (`private.tenant_id`), `20261022120003_end_sessions_broadcast.sql` (`private.end_user_sessions`), `20261027001405_create_require_api_gate.sql`, `20261103180001_create_my_profile_functions.sql`; `app/src/server/profile/password.ts`, `profile.ts:65-97`; `app/src/app/api/profile/password/route.ts`; `app/src/app/api/settings/customers/[id]/route.ts`; `app/src/server/permissions/can.ts`; `app/test-harness/permissions/write-exemptions.ts`; `app/test-harness/money/route-cases.ts`; `app/test-harness/rls/{gate,private-execute,fixtures}.ts`; `app/src/components/menu/Menu.tsx:184`; `app/src/components/settings/company/{CustomerDialog.tsx,Customers.module.css}`; `app/src/lib/events/registry.ts`; `app/src/server/email/types.ts:20-28`; `@supabase/auth-js@2.118.0` `GoTrueAdminApi.d.ts:529` (`updateUserById(uid, { password })`). No `auth.admin` or `event_log` use exists in `app/src` today.
- Research: no report covers this ticket.

Architecture: Auth and session (EZD-007); Password sign-in (EZD-033); My profile (EZD-108); Email (EZD-008); Events; Server-only data access and can(); Permission enforcement (EZD-102); Messages and language (t()); State components (EZD-015); Menus (EZD-108); Row-level security (EZD-006); Policy test harness (EZD-006); Migrations; Browser tests (EZD-016a)

## 3. Interface contract
| Kind (file / export / signature / route / props / data-testid) | Name or path | Details |
| --- | --- | --- |
| route | `POST /api/settings/users/[id]/password` | `[id]` = `UserRow.membershipId`. No body read. 200 `{ password: string, emailSent: boolean }`; 401 `not_signed_in`; 403 `permission_denied` (`error.not_authorized`) or `password_target_refused` (`error.password_target_refused`); 404 `user_not_found` (`error.user_not_found`); 500 `db_unavailable` (`error.db_unavailable`). Error body `{ error: { code, message_key } }`; every response `Cache-Control: no-store` |
| type | `UserRow` (`app/src/lib/users/users.ts`) | adds `canSetPassword: boolean` |
| SQL | `private.owner_password_refusal(p_membership_id uuid) returns text` | null or one of `not_owner`, `not_found`, `self`, `not_active`, `no_account`, `admin`, `other_company` |
| SQL | `public.owner_password_target(p_membership_id uuid) returns table (auth_user_id uuid, email text)` | raises `42501 permission_denied`, `P0002 user_not_found`, `P0001 password_target_refused` |
| SQL | `public.record_member_password_set(p_membership_id uuid, p_ip inet) returns table (tenant_id uuid, member_app_user_id uuid, member_email text, member_name text, actor_label text, company_name text, company_reply_to text)` | same raises; ends sessions; one event_log row |
| SQL | `public.list_users` row object | adds `canSetPassword` boolean |
| export (new) | `generateMemberPassword` from `app/src/server/users/owner-password.ts` | Build step 6 |
| export (new) | `GENERATED_PASSWORD_ALPHABET` from `app/src/server/users/owner-password.ts` | Build step 6 |
| export (new) | `GENERATED_PASSWORD_LENGTH` from `app/src/server/users/owner-password.ts` | 16 |
| export (new) | `GENERATE_TRIES` from `app/src/server/users/owner-password.ts` | 10 |
| export (new) | `setOwnerPassword` from `app/src/server/users/owner-password.ts` | Build step 6 |
| export (new) | `buildOwnerPasswordEmail` from `app/src/server/users/owner-password.ts` | Build step 6 |
| type | `OwnerPasswordCode` | `'permission_denied' \| 'user_not_found' \| 'password_target_refused' \| 'db_unavailable'` |
| type | `OwnerPasswordResult` | `{ status: 200; body: { password: string; emailSent: boolean } } \| { status: 403 \| 404 \| 500; code: OwnerPasswordCode }` |
| type | `OwnerPasswordDeps` | `{ newPassword: (email: string) => string; setMemberPassword: (authUserId: string, password: string) => Promise<void>; sendEmail: typeof sendEmail }`; default `{ newPassword: (e) => generateMemberPassword(e), setMemberPassword, sendEmail }` (`sendEmail` from `app/src/server/email`) |
| export (new) | `setMemberPassword` from `app/src/server/auth/admin-auth.ts` | `(authUserId: string, password: string): Promise<void>`; throws `Error('admin_password_failed')` on any Auth error |
| export (exists) | `validateNewPassword` from `app/src/lib/auth/password-rules.ts` | `(password: string, email: string): PasswordProblem[]` |
| export (exists) | `sendEmail` from `app/src/server/email/index.ts` | input `SendEmailInput` (`app/src/server/email/types.ts:20-28`) |
| export (exists) | `appOrigin` from `app/src/server/errors/app-origin.ts` | email link |
| event | `user.password_set` | `log_only`; payload `{ membershipId: string; appUserId: string }`; never emitted (Decided "Event") |
| props | `SetPasswordDialog` | `{ row: UserRow; onClose: () => void }` |
| props | `UserInspector` | adds `onSetPassword: (row: UserRow) => void` |
| props | `UserMoreMenu` | adds `onSetPassword: (row: UserRow) => void` |
| data-testid | `user-set-password` | inspector button, only when `row.canSetPassword` |
| data-testid | `user-menu-set-password` | More menu item, only when `row.canSetPassword` |
| data-testid | `set-password-dialog` | `Dialog.Content`; carries `data-step` = `confirm` \| `pending` \| `shown` |
| data-testid | `set-password-confirm`, `set-password-cancel` | footer buttons in `confirm` and `pending` |
| data-testid | `set-password-value`, `set-password-copy`, `set-password-done` | the `<code>` and buttons in `shown` |
| data-testid | `set-password-error`, `set-password-offline`, `set-password-email-failed` | `p` lines (Decided rows) |
| Required from EZD-105c (QP-2) | `app/src/server/auth/admin-auth.ts` | the one server-only secret-key file with the invite session call (Q-0695 row 61), on the T34 list |
| Required from the event_log ticket (QP-2) | `private.write_event_log(p_action text, p_object_type text, p_object_id uuid, p_details jsonb, p_ip inet) returns void`; `eventLogIp(headers: Headers): string \| null` in `app/src/server/events/event-log.ts` | actor and tenant from the claims inside the function (Q-0695 03 row 33); `eventLogIp` returns a parseable IPv4 or IPv6 address or null (Decided "IP for event_log") |
| Required from EZD-105d, extended by EZD-106b (Q-0732 (a); Q-0722 (a)) | `UserMoreMenu({ row, … })` in `app/src/components/settings/users/UserMoreMenu.tsx` built on `Menu`/`MenuItem` | one menu per row |

### Connections
| Kind | Name | File:line | What changes |
| --- | --- | --- | --- |
| registry | `EVENTS`, `EventPayloads` | `app/src/lib/events/registry.ts:64`, `app/src/lib/events/registry.ts:134` | `user.password_set` |
| harness | `WRITE_PERMISSION_EXEMPTIONS` | `app/test-harness/permissions/write-exemptions.ts:30` | new entry (E1) |
| harness | `PRIVATE_EXECUTE.authenticated` | `app/test-harness/rls/private-execute.ts:22` | `private.owner_password_refusal(uuid)` (E2) |
| harness | `GATED_RPC_CALLS` | `app/test-harness/rls/gate.ts:141` | two entries (E3) |
| harness | `MONEY_ROUTE_CASES` | `app/test-harness/money/route-cases.ts:574` | one POST case (E4) |
| catalog | `en`, `es` | `app/src/server/messages/catalogs/en.ts:84`, `app/src/server/messages/catalogs/es.ts:91` | error keys; office keys after the last `office.users.` key |
| docs | service-key bullet | `docs/architecture.md:892` | names `setMemberPassword` |
| later code | EZD-104: `list_users`, its db test D1, `UserRow`, `listUsers` schema, `UserInspector`, `UsersPanel` (plan `vault/plans/EZD-104.md` lines 21, 22, 29, 136, 237) | `vault/tickets/phases/phase-01.md:11` | `canSetPassword` per row (E5); `onSetPassword`; dialog state |
| later code | EZD-106b: `UserMoreMenu` (plan `vault/plans/EZD-106.md` line 120) | `vault/tickets/phases/phase-01.md:13` | Set password item |
| later code | EZD-105c: the narrow admin file (plan `vault/plans/EZD-105.md` line 77) | `vault/tickets/phases/phase-01.md:12` | `setMemberPassword` |
| same-origin walk | `proxy.test.ts` walks every write `route.ts` | `app/src/server/auth/same-origin.ts:1`, `app/src/proxy.test.ts:1` | the new POST is covered with no edit |
| write scan | U8 `uncheckedWrites` | `app/src/server/permissions/write-routes.test.ts:31` | passes through the E1 exemption |
| shared list | private-execute | `app/src/server/db/rls.audit.test.ts:331` | `private.owner_password_refusal(uuid)` for `authenticated` (E2) |
| shared list | rls-table-grants | `app/src/server/db/rls.audit.test.ts:178` | no change: no table is created |
| shared list | seeded-by-trigger | `app/src/server/db/rls.api-gate.test.ts:29` | no change: no table or trigger is created |
| shared list | cap-lock-read-only | `app/src/server/db/cap-locks.db.test.ts:39` | no change: none of the new functions calls `count(` (they use `exists`) |
| shared list | money-route-cases | `app/src/server/db/money-routes.test.ts:141` | one POST case (E4) |
| shared list | secret-key-clients | `app/src/server/db/test-only-functions.test.ts:207` | no change: no file in this ticket names `createJobsDbClient`; EZD-105c's admin file builds its own client |

### Shared lists
| List | Test file | Current value | New value |
| --- | --- | --- | --- |
| write exemptions | `app/src/server/permissions/write-routes.test.ts` (U8 b, d) | 6 entries | 7: `{ path: 'app/src/app/api/settings/users/[id]/password/route.ts', reason: 'Owner preset, no switch; checked inside owner_password_target and record_member_password_set, Q-0096 P4 (EZD-105b)' }` |
| private execute | `app/src/server/db/rls.audit.test.ts` (via `PRIVATE_EXECUTE`) | no `owner_password_refusal` | `{ fn: 'private.owner_password_refusal(uuid)', reason: 'called by public.list_users (security invoker) for canSetPassword; Owner-set password (EZD-105b)' }` in `authenticated` |
| gated RPC calls | `app/src/server/db/rls.api-gate.test.ts` T22 (c), (j) | no entries for this ticket | `{ fn: 'owner_password_target', args: { p_membership_id: '00000000-0000-4000-8000-000000000000' } }`, `{ fn: 'record_member_password_set', args: { p_membership_id: '00000000-0000-4000-8000-000000000000', p_ip: null } }` |
| money route cases | `app/src/server/db/money-routes.test.ts` C1, M1, M2 | no case for the route | `{ file: \`${API}settings/users/[id]/password/route.ts\`, method: 'POST', load: () => import('../../src/app/api/settings/users/[id]/password/route'), request: async (env) => ({ request: new Request(\`${BASE}/api/settings/users/${env.member.membershipId}/password\`, { method: 'POST' }), params: { id: env.member.membershipId } }), expectStatus: 403, note: 'EZD-105b: the harness member has no Owner preset; 403 permission_denied (no money)' }` |

### Data flow
| Hop | From | To | Exact name |
| --- | --- | --- | --- |
| 1 | `UserMoreMenu` item or inspector button | panel state | `onSetPassword(row)` → `setPasswordFor(row)` |
| 2 | `SetPasswordDialog` confirm | route | `fetch(\`/api/settings/users/${row.membershipId}/password\`, { method: 'POST', credentials: 'same-origin' })` |
| 3 | route | server function | `setOwnerPassword(createSessionClient(), id, eventLogIp(request.headers))` |
| 4 | server function | SQL | `rpc('owner_password_target', { p_membership_id })` → `private.owner_password_refusal` |
| 5 | server function | Auth | `setMemberPassword(authUserId, password)` → `auth.admin.updateUserById` |
| 6 | server function | SQL | `rpc('record_member_password_set', { p_membership_id, p_ip })` → `private.end_user_sessions`, `private.write_event_log` |
| 7 | server function | email | `sendEmail(buildOwnerPasswordEmail(…))` |
| 8 | response | dialog state | `{ password, emailSent }` → step `shown` |

### Live site
| Database object | Main's caller | How main keeps working |
| --- | --- | --- |
| `private.owner_password_refusal`, `public.owner_password_target`, `public.record_member_password_set` (new) | none | new objects; main never calls them |
| `public.list_users` (redefined) | none (created in phase 7, not on main) | the redefinition only adds a key |

## 4. Tests
Every new file wraps its tests in a top-level `describe('EZD-105b …')`. Fixtures: `app/test-harness/rls/fixtures.ts` (`createTenant`, `createMember`, `signIn`, `adminDb`, `harnessSql`, `sessionCount`, `cleanup`, `closeHarness`), `app/test-harness/permissions/grant.ts` (`setPermissions`); browser tests import from `app/test-harness/e2e/test.ts` (`test`, `expect`, `signInAs`, `sessions`, `createMember`, `createTenant`, `setPermissions`, `adminDb`, `readStubOutboxDir`, `expectTouchTargets`). A role is set as the EZD-104 plan says (`vault/plans/EZD-104.md:224`): `adminDb().from('role').select('id').eq('tenant_id', t).eq('preset', p)` then `adminDb().from('membership').update({ role_id })`; names with `adminDb().from('app_user').update({ name })`. Preset key arrays come from `supabase/migrations/20261024100001_create_permission_catalog.sql:22-31`; Owner = `PERMISSION_KEYS`. Route tests mock `next/headers` and sign members in with a cookie store each, copied from `app/src/app/api/profile/password/route.test.ts:1-60`. Passwords are compared only through whether a sign-in succeeds (L-018), except the shape checks of G1 and R1.

Component tests (C1-C4) use one `UserRow` literal, `ROW`: `{ membershipId: '11111111-1111-4111-8111-111111111111', status: 'active', name: 'Ann Lee', email: 'ann@example.test', language: 'en', role: { name: 'Designer', preset: 'designer', defaultPermissions: [] }, grantedKeys: [], lastActiveAt: null, invitedAt: null, canCopyLink: false, canSetPassword: true }`, plus any field EZD-106a adds to `UserRow` with its zero value (`false`, `null` or `[]`). C2's URL is `/api/settings/users/11111111-1111-4111-8111-111111111111/password`. `{name}` reads "Ann Lee".

Common fixture "tenant A" (D1-D5, R1-R2): O = Owner preset, all 37 keys, name `Zed Owner`; D = Designer preset keys, name `Ann Lee`; F = Foreman preset keys; I = invited (`createMember({ status: 'invited' })`, Crew keys); X = deactivated; O2 = Owner preset, all keys; H = custom role `Office lead` (`adminDb().from('role').insert({ tenant_id, name: 'Office lead', default_permissions: ['settings_users'] })`) with keys `['settings_users']`; N = `createTestMember({ tenantId: A, status: 'active' })` from `app/test-harness/auth-users.ts:29` (its `app_user.auth_user_id` is null); U = `createTestMember({ tenantId: A, status: 'active' })`, then `createUnconfirmedPasswordUser(U.email, await randomPassword(U.email))` (`auth-users.ts:116`, `:85`; the admin API skips the sign-up hook, architecture "Auth and session"), then `adminDb().from('app_user').update({ auth_user_id }).eq('id', U.appUserId)`; M = `createMember({ tenantId: A, scope: 'all' })` with Designer role and keys, plus `addMembership({ appUserId: M.appUserId, tenantId: B, status: 'invited' })` (`auth-users.ts:55`); C37 = `createMember` with a custom role `Full custom` (`adminDb().from('role').insert({ tenant_id: A, name: 'Full custom', default_permissions: PERMISSION_KEYS })`, then `role_id` set and `setPermissions(A, C37.membershipId, PERMISSION_KEYS)`); S = Designer preset keys plus `settings_users`; O3 = Owner preset with every key except `settings_users` (`setPermissions(A, O3.membershipId, PERMISSION_KEYS.filter((k) => k !== 'settings_users'))`). Tenant A `contact` = `{ "email": "office@example.test" }` (`harnessSql` update). Tenant B: Y = active member. `afterAll` runs `cleanupTestMembers()` (`auth-users.ts:131`, removes N, U and U's auth user, and M's tenant B membership) and then `cleanup()` and `closeHarness()`.

### Tests
| Test | AC | Type | Input | Expected value | Source of the expected value | Fixture | Wait method | Gate scope | CI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 `app/src/server/users/owner-password.db.test.ts` "target refusals" | AC-1 | db | O calls `rpc('owner_password_target', { p_membership_id })` through `signIn(O.email).serverDb` for D, F, O, I, X, O2, O3, H, C37, N, U, M, Y's membership and `randomUUID()` | D and F: one row `{ auth_user_id: <their authUserId>, email: <their email> }`; O, I, X, O2, O3, H, C37, N, U, M: error code `P0001`, message `password_target_refused`; Y and the random id: `P0002`, `user_not_found` | Decided "Whose password may be set" (QP-1 (a)); Q-0096 P4 | tenant A, B | awaits only | phase 7 | yes |
| D2 same file "callers" | AC-1 | db | S calls it for D; C37 (custom role `Full custom`, all 37 keys) calls it for D; O3 (Owner preset without `settings_users`) calls it for D | S and C37: `42501`, `permission_denied`; O3: one row for D | Q-0096 P4; Q-0695 (10 row 59) | tenant A | awaits only | phase 7 | yes |
| D3 same file "record ends sessions and logs once" | AC-3, AC-4 | db | D signed in twice (`signIn(D.email)` ×2); O calls `rpc('record_member_password_set', { p_membership_id: D.membershipId, p_ip: '203.0.113.7' })` | `sessionCount(D.authUserId)` ≥ 2 before, 0 after; `sessionCount(O.authUserId)` ≥ 1 after; return row `{ tenant_id: A, member_app_user_id: D.appUserId, member_email: D.email, member_name: 'Ann Lee', actor_label: 'Zed Owner', company_name: <tenant A name>, company_reply_to: 'office@example.test' }`; `select … from public.event_log where object_id = D.membershipId` gives exactly 1 row: `tenant_id` A, `actor_app_user_id` O.appUserId, `action` `'user.password_set'`, `object_type` `'membership'`, `details` `{ "appUserId": D.appUserId }`, `ip` `'203.0.113.7'` | Q-0096 P7; Q-0695 (03 row 33); Decided "event_log row", "`actor_label`", "`company_reply_to`"; 203.0.113.7 is a documentation address (RFC 5737) | tenant A | awaits only | phase 7 | yes |
| D4 same file "record refusal and one transaction" | AC-4 | db | (a) `signIn(D.email)` right before, then S calls `record_member_password_set` for D; (b) inside `withRollback(harnessSql(), tx)`: create `private.ezd105b_fail_log()` (`returns trigger`, raises `'ezd105b_log_fail'`) and `create trigger ezd105b_fail_log before insert on public.event_log for each row when (new.object_id = '<F.membershipId>') execute function private.ezd105b_fail_log()`, read `count(*)` of `auth.sessions` for F, `set local role authenticated`, set `request.jwt.claims` to O's claims (`claimsOf`), call `select * from public.record_member_password_set('<F.membershipId>', null)` inside `tx.savepoint`, `reset role`, read the count again (confirm on pinned version, L-009) | (a) `42501`; D's session count is ≥ 1 before and the same after; no event_log row for D's id from this call; (b) the call rejects with a message containing `ezd105b_log_fail`; F's session count after equals before and is ≥ 1 | Q-0695 (03 row 33: same transaction); AC-EZD-105b-4 | tenant A; F signed in once | awaits only; the trigger is rolled back with the transaction, so no other file sees it | phase 7 | yes |
| D5 same file "list_users canSetPassword" | AC-1 | db | O, then S, call `rpc('list_users', { p_search: '', p_page: 1 })` | O: `canSetPassword` true for D, F; false for O, O2, O3, H, C37, I, M, N, U (and X when listed); S: false for every row | Decided "One predicate"; Q-0706 precedent (per-row flag) | tenant A | awaits only | phase 7 | yes |
| D6 same file "grants" | AC-1 | db | `has_function_privilege(role, fn, 'execute')` through `harnessSql` for `anon`, `authenticated`, `service_role` on the three new functions | `authenticated` true for all three; `anon` and `service_role` false for all three | section 1 "Grants"; L-016 | none | awaits only | phase 7 | yes |
| G1 `app/src/server/users/owner-password.test.ts` "generated passwords" | AC-2 | unit | 200 calls of `generateMemberPassword('ann@example.test')` | each has length 16 and matches `/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{16}$/`; `GENERATED_PASSWORD_ALPHABET.length` 56 and contains none of `I`, `O`, `l`, `o`, `0`, `1`; the 200 values are all different | Q-0096 P3 (16); Decided "Password maker" | none | sync | phase 7 | yes |
| G2 same file "validateNewPassword retries" | AC-2 | unit | email `ann@example.test` in (a) and (c) (local part `ann` is under 4 characters, so only `contains_app_name` can refuse); (a) `randomIndex` fake returning the alphabet indexes of `ezdraftABCDEFGHJ` for the first 16 calls, then index 0; (b) email `kmnp@example.test` and a fake whose first 16 indexes spell `kmnpABCDEFGHJKLM`, then index 1 for every later call; (c) a fake that always spells `ezdraftezdraftez` | (a) returns `AAAAAAAAAAAAAAAA` after 32 calls; (b) returns `BBBBBBBBBBBBBBBB` after 32 calls; (c) throws `owner_password_generate_failed` after exactly 160 calls (10 × 16) | `app/src/lib/auth/password-rules.ts:13` (`contains_app_name`, `contains_email_name`); `GENERATE_TRIES` 10 | none | sync | phase 7 | yes |
| S1 same file "order and email" | AC-2, AC-3 | unit | fake client whose `rpc` answers `owner_password_target` with `[{ auth_user_id: 'a1', email: 'ann@example.test' }]` and `record_member_password_set` with one row (`tenant_id: 't1'`, `member_app_user_id: 'u1'`, `member_email: 'ann@example.test'`, `actor_label: 'Zed Owner'`, `company_name: 'Worth Properties'`, `company_reply_to: 'office@example.test'`); deps fakes record calls; `newPassword` returns `'P'.repeat(16)`; `sendEmail` resolves `{ status: 'sent', link }` | call order `owner_password_target`, `newPassword`, `setMemberPassword('a1', 'PPPPPPPPPPPPPPPP')`, `record_member_password_set` (with `p_ip` `'203.0.113.7'`), `sendEmail`; `emit` from `app/src/server/events` (spied with `vi.mock`) is never called; result `{ status: 200, body: { password: 'PPPPPPPPPPPPPPPP', emailSent: true } }`; the email input is `{ to: 'ann@example.test', subject: 'A new password was set for your EZ Draft account', paragraphs: [<section 6 body with actor Zed Owner and email ann@example.test>], link: { url: appOrigin(env), label: 'Open EZ Draft' }, company: { name: 'Worth Properties', replyTo: 'office@example.test' }, lang: 'en' }` and no field contains `PPPPPPPPPPPPPPPP` | Decided "`setOwnerPassword` steps", "Email"; section 6 | none | awaits only | phase 7 | yes |
| S2 same file "failures after the check" | AC-3, AC-4 | unit | (a) `setMemberPassword` rejects; (b) `record_member_password_set` answers error `{ code: 'XX000' }`; (c) it answers `{ code: '42501' }`; `reportError` spied (`vi.mock('../errors/report')`) | (a) `{ status: 500, code: 'db_unavailable' }`, no `record_member_password_set` call, no emit, no email, one report with message `owner_password_admin_failed`; (b) `{ 500, 'db_unavailable' }`, no emit, no email, report `owner_password_record_failed`; (c) `{ 403, 'permission_denied' }`, report `owner_password_record_refused`; in every case no reported message and no result field contains the password | Decided "`setOwnerPassword` steps"; "Secrets" | none | awaits only | phase 7 | yes |
| S3 same file "email failures" | AC-3 | unit | (a) `sendEmail` resolves `{ status: 'failed' }`; (b) `sendEmail` rejects | (a) 200 with the password, `emailSent` false, no report from this module; (b) 200 with the password, `emailSent` false, one report `owner_password_email_failed` | Decided "`setOwnerPassword` steps"; R26 R16 | none | awaits only | phase 7 | yes |
| S4 same file "target mapping" | AC-1 | unit | `owner_password_target` answers error code `42501`, `P0002`, `P0001`, `XX000`, and `[]` (no row) | 403 `permission_denied`, 404 `user_not_found`, 403 `password_target_refused`, 500 `db_unavailable`, 500 `db_unavailable`; `newPassword` and `setMemberPassword` never called | Decided "`setOwnerPassword` steps" | none | awaits only | phase 7 | yes |
| S5 same file "one admin file" | AC-4 | unit (static) | every non-test `.ts`/`.tsx` file under `app/src` (test files: names containing `.test.` or `.spec.`) | files containing `updateUserById`: exactly `['app/src/server/auth/admin-auth.ts']`; files containing `.auth.admin.`: exactly `['app/src/server/auth/admin-auth.ts']`; `owner-password.ts` imports `setMemberPassword` from `'../auth/admin-auth'` | AC-EZD-105b-4; Q-0695 (10 row 65) | none | sync | phase 7 | yes |
| R1 `app/src/app/api/settings/users/[id]/password/route.test.ts` "Owner sets a password" | AC-2, AC-3 | route (local stack) | D signed in twice; `clearStubOutbox()`; O's cookie store; `POST(new Request(<url>, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, body: '{"password":"Typed-Pass-123456"}' }), { params: Promise.resolve({ id: D.membershipId }) })` | status 200; `Cache-Control` `no-store`; body keys exactly `['emailSent', 'password']`, `emailSent` true, `password` matches the G1 pattern; `sessionCount(D.authUserId)` 0; a fresh anon client's `auth.signInWithPassword({ email: D.email, password: body.password })` has no error and with `'Typed-Pass-123456'` has an error; `readStubOutbox()` holds exactly 1 message to D.email with subject `'A new password was set for your EZ Draft account'` whose text contains `Zed Owner` and not the password; one event_log row for D's membership with `ip` `'203.0.113.9'` | Q-0096 P3, P5, P7; section 6 | tenant A | awaits only | phase 7 | yes |
| R2 same file "refusals" | AC-1 | route (local stack) | (a) no cookie; (b) O, ids `'not-a-uuid'`, `''` and a 37-character string (a UUID plus `0`); (c) O, Y's membership id; (d) O, I's membership id; (e) `signIn(D.email)` right before, then S for D; (f) O3 for F, with header `x-forwarded-for: not-an-ip` | (a) 401 `not_signed_in`; (b) each of the three, and (c), 404 `{ error: { code: 'user_not_found', message_key: 'error.user_not_found' } }`; (d) 403 `password_target_refused`, `message_key` `error.password_target_refused`; (e) 403 `{ code: 'permission_denied', message_key: 'error.not_authorized' }`, D's session count ≥ 1 before and the same after, no outbox message; (f) 200, and F's new event_log row has `ip` null | Decided "Route order", "Whose password may be set"; Q-0096 P4 | tenant A, B | awaits only | phase 7 | yes |
| C1 `app/src/components/settings/users/set-password-dialog.test.tsx` "confirm and cancel" | AC-2 | component (jsdom) | render `SetPasswordDialog` with `ROW` inside `MessagesProvider` and `StateHost`; `fetch` spied | `set-password-dialog` `data-step="confirm"`; title "Set a password for Ann Lee"; body text of section 6; no `input` or `textarea` in the dialog; Cancel calls `onClose` once and `fetch` 0 times | section 6; Q-0096 P3 | `ROW` | `findBy*` | phase 7 | yes |
| C2 same file "generate, copy, done" | AC-2 | component | `fetch` resolves after a held promise with 200 `{ password: 'Ab3dEf6hJk8mNp9q', emailSent: true }`; double click `set-password-confirm` while held; then release; click `set-password-copy` with `navigator.clipboard.writeText` mocked to resolve; click `set-password-done` | `fetch` called exactly once with `'/api/settings/users/11111111-1111-4111-8111-111111111111/password'` and `{ method: 'POST', credentials: 'same-origin' }` and no `body`; while held `data-step="pending"`, the confirm button is disabled and reads "Setting password…", and Escape does not call `onClose`; then `data-step="shown"`, `set-password-value` text `Ab3dEf6hJk8mNp9q`; `writeText` called with it; toast "Password copied"; Done calls `onClose` once | Decided "Dialog steps", "Copy", "Two presses at once"; L-062 | `ROW` | held promise | phase 7 | yes |
| C3 same file "errors, offline, email failed, copy failed" | AC-2, AC-3 | component | (a) 403 `{ error: { code: 'password_target_refused' } }`; (b) 403 `{ error: { code: 'permission_denied' } }`; (c) 404; (d) 500; (e) `fetch` rejects; (f) offline (`navigator.onLine` false, `offline` event); (g) 200 with `emailSent: false`; (h) `writeText` rejects | (a) `set-password-error` "You can't set a password for this person."; (b) "You don't have permission to do that."; (c) "This person is no longer in your company."; (d), (e) "Couldn't set the password. Try again." and `data-step="confirm"` with the confirm button enabled; (f) confirm disabled and `set-password-offline` "You're offline. Connect to set a password."; (g) `set-password-email-failed` "We couldn't email Ann Lee. Tell them their password was changed."; (h) toast "Couldn't copy. Select the password and copy it." | Decided "Dialog error text", "Offline", "Email failed", "Copy"; section 6; `en.ts:15` | `ROW` | `findBy*` | phase 7 | yes |
| C4 same file "menu item and inspector button" | AC-1 | component | render `UserMoreMenu` (props of EZD-106b's section 3, every callback a `vi.fn()`, plus `onSetPassword`) and `UserInspector` (exported from `UsersPanel.tsx`, EZD-104 Build step 11; `{ row, onClose: vi.fn(), onSetPassword }` plus any EZD-106b props as `vi.fn()`) inside `MessagesProvider`, for a row with `canSetPassword` true, then false; open the menu with its trigger | true: `user-menu-set-password` and `user-set-password` present, each click calls `onSetPassword` once with the row; false: neither present | Decided "Inspector section"; Build step 13 | `ROW`, then `{ ...ROW, canSetPassword: false }` |  `findBy*` | phase 7 | yes |
| B1 `app/e2e/settings-users-password.spec.ts` "owner sets a member's password" | AC-1, AC-2, AC-3 | browser (desktop, untagged) | new tenant: O (Owner, all keys), D (Designer keys); `sessions.open([D.email])` and D's page on `/settings/company`; O signs in, opens `/settings/users`, clicks D's row, clicks `user-set-password`, then `set-password-confirm` | `set-password-dialog` `data-step="shown"`; `set-password-value` text matches the G1 pattern; `expectTouchTargets(page, <locator>)` passes with ≥ 1 checked on the inspector's `section` holding `user-set-password`, on the open menu holding `user-menu-set-password` (opened once before the dialog), and with ≥ 2 checked on the dialog in `confirm` and in `shown`; `set-password-value` computed `font-size` `16px` and `user-select` `all`; after Done, opening D's row menu shows `user-menu-set-password`; D's page reload ends on `/sign-in` (`waitForURL`); `readStubOutboxDir(process.env.EMAIL_STUB_DIR)` has exactly 1 message to D.email with the R1 subject; a new browser context signs D in with the shown password (the `my-profile.spec.ts:92-97` steps) | Q-0096 P3, P7, P10; 11 Accessibility (44 px) | new tenant per test, removed in `afterAll` by `cleanup()` | `waitForURL`, `expect.poll` on the outbox | phase 7; run `pnpm --filter @ezdraft/app exec playwright test e2e/settings-users-password.spec.ts --project desktop` | yes |
| B2 same spec "no Set password without the Owner preset" | AC-1 | browser (desktop, untagged) | new tenant: S (Designer keys plus `settings_users`), D (Designer); S opens `/settings/users`, selects D, opens D's More menu | no `user-set-password` and no `user-menu-set-password` on the page | Q-0096 P4; Decided "Who may set" | new tenant per test | `expect(...).toHaveCount(0)` after the inspector shows D's name | phase 7; same command as B1 | yes |
| E1 `app/test-harness/permissions/write-exemptions.ts` | AC-1 | harness edit | the entry of section 3 "Shared lists" | U8 (b) and (d) pass with 7 entries | Decided "Route permission check" | none | sync | phase 7 | yes |
| E2 `app/test-harness/rls/private-execute.ts` | AC-1 | harness edit | the `authenticated` entry of "Shared lists" | `rls.audit.test.ts` passes | section 1 "Grants" | none | sync | full | yes |
| E3 `app/test-harness/rls/gate.ts` | AC-1 | harness edit | the two `GATED_RPC_CALLS` entries of "Shared lists" | `rls.api-gate.test.ts` T22 (c), (j) pass | section 1 "Database functions" (`require_api_gate`) | none | awaits only | full | yes |
| E4 `app/test-harness/money/route-cases.ts` | AC-1 | harness edit | the case of "Shared lists", after the last case (line 573) | C1 counts the new method; M1, M2 get 403 with no money field | `app/test-harness/money/route-cases.ts:1-4` (one case per method) | money harness member (no Owner preset) | awaits only | full | yes |
| E6 every existing test that builds a `UserRow` or a `list_users` row, or renders `UserInspector` or `UserMoreMenu` (found at build time with `grep -rln -e canCopyLink -e UserInspector -e UserMoreMenu app/src app/e2e`, test files only) | AC-1 | test edit | each `UserRow` literal or mocked row | adds `canSetPassword: false`; each `UserInspector` or `UserMoreMenu` render adds `onSetPassword={vi.fn()}`; no expected value changes | Build steps 3, 4, 13, 14 (required field and prop) | those files | as each file | phase 7 | yes |
| E5 `app/src/server/users/users.db.test.ts` D1 (EZD-104) | AC-1 | test edit | D1's row expectations | V (Owner viewer, self) `canSetPassword` false; D (Designer) and F (Foreman) true; C (invited) false | Decided "Whose password may be set" | EZD-104 D1 fixture | awaits only | phase 7 | yes |

28 rows: 21 new tests (D1-D6, G1-G2, S1-S5, R1-R2, C1-C4, B1-B2) and 6 edits (E1-E6); nothing else.

Wrong implementation each row rejects, and what the code before this ticket gives (L-050, L-036):
| Test | Rejects | Before this ticket |
| --- | --- | --- |
| D1 | checking `settings_users` instead of the Owner preset; letting an Owner set a peer Owner's, a `settings_users` holder's, their own, an invited or another company's member's password | `owner_password_target` does not exist (42883) |
| D2 | a permission-switch check (S holds `settings_users` and is refused; Owner without it passes) | function missing |
| D3 | ending sessions outside the function, or writing no row or two rows | function missing |
| D4 | writing the log row in a separate transaction (sessions would end although the log write failed) | function missing |
| D5 | a flag computed in the browser or from a second rule (S sees no flag; O's self row is false) | rows have no `canSetPassword` key |
| D6 | relying on default privileges (L-016) | functions missing |
| G1 | `Math.random`, a short or look-alike alphabet, a fixed password | module missing |
| G2 | skipping `validateNewPassword`, looping forever | module missing |
| S1 | setting the password before the check, emailing the password, emitting a second record | module missing |
| S2 | recording or emailing after a failed Auth call; returning the password after a failed record | module missing |
| S3 | failing the request because the email failed | module missing |
| S4 | calling Auth after a refusal | module missing |
| S5 | a second file holding the admin call | `updateUserById` appears nowhere |
| R1 | reading a typed password from the body; leaving sessions alive; storing the throttle /64 key as the IP | route answers 404 (no route) |
| R2 | 500 for a malformed id or a bad forwarded header; a switch check | route answers 404 |
| C1 | a password text field; sending on open | component missing |
| C2 | two requests on a double click; closing while pending | component missing |
| C3 | raw server text; silent email or copy failure | component missing |
| C4 | showing the controls without the flag | no Set password control |
| B1 | the whole flow broken end to end; touch targets under 44 px | no Set password control |
| B2 | controls shown to a non-Owner holder of `settings_users` | no Set password control |
| E1-E6 | stale harness lists and fixtures | lists and literals without this ticket's entries |

### Regression list
| Test file | Test name | Why |
| --- | --- | --- |
| `app/src/server/permissions/write-routes.test.ts` | U8 (b), (d) | new write route and exemption |
| `app/src/server/db/money-routes.test.ts` | C1, M1, M2 | new route method |
| `app/src/server/db/rls.audit.test.ts` | the audit (`@smoke`) | new private function grant |
| `app/src/server/db/rls.api-gate.test.ts` | T22 (c), (j) (`@smoke`) | new gated functions |
| `app/src/server/auth/session.test.ts` | EZD-007c T34 | no new `@supabase/*` importer (EZD-105c owns the file) |
| `app/src/proxy.test.ts` | the same-origin walk | new POST route |
| `app/src/server/permissions/policies.db.test.ts` | D4 | the new private function reads `user_permission` and `role` but no policy calls it |
| `app/src/app/api/profile/password/route.test.ts` | EZD-108 T7, T8 | password emails and session ending stay unchanged |

Not at develop HEAD yet, so not rows above: EZD-104's `app/src/server/users/users.db.test.ts` (D1-D3; `list_users` redefined; D1 is edit E5) and `app/e2e/settings-users.spec.ts` (EZD-104 and EZD-106b browser tests; the inspector and menu gain an item). The gate runs both in phase 7 scope.

## 5. Visual checklist

### Visual checklist
Viewport: desktop 1600 × 1000. Board S15 has no Set password (Q-0696); the rows below follow the board's inspector and dialog parts.
| Element | State (empty / loading / error / filled / no permission) | Mockup |
| --- | --- | --- |
| Inspector "Password" section: label, then "Set password" button (default `StateButton`, 44 px tall on coarse pointers), between the language helper text and "Permissions", with a 1 px `--ez-border` top rule and 14 px 18 px padding | filled (Owner viewer, eligible member) | S15 inspector blocks (not drawn; Q-0696 (a)) |
| Inspector without the section | no permission (viewer without the Owner preset, or an ineligible member) | S15 inspector |
| More (…) menu item "Set password" after Edit | filled | S15 row "…" (menu not drawn; EZD-106b) |
| Dialog confirm step: 440 px outer width, title 18 px semibold, body 14 px slate, footer Cancel then primary "Set password" | filled | Customers dialog (S15a) parts |
| Dialog pending: primary reads "Setting password…", disabled | loading | not on a mockup |
| Dialog error line in red 12 px above the footer | error | not on a mockup |
| Dialog shown step: password in a 16 px mono box with border and 8 px radius, help line, Copy and Done | filled | not on a mockup |
| Offline line and disabled confirm | offline | not on a mockup |

### Component tree
| Component | New / change | Copies | Parent |
| --- | --- | --- | --- |
| `SetPasswordDialog` | new | `CustomerDialog` | `UsersPanel` |
| `UserInspector` | change | itself (EZD-104, EZD-106b) | `UsersPanel` |
| `UserMoreMenu` | change | itself (EZD-106b) | the users table row |
| `UsersPanel` | change | itself | the Users page |

### Screen states
| Screen | State | Mockup | What shows |
| --- | --- | --- | --- |
| Users inspector | filled, eligible member, Owner viewer | not on a mockup | Password section with Set password |
| Users inspector | ineligible member or non-Owner viewer | S15 inspector | no Password section |
| Set password dialog | confirm | not on a mockup | title, body, Cancel, Set password |
| Set password dialog | loading | not on a mockup | Setting password… disabled |
| Set password dialog | error | not on a mockup | error line; Set password again |
| Set password dialog | offline | not on a mockup | offline line; Set password disabled |
| Set password dialog | shown | not on a mockup | password, help line, Copy, Done; email-failed line when `emailSent` is false |
| Set password dialog | partial | not on a mockup | none: the dialog has no partial state |
| Set password dialog | no permission | not on a mockup | not reachable: the controls are hidden; a race shows the 403 text |

### Interactions
| Control | Input | Behaviour | Drag threshold | Size and position | Tap area |
| --- | --- | --- | --- | --- | --- |
| `user-set-password` | click, tap, Enter, Space | opens the dialog | none | full width of the inspector section less padding | 44 px (`StateButton` `touch.target`) |
| `user-menu-set-password` | click, Enter (Menu keys) | closes the menu, opens the dialog | none | menu row | 44 px (the item class `UserMoreMenu` gives its other items; 11 Accessibility 44 px rule) |
| `set-password-confirm` | click, Enter | sends once; disabled while pending and offline | none | footer right | 44 px |
| `set-password-cancel` | click, Escape | closes in `confirm`; disabled in `pending` | none | footer, left of confirm | 44 px |
| `set-password-copy` | click | copies, toast | none | footer | 44 px |
| `set-password-done` | click, Escape, overlay click | closes, forgets the password | none | footer right | 44 px |

### Neighbours
| Element | Owner ticket | How it sits |
| --- | --- | --- |
| Inspector language block and Permissions list | EZD-106b | the Password section sits between them |
| Inspector footer (Unsaved, Reset, Save) | EZD-106b | unchanged; Set password does not count as an unsaved edit |
| More (…) menu items | EZD-106b, EZD-105d (Q-0722) | Set password after Edit |
| Toasts | EZD-015b | bottom toast viewport (z-index 102 over the dialog's 101) |

### Viewports
| Viewport | Size | Applies |
| --- | --- | --- |
| Desktop | 1600 × 1000 | yes (Settings is an office screen) |
| iPad landscape | 1180 × 820 | not tested in this ticket |
| Phone | — | no (S15 has no phone layout) |

## 6. Proposed wording
English unless marked es. Keys follow the `office.profile.*` password style (`en.ts:359-378`). "Set password" itself is Q-0096 P10's name for the control.
| Where | Text |
| --- | --- |
| `office.users.set_password` (menu item, inspector button, confirm button) | Set password |
| `office.users.password_section` (inspector label) | Password |
| `office.users.set_password_title` | Set a password for {name} |
| `office.users.set_password_body` | EZ Draft makes a new 16-character password for {name}. They are signed out on every device and get an email that their password was set. |
| `office.users.set_password_pending` | Setting password… |
| `office.users.set_password_shown_title` | New password for {name} |
| `office.users.set_password_shown_help` | Copy it now and give it to {name}. You won't see it again. |
| `office.users.set_password_copy` | Copy |
| `office.users.set_password_done` | Done |
| `office.users.set_password_copied` (toast) | Password copied |
| `office.users.set_password_copy_failed` (toast) | Couldn't copy. Select the password and copy it. |
| `office.users.set_password_email_failed` | We couldn't email {name}. Tell them their password was changed. |
| `office.users.set_password_failed` | Couldn't set the password. Try again. |
| `office.users.set_password_offline` | You're offline. Connect to set a password. |
| `office.users.password_email_subject` (email) | A new password was set for your EZ Draft account |
| `office.users.password_email_body` (email) | {actor} set a new password for your EZ Draft account ({email}) and signed you out on every device. Ask {actor} for the new password. If you weren't expecting this, contact your company right away. |
| `error.user_not_found` | This person is no longer in your company. |
| `error.user_not_found` (es) | Esta persona ya no está en tu empresa. |
| `error.password_target_refused` | You can't set a password for this person. |
| `error.password_target_refused` (es) | No puedes poner una contraseña para esta persona. |

Nothing else: no other user-visible text is added.

## 7. Security review
security-review: yes. Areas: auth (a password set through the Auth admin API with the secret key on a request path; sessions ended), permissions (a write route with no permission switch, Owner preset checked in the database; a new `WRITE_PERMISSION_EXEMPTIONS` entry), data access (definer functions reading `auth.users` and other tenants' memberships), API (new POST route), migrations (three functions, one redefinition, grants).
Reviewers needed: code-reviewer · calc-auditor no · ui-verifier yes · security-reviewer yes.

## 8. Complexity and model recommendation
high: a secret-key Auth call on a request path, two definer functions with tenant, caller and target checks, a fixed step order across Auth and the database whose failure states must stay safe, session ending and a same-transaction audit row (PROCESS.md section 4). Recount without the one-line harness edits (code-reviewer phase 7 finding 6): 20 files, the 15 Build steps (one of them, `database.types.ts`, generated) plus the 5 new test files (`owner-password.db.test.ts`, `owner-password.test.ts`, `[id]/password/route.test.ts`, `set-password-dialog.test.tsx`, `e2e/settings-users-password.spec.ts`); 21 new tests. Not counted: E1 to E4 (one list entry each in 4 harness files) and E5, E6 (a `canSetPassword: false` field or an `onSetPassword={vi.fn()}` prop added to existing test literals, no expected value changed). Neither count is over the limit (PROCESS.md section 6 "Ticket size": over 20 files or over 25 tests; Josh 2026-10-22), so no split. Test-author Opus 5.5, builder Opus 5.5.

## 9. Dependencies
- From the row: EZD-106 (both parts: `list_users` redefinition and `UserRow` via EZD-104, the member items of `UserMoreMenu` and the inspector body from EZD-106b), EZD-033 (`validateNewPassword`, the unconfirmed-password guard; done).
- Missing from the row:
  - EZD-104 (`UsersPanel`, `UserInspector`, `UserRow`, `list_users`; reached through EZD-106).
  - EZD-105c (the narrow admin file, `app/src/server/auth/admin-auth.ts`; AC-EZD-105b-4). Not covered by "EZD-106"; add EZD-105c to `depends_on` (Q-0732 (a)).
  - EZD-109, the ticket that creates `event_log`, `private.write_event_log` and `eventLogIp` (Q-0720 (c), Q-0734 (a): built before EZD-105b). Add it to `depends_on` (Q-0732 (a)).
  - EZD-105d (creates `UserMoreMenu.tsx`, Q-0722 (a)); reached through EZD-106b, which depends on it.
  - EZD-016a (browser harness; this plan has a visual checklist; done).
  - Done: EZD-101 (`role`, `user_permission`), EZD-102 (`requireApiSession`, write scan U8), EZD-007c (`createSessionClient`), EZD-008a (`sendEmail`, stub outbox), EZD-015b (`useToast`, `StateButton`), EZD-018 (`end_user_sessions` pushes `session.ended`), EZD-022 (event registry), EZD-108 (`Menu`, password email pattern), EZD-133 (money route harness), EZD-346 (same-origin walk).
- Questions this plan follows besides its own: Q-0696 (escalated design), Q-0720 (c), Q-0722 (a) (both answered-agent).

### Risks
| Risk | What could break | Gate notices it | Covered by |
| --- | --- | --- | --- |
| A later ticket redefines `list_users` from an older body | `canSetPassword` disappears | yes | D5, E5 |
| The route reaches Auth before the check | a non-Owner sets a password | yes | S4 (no `setMemberPassword` call on refusal), R2 (e) |
| Password leaks to logs or reports | secret exposure | partly | S1, S2 (no field or report holds it); security-reviewer reads the diff |
| `record_member_password_set` fails after Auth changed the password | old sessions stay until retry | yes | S2 (b), D4 |
| `private.owner_password_refusal` becomes a policy helper | breaks the "policies never read permission rows" rule | yes | `policies.db.test.ts` D4 |
| Per-row predicate in `list_users` adds work to every Users page load | 50 rows × a few index lookups on each load (11 Performance) | no | security-reviewer and code-reviewer; the lookups are primary-key and unique-index reads |
| EZD-105c or the event_log ticket choose other names | this plan's step 5 and event_log calls do not match | yes (typecheck, D3) | QP-2; re-validation when those plans land |

## 10. Open questions
- **Q-0731 (answered-agent, (a)):** Which members may an Owner set a password for? Q-0096 P4 says "any member", but Q-0094's EZD-105b list (as `vault/plans/EZD-033.md:52` records it) says "never another admin", and no source says whether a deactivated member counts. Options: (a) active members with a confirmed account only, never one with the Owner preset or holding `settings_users`, never yourself, never one with a membership in another company (this plan is written for (a)); (b) as (a), and deactivated members too; (c) any active or deactivated member except yourself and other-company members (Q-0096 P4 read literally). Recommended (a): the narrowest set, and an Owner cannot take over a peer who can change everyone's access.
- **Q-0732 (answered-agent, (a)):** This plan calls names from three tickets whose plans are not written yet: EZD-105c (`setMemberPassword` goes into its narrow secret-key file), the ticket that creates `event_log` (Q-0720) and EZD-106b (`UserMoreMenu`). Options: (a) those planners adopt the names in section 3 "Required from" rows: `app/src/server/auth/admin-auth.ts`; `private.write_event_log(p_action text, p_object_type text, p_object_id uuid, p_details jsonb, p_ip inet)` and `eventLogIp(headers: Headers): string | null` in `app/src/server/events/event-log.ts`; `UserMoreMenu` in `app/src/components/settings/users/UserMoreMenu.tsx`. Also add EZD-105c and the event_log ticket to this ticket's `depends_on`. (b) This ticket waits in `questions` until those plans exist, then is re-validated against their section 3.
- **Q-0733 (answered-agent, (a)) (design):** No board shows the Set password dialog (Q-0696). Should pressing Set password first ask, since it signs the member out everywhere? Options: (a) the dialog opens on a confirm step ("Set a password for {name}", what will happen, Cancel and Set password), then shows the password with Copy and Done (this plan is written for (a)); (b) pressing Set password makes the password at once and the dialog opens showing it. Recommended (a): it cannot be undone, and Project Delete also asks first (S01 Controls).
