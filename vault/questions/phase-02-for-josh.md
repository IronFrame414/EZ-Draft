# Phase 2 · for Josh (questions unit, 2026-11-04)

No decision waits on you. Q-0579 is answered (Josh 2026-11-05: slim bell, EZD-332 first; the Projects budget was then set to 300,000 by Q-0586, Josh 2026-11-05). Q-0580 (gate test flake) and Q-0550 (EZD-110b, one more attempt) were settled by agents and are in section 2. Q-0485 (EZD-293) is answered (Josh 2026-11-03: accept all). Confirm the agent answers (section 2), the wording (section 3) and the rule candidates (section 4).

## 1. Decisions needed

None. (Q-0579 was answered by you on 2026-11-05: option (b), fix ticket EZD-332 first, then a Projects budget of 300,000 by Q-0586.)

Q-0544 (develop gate red, EZD-108) was settled by an agent as a rule-17 defect and fixed; see section 2.

## 2. Agent answers to confirm

Confirm or override each (answer; source).
- **Q-0580 · EZD-117b (gate tooling).** The gate test EZD-256 K12 (lane-sweep, dead-lock take-over) failed once when lanes ran gates at the same time (alone 17 of 17). Answer: file one low defect ticket at the front so those tests are safe beside concurrent lane gates, built in fix mode. Source: CLAUDE.md rules 17, 18; Q-0571 precedent. Confirm or revert.
- **Q-0578 · EZD-117a.** The plan is 48,239 characters, 3,239 (7%) over the 45,000 split line; the ticket is built, gated and passed both reviews on this text, so the overage is accepted rather than trimmed. Source: vault/PROCESS.md Ticket size; CLAUDE.md rules 17, 18. Confirm or override.
- **Q-0554 · EZD-117a.** Blocked after round 2 with 4 rule-settled in-place findings (cursor u length bound, U2 cap test input, architecture.md figure, test header comment); resume with planner patch, test-author, builder, gate, re-review. Source: CLAUDE.md rule 17; vault/handoff/CURRENT.md. Confirm or override.
- **Q-0550 · EZD-110b.** One more attempt past the round limit: one counter bumped by every state change, an older fetch applies only if it did not move, the test is an interleaving matrix, plan reviewed before tests, plan trimmed or split under 45,000 characters. Settled under your 2026-11-03 night instruction; Q-0543 is the precedent. Source: CLAUDE.md rules 17, 18; L-048. Confirm or revert.
- **Q-0549 · EZD-110b.** After EZD-318 the hub resyncs on every first join; reset() keeps the shown items, dot and count until the first page arrives, then replaces them (same 2 requests; T14 step 6 final state unchanged). Source: spec silent on refetch display; T14. Confirm or override.
- **Q-0544 · EZD-108.** Develop's gate was red (EZD-253 U7, U20) because two ledger test fixtures kept only phases 1 and 2 quiet, so the phase 3 sign-off blocked them. Fixed in fix mode as commit 06467c59: both now block every later signed-off phase; no assertion or expected value changed; CI gate run 41743175841 passed. No ticket needed. Source: CLAUDE.md rules 16, 17; PROCESS.md rule 19. Confirm or override.
- **Q-0448 · EZD-117b.** Search delay 250 ms. A build choice; no source gives a delay (S01 "as you type"); settled as Q-0425.
- **Q-0449 · EZD-117b.** Add fix ticket EZD-276 so the speed check can sign in and measure the first Projects cards; EZD-117b leaves `scripts/perf/` alone. Source: code-reviewer; CLAUDE.md rules 17, 18; scripts/perf/check.mjs:35-42.
- **Q-0450 · EZD-117b.** The bell adds two requests on Projects (notifications and realtime token); AC-EZD-117a-2 now reads "two project data requests", and the page test expects exactly the four. Source: code-reviewer; S01 "Amber dot when unread items exist"; EZD-110 D16.
- **Q-0451 · EZD-118.** A member who creates a project is listed on it automatically, so a Foreman can see what they made. Source: security-reviewer; spec section 10 line 11; Q-0178, Q-0202, Q-0224.
- **Q-0452 · EZD-118.** Scope of work accepts up to 20,000 characters (input guard only). Source: Q-0396; EZD-113 precedent.
- **Q-0403, Q-0413, Q-0414, Q-0422, Q-0425** (earlier phase 2 agent answers, in QUESTIONS-answered.md): confirm or override.
- **Q-0483 · EZD-283.** The EZD-283 gate is red only because develop's ledger had uncommitted files (EZD-291 and EZD-292 plans, EZD-110b Architecture line); the launcher commits them at the unit boundary, then EZD-283 re-runs from the gate. The missing STATUS.md in worktrees is debt D-020. Source: CLAUDE.md rule 17; vault/handoff/CURRENT.md. Confirm or override.
- **Q-0475 · EZD-283.** Keep EZD-283 as written (Company settings only) and add fix ticket EZD-288 for the same silent catch in the customers routes and the sign-in `user.joined` emit. Source: CLAUDE.md rule 17 (fix in place only in files already in the ticket; a defect gets its own ticket); Q-0268.

- **Q-0545 and Q-0546 · EZD-110b.** Realtime hub race (first join and refused token, found in the bell review): new defect ticket EZD-318 at the front of the queue fixes both in `hub.ts`; EZD-110b resumes after it merges. Source: CLAUDE.md rules 17, 18; phase-02.md EZD-318. Confirm or override.

- **Q-0547 · EZD-319.** EZD-319's gate is red only because its Architecture line (Migrations, Local database) sits uncommitted in the main checkout's tickets.json; the launcher or you commits it to develop, then EZD-319 rebuilds. The gap in the ledger drift check is debt D-040, not a ticket. Source: CLAUDE.md rules 17, 18; Q-0483. Confirm or override.

- **Q-0484 · EZD-293.** AC-2's fix is a fix ticket planned from the RESULT report, not part of EZD-293 (tests cannot precede an undecided design). A browser timer or heartbeat would conflict with 11 rule 11 and comes back to you. Source: PROCESS.md rule 20; Q-0480 (a). Confirm or override.

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

### EZD-110a and EZD-110b (split from EZD-110, 2026-10-30; the wording list below belongs to both)

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

None (check output for agents). AC-EZD-276-2 reads "is marked over budget" (Q-0454 (b), Josh 2026-10-30).

### EZD-293

`STOP_PROMPT`: Now restart ezdraft-dev: Supabase dashboard, ezdraft-dev, Project Settings, General, Restart project. Press Return when it shows healthy again. `REF_PROMPT`: Type the project ref shown for ezdraft-dev in the Supabase dashboard. Runbook intro: This restarts ezdraft-dev; the live address is down a few minutes. Never on ezdraft-prod. Output lines and runbook steps: plan section 6.

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
- **L-037** (EZD-267): a plan for code that grants a permission, or writes then commits, names the files never granted, the restore for each failing step and a test per failure branch. Ratify.
- **L-038** (EZD-267, EZD-259, EZD-172, EZD-199): plan test rows use fixture values, never live ledger or budget files; plan text names a comment's sentence, not its line count. Ratify.
- **L-039** (EZD-260, EZD-108): comment or doc text a plan dictates states only what the planned code enforces, checked against the code. Ratify.
- **L-040** (EZD-277): a check that refuses may fold letters wider than the disk; a check that allows folds only plain ASCII; disk claims are tested on the disk. Ratify.
- **L-042** (EZD-108, EZD-277): a plan that changes a type or needs non-ASCII test data lists the fixtures to update and the exact escape sequences. Ratify.
- **L-043** (EZD-287): every function a plan step calls but does not create is named with its file path, found by grep at plan time. Ratify.
- **L-044** (EZD-297): a control row names the exact value its inner assert expects, and a case, length or format test input is shown to differ from its original. Ratify.
- **L-045** (EZD-316): a plan for a guard on an unsandboxed step has a read-list table (every file and ref the step reads, each denied or checked) and a test per check-then-use step. Ratify.
- **L-046** (test-author, EZD-108 via Q-0544): a fixture over the live ledger never names the phases it keeps quiet; it blocks every later signed-off phase. Ratify.
- **L-047** (planner, EZD-316): a plan that moves an action outside the sandbox has a table of unsandboxed commands by sandbox-writable input and closes the class before any single path. Ratify.
- **L-048** (planner, EZD-110b): a store that drops stale async results states staleness once as an invariant (one counter bumped by every change) and tests a matrix of every change against every fetch kind. Ratify.
- **L-049** (planner, EZD-140): when a plan adds an entry to a list tests enumerate exactly, the Tests table has an edit row for that test. Ratify.
- **L-050** (planner): every stated check has a Tests row with an input a wrong implementation fails. Ratify.
- **L-051** (planner): test rows that create files remove them in finally; browser tests wait for pending requests. Ratify.
- **L-052** (planner): plans list empty, over-limit and malformed behaviour per input, and every caller of a changed signature. Ratify.
- **L-053** (planner): plans list the gate parts touched and say to merge develop into the worktree first. Ratify.
- **L-054** (planner): UI checklist rows give the mockup's measured edge, offset or icon name and a test. Ratify.
- **L-055** (planner): when a ticket changes a stated behaviour, grep docs, skills and agents for the old value and list each hit. Ratify.
- **L-056** (test-author, EZD-326): a test-author never links or copies node_modules into a worktree; the gate installs it. Ratify.
