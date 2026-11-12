# Phase 3 · for Josh (questions unit, 2026-11-06)

No phase 3 decision waits on you. Confirm the agent answers (section 2), the wording (section 3) and the rule candidates (section 4).

## 1. Decisions needed

None for phase 3. Q-0601 (the home-settings E1 test) is settled as its own fix ticket EZD-343 (test plumbing; not sent to you). Q-0581 is answered (c). Q-0548 (EZD-316, phase 1) and Q-0579 (EZD-117b, phase 2) still wait; see their files.

## 2. Agent answers to confirm

Confirm or override each.
- **Q-0581 · EZD-120d (how it is built).** Offline the browser cannot clear the session cookies, so a failed sign-out sets a "signed out" marker and goes to sign-in; the next request that reaches the server clears the session cookies. Applied to every failed sign-out from both buttons, not only "Sign out anyway" (shared-device risk is the same). The server session is not revoked. Plan is 17,336 characters (over the 15,000 cap, as Q-0577). Source: planner; EZD-120d plan; Q-0581. Confirm or override.
- **Q-0577 · EZD-133 plan size.** (a) The plan is 15,890 characters against the 15,000 cap (PROCESS.md H2); accept the 890-character (6%) overage and build as one unit. Settled while you were away (Q-0550, Q-0571 precedent). Revert = split the page scan into EZD-133b (about 1 extra unit). Source: PROCESS.md H2.
- **Q-0572 · EZD-133.** (b) The money test also renders every page as both money-less users and scans the HTML and payload; a page not on the list fails CI. Cost: about a minute more per gate; each new page adds a list line. Source: security-reviewer; 03b-architecture-rules.md line 7; AC-EZD-133-2; 13b-round-26.md.
- **Q-0573 · EZD-202.** (a) EZD-202 depends only on EZD-120a and builds before EZD-120b (no rework of 120b's load and outbox). Ticket-data edits (phase row, tickets.json, PHASES.md order, EZD-202 added to 120b's dependencies) are NOT yet made; they go in the EZD-120b split commit. Source: code-reviewer; P202 section 3; PROCESS.md section 6.
- **Q-0574 · EZD-238.** (a) Until EZD-204, a door's hinge is at the jamb nearer the wall start and opens to the left of start→end, kept in one named constant that EZD-204 maps to through migrate. Source: code-reviewer; AC-EZD-238-2; EZD-204 row.
- **Q-0575 · EZD-202/238.** Not the planner's options. A wall's start–end line is the line you drew (the inside finished face), and each wall carries a required thickness side (left, right or centre). This follows your earlier answers on wall thickness. Source: code-reviewer; Q-0559; Q-0569 (b); 09j Thickness side rows 1–4. Calc-auditor re-checked every changed value in EZD-238 (all correct).
- **Q-0576 · EZD-205.** (a) The room label ("KITCHEN · 165 SF") is built in EZD-205, not EZD-238. EZD-205's plan must add it; not yet planned. Source: code-reviewer; Q-0568; AC-EZD-205-1.
- **Q-0599 · EZD-120d (security).** The "signed out" marker cookie is named `__Host-ezd_signed_out` on https (no Domain, Secure) so no sibling subdomain can plant it; each side honours only its own scheme's name. Source: Fable security-reviewer 2026-11-05; Q-0581; docs/architecture.md Auth and session. Confirm or override.
- **Q-0600 · new ticket EZD-342 (security defect).** The session cookies (`sb-…`) and the sign-in email and language cookies can still be planted from a sibling subdomain (session fixation). Fix: on https every app-set cookie gets the `__Host-` prefix, one shared name function, an old plain-named session cookie on https counts as signed out. Cost: everyone signs in once at deploy. Filed as a rule-17 defect at the front of the queue. Source: Fable security-reviewer 2026-11-05; CLAUDE.md rules 17, 18. Confirm or override.
- **Q-0625 · EZD-299 (object numbers).** (a) Walls, doors and windows get a stored number per type and project (openings per kind), never reused, highest + 1 like "Room N", so "Wall 4" is the same on every device. Needs a new ticket "Object numbers" (schema field, numbering helper, creation sites, one-time backfill in save order) before EZD-299c. Source: phase-auditor; Q-0511 (b), Q-0531, Q-0568, Q-0613. Confirm or override.
- **Q-0626 · EZD-299 (older app version).** (a) A whole build number is fixed at each build; a save with a lower or missing number is refused and writes nothing; EZD-134 uses the same number. Roll back by promoting the previous build, never by redeploying old code. Source: code-reviewer; docs/architecture.md (Environments and releases); Q-0530, Q-0540. Confirm or override.
- **Q-0627 · EZD-299 (long notification).** (a) The notification names objects until its 4,096-byte payload is full, then "and N more"; one notification per sync; its link opens the full list. Source: code-reviewer; Q-0531, Q-0540; EZD-110a. Confirm or override.
- **Q-0628 · EZD-299 (security).** (b) A row for a project you can no longer open shows a generic group label and no project name; the server adds names only after a fresh access check. Source: security-reviewer; Q-0540, Q-0502; AC-EZD-299-8. Confirm or override.
- **Q-0631 · EZD-299b (security).** (b) One device reason `not_open` for a deleted project and one no longer open, shown with P14b ("You no longer have access to this project"). No new presence route: it would tell any user whether a project they cannot see exists. Board S03b's P14 ("This project was deleted") is therefore never shown. Source: security-reviewer; docs/architecture.md Errors and logging; Q-0502, Q-0540, Q-0628. Confirm or override.
- **Q-0632 · EZD-299a/299b/299.** (a) Each conflict row shows "[Name] · time" and, for other projects, the client after the project name, as on your approved board S03b. Read at list time after the access check; a project you can no longer open returns none of them; the name shows only if the saver is still in the company. Source: phase-auditor; S03bConflictList.dc.html; Q-0540, Q-0628, EZD-110a. Confirm or override.
- **Q-0507, Q-0508, Q-0530, Q-0540** (phase 3 spec-gap answers by the orchestrator; in QUESTIONS-answered.md): confirm or override.

## 3. Proposed wording

- **EZD-120a:**
  - `error.stale_lock_epoch`: "Someone else is editing this project now, so these changes weren't saved."
  - `error.save_conflict`: "Someone else changed the same items first, so these changes weren't saved."
  - First floor name: "Floor 1"
- **EZD-120c, EZD-120d:** wording follows the plan files (section 3 of each); EZD-120d follows the plan with Q-0581 (c).
- **EZD-120b (split proposal, not yet planned in full):** the "Changes not saved" banner's longer text if any, the clock-time form after 59 minutes, the failed-load line, the sign-out warning title, message and confirm label, and the test page's labels and counts lines. Spanish of any new key.
- **EZD-299 (new, from Q-0627 and Q-0628):** "and N more" at the end of a long list of object names in the notification (N = names not listed; used only past about 400 names); and the group label for rows of projects you can no longer open (exact text proposed in the plan's section 3).
- EZD-133, EZD-202, EZD-238, EZD-346, EZD-347: none (EZD-346 reuses `error.not_authorized`).

## 4. Rule candidates

L-062 (a plan's timing and race test rows name the held await, the injected event and the exact counts) was ratified this unit. All are planner/builder/test-author lessons from earlier tickets; recommendation is from the rule text and the ticket it came from.
- **L-022** (EZD-166): catch only the errors the plan names; add no fallback it does not list. Ratify (matches rule 4).
- **L-023** (EZD-190): a plan adding a `private` function lists its PRIVATE_EXECUTE entry. Ratify.
- **L-024** (EZD-190): catalog-content tests check a rule plus a minimum list, never a snapshot. Ratify.
- **L-025** (EZD-244): a backfill's plan gives the command that derives the open-ticket set. Ratify.
- **L-026** (EZD-244): grep tests for a pin on any file a plan edits; pins become structural-repair rows. Ratify.
- **L-027** (EZD-244): removing a pattern means grepping every skill and process file. Ratify.
- **L-028** (EZD-246, EZD-240): each such row is its own numbered check naming the line or step. Ratify.
- **L-029** (EZD-248): a guard's plan names the threat class, the fail-closed rule, the cost, the shells in scope. Ratify.
- **L-030** (EZD-248, EZD-251): comment/rule text about code behaviour cites the file and line it restates. Ratify.
- **L-031** (EZD-257): a distinct-hash fixture test names what makes each commit unique. Ratify.
- **L-032** (EZD-250): Verify commands run on the pinned Node; planner runs each once; folders as quoted globs. Ratify.
- **L-033** (EZD-173): a plan changing a shared test helper names its options, callers and stale comments. Ratify.
- **L-034** (EZD-246, EZD-254): exact test count and titles, full fixture shape, "nothing else" on exact-text blocks. Ratify.
- **L-035** (seen 2): run each test row's input through the plan's decision rows by hand. Ratify.
- **L-036:** each test row states the input where old and new code differ and names every output channel. Ratify.
- **L-037:** a plan for code that grants permission or writes then commits names the never-granted files and a test per failure branch. Ratify.
- **L-038:** test rows use fixture values, never live ledger or budget files. Ratify.
- **L-039:** dictated comment/doc text states only what the planned code enforces. Ratify.
- **L-040** (EZD-277): a refusing check may fold wider than disk; an allowing check folds only plain ASCII. Ratify.
- **L-042** (EZD-108, EZD-277; seen 3): a plan changing a type or needing non-ASCII data lists the fixtures and escape sequences. Ratify.
- **L-043** (EZD-287): every function a step calls that the plan does not create is named with its path. Ratify.
- **L-044** (EZD-297): a control row names the exact value the assert expects; test inputs differ from their original. Ratify.
- **L-045** (EZD-316): a guard on an unsandboxed step lists every file and ref it reads and what is re-verified at use. Ratify.
- **L-046** (Q-0544, test-author): a fixture over the live ledger never names the phases it keeps quiet. Ratify.
- **L-047** (EZD-316): a plan moving an action outside the sandbox lists every unsandboxed repo command and closes the class first. Ratify.
- **L-048** (seen 2): a store dropping stale async results states staleness once, as an invariant, tested as a matrix. Ratify.
- **L-049** (EZD-140): an entry added to an exactly-enumerated list names the test that lists it. Ratify.
- **L-050:** every stated check has a Tests row with an input a wrong implementation fails. Ratify.
- **L-051:** test rows that create files remove them in finally; browser tests wait for pending requests. Ratify.
- **L-052:** for each input, list empty, over-limit and malformed behaviour; list every caller of a changed signature. Ratify.
- **L-053:** a plan lists the gate parts the change touches and says to merge develop before the gate. Ratify.
- **L-054:** each visual checklist row gives the mockup's measured edge, offset or icon name and a way to test it. Ratify.
- **L-055:** a ticket changing a stated behaviour lists each doc, skill and agent line found by grep for the old value. Ratify.
- **L-056** (EZD-326, test-author): never link or copy node_modules into a worktree; the gate installs it. Ratify.

Note: L-022 to L-056 each have seen: 1 except where marked; I recommend ratify for all because each is a specific, checkable rule with a named check and none contradicts the spec or CLAUDE.md. Reject any you find too heavy for a plan.

## Ticket changes made for these answers (information only)
- EZD-299 split into EZD-299a (server copy, refusals, notification), EZD-299b (device: Keep mine / Keep theirs / Remove) and EZD-299 (the screens: banner, list, Show, "make a conflict"), per the planner's split proposal (vault/plans/EZD-299.md; 20-file and 25-test limit).
- New ticket EZD-294 Object numbers (Q-0625 (a)), slice 4. EZD-299 and EZD-211 depend on it.
- Build effect: EZD-299 (the screens) waits for slice-4 tickets EZD-207a/b (Show, Q-0568) and EZD-294, all but EZD-294 already done. Slice 3 closes after it.
