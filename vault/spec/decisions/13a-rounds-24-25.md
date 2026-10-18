# Decisions · Rounds 24 and 25 (by area)

Part of the spec's section 13 (`vault/spec/sections/13-decisions-and-remaining-items.md`), exported Oct 11, 2026 and read-only. Authority: Round 26 > Round 25 > Round 24; a build-time answer (the other files in this folder) overrides all three where it names the same thing.

All cross-cutting questions were answered on Oct 11, 2026 (Round 24). Josh answered the product decisions; Claude made the small ones at Josh's request (marked *Claude*). Screen-level details in section 4 are resolved the same way. These decisions override anything earlier in this spec.

**Scope, naming, hosting**

| # | Decision |
| --- | --- |
| 1 | Name: EZ Draft. Address: ezdraft.ezcontractorbinder.com (a subdomain added in DNS, pointing to the hosting provider). |
| 2 | RCP is v1. |
| 3 | Photoreal render and reference DXF revision diff are v1. |
| 4 | Version cleanup: unsent working versions auto-delete at 30 days. Before deleting, a cleanup sheet lists them with a preview image of each; the user ticks what to keep. Kept versions become named snapshots. If the sheet is ignored, unticked versions delete after 7 more days. |
| 4a | Version numbers belong only to what is sent to another party (client, department, EZ Binder). Internal saves are working versions, not numbered. Sent versions are permanent. |
| 50 | Local GPU render worker is preferred over cloud rendering; cloud is the fallback when the worker is off. |
| 51 | No schedule. The build is split into phases and tickets, worked as time allows (section 11). |

**Sheets and issue**

| # | Decision |
| --- | --- |
| 5 | Countertop plan, edge detail and top schedule are internal and client documents only. They are not in permit drawings. |
| 6 | One PDF file per set. |
| 7 | Two blank areas: seal box and department approval stamp. |
| 8 | Symbol key placement is chosen by the user per set (every sheet or cover only). |
| 9 | Permit sheets are English only. |
| 10 | "All dimensions typed" is a warning in the issue checklist, not a gate. It means some dimensions still come from a scan or scaled PDF rather than typed or laser entry. The user can dismiss it with one click, and it clears when the set is issued (Round 25). |
| 26 | Client sends before permit are labeled "Version N"; permit issues are "Rev N". Both count up with no cap. |
| 42 | Worth Properties prepares and submits its own drawings under its license. The terms-of-service disclaimer stays for other tenants. |
| 43 | Departments accept the GC load calc. Keep the optional EC signature block. |
| 48 | Checked: see Department submittal rules in section 7. One PDF per set stays the default, with a Download one page at a time option. The version stays in the file name by default; users rename locally when a department wants the original name. Stamped permit sets export full size, 24×36 (ARCH D) (Round 25). |

**Permissions and users**

| # | Decision |
| --- | --- |
| 11 | All proposed permissions are added: Approve renders, Mark client-ready, Edit field tasks, Run code check, Upload references, Add markup, Flag to supplier, Check off tasks, Photo notes, Flag conflict, Send field measurement, Run standard renders. |
| 12 | Designer preset ticks every permission except Delete projects, Issue permit sets, Issue revisions and Manage users and settings. |
| 13 | "Field lead" is renamed **Foreman**. Foreman preset also ticks fast renders, export and approve translations. |
| — | Presets: Owner, Designer, Foreman, Crew. Unlimited custom roles. No user limit until a paywall. Controls a user lacks are hidden. |
| 14 | Users are invited in EZ Draft. If EZ Binder is connected, an option syncs users. The apps stay separate. |
| 15 | Every user must have an email. Everything sent by email also shows a Copy link button, because email from the new domain may land in spam. |
| 20 | Who can approve renders and mark them client-ready is set per role. |

**Edit lock and versions**

| # | Decision |
| --- | --- |
| 16 | Two separate things. (a) The edit lock covers every change to the model, sheets, options and markup; viewing, commenting and running renders do not need it. (b) A send freezes that version permanently; users keep editing a working copy without losing the sent one, and the next send creates a new version for a new signature. |
| 17 | The lock holder releases with a **Stop editing** button in the header, or by closing the project. Both save first. |
| — | Auto-release after 5 minutes does not pause offline. On reconnect the former holder gets a conflict notification listing every clash to resolve. |
| — | After release the lock is free for anyone; first to press Start editing gets it. |

**Render**

| # | Decision |
| --- | --- |
| 18 | Costs show in dollars, not credits. No hard limit: the company sets an allowance in settings that auto-refills when used up and notifies the owner. Real per-render costs to be measured during testing. |
| 19 | New permission: Run standard renders. |
| — | Tiers: Fast, Standard, Photoreal. Two-step approval: Approve, then Mark client-ready. |
| 21 | The four ways to direct a render (tap surface, type, paint mask, from model) are in Step 2. |
| 22 | A render is marked "model changed" only when an object or finish visible in its camera view changes. It shows as a badge on the render and in the review pill, not as a prompt at save; keep / outdated / hide is chosen per render. |
| 23 | Camera matching is optional. A site photo plus a text instruction renders with no alignment step. Alignment is offered only when exact placement matters. |
| 49 | Model choice per tier is tested as real jobs come in. |

**Revisions and change orders**

| # | Decision |
| --- | --- |
| 24 | A change order can be drafted and sent together with its revision. |
| 25 | Cost and schedule data on a change order are typed by the user. Import from EZ Binder may come later. |
| — | COs reach EZ Binder only when Send is pressed. |

**Field**

| # | Decision |
| --- | --- |
| 27 | Remove "Laser connected" and battery labels. |
| 28 | Send measurement and Flag conflict are separate buttons. |
| 29 | Office is notified when field measurements arrive and approves them on a Field measurements review screen. |
| 30 | One tolerance setting covers field measurements and scan-vs-typed conflicts. |
| 31 | Queued phone actions against an older revision are flagged as conflicts when the phone reconnects. |
| 47 | Build laser keyboard-mode input in v1. |

**Client**

| # | Decision |
| --- | --- |
| 32 | Before signing, the client verifies by entering the email on their customer profile. Customer list syncs both ways with EZ Binder. |
| 33 | Edge profile price shows as a total. |
| 34 | Printed name is required with the signature. |
| — | Approval requires selecting items and signing. The client may sign with some selections still open. |

**Electrical**

| # | Decision |
| --- | --- |
| 35 | Check (code check) is a button on the left tool rail, available on every editor tab, not only Electrical. |
| 36 | Device height notes are an option per device, off by default. |
| 37 | Voltage-drop warning included; threshold is a company setting. |
| 38 | Optional load-calc method is a toggle per calc. |

**Translations**

| # | Decision |
| --- | --- |
| 39 | Reject opens the phrase for manual entry or edit. |
| 40 | Spanish users always see Spanish, reviewed or not; never English or blanks. The hold setting only holds set issue. |
| 41 | Editing a phrase is approving it. Issued sets do not change. |

**Values**

Every threshold, tolerance, limit, waste factor and shortcut is a company setting under Defaults, entered by the owner.

**Performance and build method (Oct 11, second audit)**

| # | Decision |
| --- | --- |
| P1 | The app is built to feel instant from Phase 0. The budgets and rules in section 10 (Performance) apply to every ticket and are checked automatically on every commit. Priority set by Josh; budgets and rules by Claude. |
| P2 | Saves: the working copy is stored one row per object and autosaved as changed objects only. Whole-model versions are written only at checkpoints (Stop editing, close, send, issue, snapshot, Revert, Finish import). This replaces one version row per save. (Claude) |
| P3 | Nothing is recomputed on the server when the model saves. Schedules, key, load calc, takeoff and code check are computed in the browser for what is on screen and stored only when a version is sent or issued. (Claude) |
| P4 | Background jobs run from a Postgres job table as Vercel Functions; progress reaches the browser over Supabase Realtime. (Claude) |
| P5 | Every phase gate has an automated build gate and a separate field check by Josh. The field check does not block the next phase. (Claude) |
| P6 | The EZ Binder integration is built and tested against a written contract and a stub server. The EZ Binder side is separate work in its own repo. (Claude) |
