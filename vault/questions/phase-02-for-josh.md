# Phase 2 · for Josh (questions unit, 2026-10-29, re-run)

Three decisions wait on you (Q-0447, Q-0453, Q-0454). Five questions (Q-0448 to Q-0452) were answered by agents with citations; confirm or override them in section 2. EZD-117a, EZD-117b and EZD-118 are `ready`. EZD-108 and EZD-140 stay `questions` until you answer. EZD-110 stays `planned`: its plan is over the size line and carries a split proposal (110a/110b) to apply first. A new fix ticket, EZD-276, was added from Q-0449; it stays `questions` until you answer Q-0454.

## 1. Decisions needed

**Q-0447 · EZD-108.** Supabase asks for an emailed 6-digit code before a password can be set from a sign-in older than 24 hours, and most people stay signed in for months (Q-0048). Your Set password list (Q-0412) shows only New password and Confirm.
1. (Recommended) When Supabase asks, email the existing confirmation code (Q-0102 wording) and show a Code box under the two fields. Reason: the only option that keeps the check and works for a long-signed-in user. Cost: one extra box that appears only sometimes.
2. Ask the person to sign out and sign in again before setting a password. Cost: a long-signed-in user is bounced out of the dialog.
3. Set it with the server's admin key and no extra check. Cost: anyone holding a stolen session could add a password. Not recommended.

**Q-0453 · EZD-140.** When a user turns a notification kind's In app off, what happens to notifications of that kind already in the bell?
1. (Recommended) They stay; the switch applies to notifications sent after Save, as Email does. Reason: simplest, matches how email behaves, nothing disappears unexpectedly.
2. They are hidden too and come back if In app is turned on again. Cost: the bell filters by the current setting, so a count can change when only a setting changed.

**Q-0454 · EZD-276.** The acceptance criterion says the Projects first-cards row fails the check when the time is over 1000 ms. The spec (11 opening paragraph, R26 R10) and EZD-017 G1 say Projects-page times are `trend` rows that are recorded and never fail.
1. (Recommended) Keep it a `trend` row that is marked over budget while the check passes, and reword the criterion to "is marked over budget". Reason: it follows the spec and Josh's earlier rule; a slow gate machine cannot fail the gate or EZD-017 on timing noise. Cost: a slow Projects page never stops a merge by itself.
2. Make it a `gate` row that fails when the median is over 1000 ms. Cost: a slow CI runner can fail the gate; EZD-017 G1 and the spec paragraph change.

## 2. Agent answers to confirm

Confirm or override each (answer; source).
- **Q-0448 · EZD-117b.** Search delay 250 ms. A build choice; no source gives a delay (S01 "as you type"); settled as Q-0425.
- **Q-0449 · EZD-117b.** Add fix ticket EZD-276 so the speed check can sign in and measure the first Projects cards; EZD-117b leaves `scripts/perf/` alone. Source: code-reviewer; CLAUDE.md rules 17, 18; scripts/perf/check.mjs:35-42.
- **Q-0450 · EZD-117b.** The bell adds two requests on Projects (notifications and realtime token); AC-EZD-117a-2 now reads "two project data requests", and the page test expects exactly the four. Source: code-reviewer; S01 "Amber dot when unread items exist"; EZD-110 D16.
- **Q-0451 · EZD-118.** A member who creates a project is listed on it automatically, so a Foreman can see what they made. Source: security-reviewer; spec section 10 line 11; Q-0178, Q-0202, Q-0224.
- **Q-0452 · EZD-118.** Scope of work accepts up to 20,000 characters (input guard only). Source: Q-0396; EZD-113 precedent.
- **Q-0403, Q-0413, Q-0414, Q-0422, Q-0425** (earlier phase 2 agent answers, in QUESTIONS-answered.md): confirm or override.

## 3. Proposed wording

### EZD-108

| Where | Text |
| --- | --- |
| `office.account.menu_aria` (on board as aria-label) | Account menu |
| `office.profile.subtitle` | {name} · {email} |
| `office.profile.set_password` (Q-0412 wording) | Set password |
| `office.profile.code_label` | Code |
| `office.profile.code_sent` | We emailed you a code. Type it here to set your password. |
| `office.profile.password_changed` | Password changed. |
| `office.profile.password_set` | Password set. You can now sign in with it. |
| `office.profile.saved` (toast) | Profile saved. |
| `office.profile.save_failed` | Couldn't save your profile. Try again. |
| `office.profile.load_failed` | Couldn't load your profile. |
| `error.password_too_short` | Use at least 8 characters. |
| `error.password_too_long` | That password is too long. |
| `error.password_contains_app_name` | Don't use "ezdraft" in your password. |
| `error.password_contains_email_name` | Don't use the first part of your email in your password. |
| `error.password_mismatch` | The new passwords don't match. |
| `error.current_password_wrong` | Your current password is wrong. |
| `error.current_password_throttled` | Too many wrong passwords. Try again in 15 minutes. |
| `error.password_same` | Choose a password that's different from your current one. |
| `error.password_breached` | This password has shown up in a data leak. Choose a different one. |
| `office.profile.email_changed_subject` | Your EZ Draft password was changed |
| `office.profile.email_changed_body` | The password for your EZ Draft account ({email}) was just changed. If you didn't do this, tell your company's EZ Draft owner right away. |
| `office.profile.email_set_subject` | A password was set for your EZ Draft account |
| `office.profile.email_set_body` | A password was just set for your EZ Draft account ({email}). You can now sign in with your email and this password. If you didn't do this, tell your company's EZ Draft owner right away. |
| `office.profile.email_link` | Open EZ Draft |

Board text, copied exactly (boards 01d, 01e): `office.account.my_profile` "My profile"; `office.account.company_settings` "Company settings"; `office.profile.title` "My profile"; `office.profile.tab_profile` "Profile"; `office.profile.language` "Language"; `office.profile.language_en` "English"; `office.profile.language_es` "Español"; `office.profile.language_help` "Field pack, tasks and notes open in Spanish for this user. Permit sheets stay in English." (also S15 Language toggle); `office.profile.ipad` "iPad drawing"; `office.profile.ipad_finger` "Pencil or finger"; `office.profile.ipad_pencil` "Pencil only"; `office.profile.ipad_help` "Pencil only lets your hand rest on the screen while you draw."; `office.profile.change_password` "Change password"; `office.profile.current_password` "Current password"; `office.profile.new_password` "New password"; `office.profile.confirm_password` "Confirm new password"; `office.profile.password_help` "We email you when your password changes."; `office.profile.save` "Save". Reused keys `common.sign_in.sign_out`, `common.cancel`, `common.close`, `common.retry`, `error.code_invalid`, `error.code_throttled`, `error.ip_throttled`, `error.too_many_requests`, `error.invalid_input`, `error.db_unavailable`. Spanish for the new `error.*` keys is the builder's (Q-0030 (a)).

### EZD-110

Board text is used as drawn (S01c: "Notifications", "Mark all read", "Show older", "No notifications yet", "Notifications, N new", "Unread"/"Read", "{n} min ago", "Yesterday 4:12 PM", "Oct 26", "Photoreal render finished", "Field measurements received", "Version cleanup due", "{name} asked to edit", "Client approved {version}", "{project} · {client}"). Not on a board:

| Where | Text |
| --- | --- |
| `office.notifications.bell` (no unread) | Notifications |
| `office.notifications.load_failed` | Notifications could not load |
| `office.notifications.time.just_now` | Just now |
| `office.notifications.time.hours_ago` | {count} h ago |
| `office.notifications.time.date_year` | {date}, {year} |
| `office.notifications.kind.client_response.commented` | Client commented on {version} |
| `office.notifications.kind.field_conflict` | Field conflict to resolve |
| `office.notifications.kind.sync_conflict` | Offline changes conflict with newer edits |
| `office.notifications.kind.render_allowance_refilled` | Render allowance refilled |
| `office.notifications.kind.field_pack_issued` | New field pack issued (07 events wording) |
| `office.notifications.email_link` | Open EZ Draft (as approved `office.alert.open_app`) |
| Email body | subject = title; paragraphs = title, then the project line when shown (D6); then the link |
| `error.notification_not_found` | That notification no longer exists. (es: Esa notificación ya no existe.) |
| Icons not on the board | field conflict `compare_arrows`, offline sync conflict `sync_problem`, allowance refilled `autorenew`, field pack issued `assignment`, client comment `chat_bubble` |

Board keys: `office.notifications.title`, `.mark_all_read`, `.show_older`, `.empty`, `.bell_unread` ("Notifications, {count} new"), `.unread`, `.read`, `.project_line`, `.time.minutes_ago` ("{count} min ago"), `.time.yesterday` ("Yesterday {time}"), `.time.date` ("{date}"), and `.kind.<kind>` for the five board titles.

### EZD-117a

| Where | Text |
| --- | --- |
| Status tabs group `aria-label` (`office.projects.status_label`) | Project status |
| Sort button `aria-label` (`office.projects.sort_label`) | Sort by {sort} |

### EZD-117b

| Where | Text |
| --- | --- |
| No-match clear link (`office.projects.clear_filter`) | Clear filter |

### EZD-118

| Where | Text |
| --- | --- |
| Type select first option | Choose a type |
| Customer trigger, nothing picked | Pick a customer |
| Picker first item when one is picked | No customer |
| Picker, more rows | Show more |
| Create failed (500, network) | Couldn't create the project. Try again. |
| Customer archived or gone at Create (`error.project_customer_unavailable`) | This customer isn't available. Pick another customer or leave Customer empty. |
| Cancel confirm title | Discard this new project? |
| Cancel confirm message | Nothing you typed will be saved. |
| Cancel confirm buttons | Discard · Keep editing |

### EZD-276

None (check output for agents). If you pick 1 in Q-0454, AC-EZD-276-2 is reworded to "is marked over budget".

### EZD-140

Keys and texts (step 9). Board 01f texts are not for approval; only the last row is proposed.
| Where | Text |
| --- | --- |
| `office.profile.tab_notifications` (board) | Notifications |
| `office.profile.notifications.help` (board) | Choose what reaches you. Each email has a link that opens the same item. |
| `office.profile.notifications.col_kind` / `.col_in_app` / `.col_email` (board) | Notification / In app / Email |
| `office.profile.notifications.kind.client_response` / `field_conflict` / `field_measurements_received` / `render_finished` / `edit_request` / `sync_conflict` / `cleanup_due` / `render_allowance_refilled` / `field_pack_issued` (board) | Client approval or comment / Field conflict / Field measurements received / Photoreal render finished / Edit request / Offline sync conflict / Version cleanup due / Render allowance refilled / New field pack issued |
| `office.profile.notifications.switch_in_app` / `.switch_email` (board `aria-label`) | {label} in app / {label} by email |
| `office.profile.saved`, `office.profile.save_failed` | reused from EZD-108 section 6: "Profile saved." / "Couldn't save your profile. Try again." |
| `office.profile.notifications.load_failed` (proposed: Notifications tab load error, with Retry) | Couldn't load your notification settings. |

## 4. Rule candidates

All recommended `ratify` (each is a planner or builder check that came from a real miss; none conflicts with a ratified rule).
- **L-022** (builder, EZD-166): catch only the errors the plan names and rethrow the rest. Ratify.
- **L-023** (EZD-190): a plan adding a `private` function lists its PRIVATE_EXECUTE entry and calls it in tests only as a role that has execute. Ratify.
- **L-024** (EZD-190): catalog tests check a rule plus a minimum list, never `toEqual` on a dated snapshot. Ratify.
- **L-025** (EZD-244): a backfill covers the open-ticket set at build time, derived by a command. Ratify.
- **L-026** (EZD-244): when a plan edits a file, grep tests for hash or line-count pins on it. Ratify.
- **L-027** (EZD-244): when a ticket removes a pattern, grep every skill and process file for it. Ratify.
- **L-028** (EZD-246, EZD-240): write exact-text and "after each step" rows as numbered checks. Ratify.
- **L-029** (EZD-248): a guard plan names the threat class, the fail-closed rule and its limits. Ratify.
- **L-030** (EZD-248, EZD-251): comments and rule text about code cite the file, line and branch. Ratify.
- **L-031** (EZD-257): a distinct-hash fixture check names the input that makes each commit unique. Ratify.
- **L-032** (EZD-250): Verify commands run on the pinned Node and give test folders as quoted globs. Ratify.
- **L-033** (EZD-173): changing a shared test helper names its stale options, callers and comments. Ratify.
- **L-034** (EZD-246, EZD-254): plans give exact test counts, fixture shapes in full, and "nothing else" on text blocks. Ratify.
- **L-035** (EZD-253, EZD-154): run each test row's input through the plan's own decision rows by hand. Ratify.
- **L-036** (EZD-253, EZD-259): each test row names the input where old and new code differ and every output channel. Ratify.
