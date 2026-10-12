## Decisions and remaining items

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

**Round 26: build-readiness audit (Oct 11)**

Josh's answers are marked Josh; the rest were decided by Claude at Josh's direction to resolve every audit item. These override anything earlier in this spec.

| # | Decision |
| --- | --- |
| R1 | The browser never reads or writes tables directly; all access goes through server routes that check permissions, with row-level security as the backstop. Money fields are kept separate so who sees them is one setting. See Data model, Architecture rules 1 and 2. (Claude) |
| R2 | Money has two permissions (Josh): See company costs covers what the company pays (catalog cost, takeoff and order-line costs, option cost lines, change-order cost deltas, render cost and allowance dollars); See sell prices covers what the client is charged (sell price, markup, allowance amounts, edge-profile price differences, change-order overhead, profit and total). Owner and Designer have both; Foreman and Crew have See company costs only. This replaces the single See costs and prices permission everywhere. |
| R3 | Everything that prints on a sheet or is in a signed package is versioned with the model in v1: sheets, viewports, countertops, panel and circuits, detail instances, option changes. (Josh) |
| R4 | The model schema is defined once, versioned, validated on every save and upgraded on read. (Josh: build it) |
| R5 | Saves carry a lock generation and checkpoints are built on the server, so a sleeping device cannot save over the next editor. A non-holder may send from a server checkpoint with a notice. (Claude) |
| R6 | One device outbox from Phase 1; offline is the same save path. When synced changes conflict with what another user did to the same object, the user gets a notification and resolves each with Keep mine or Keep theirs. (Josh) |
| R7 | One drawing list feeds the plan canvas, the on-screen sheet and the PDF; PDFs are written with PDFKit. Proven by a Phase 0 spike before any sheet work. (Claude, at Josh's direction) |
| R8 | Calculations run in the browser while editing and are re-run on the server at send or issue. See Where each output is produced. (Claude) |
| R9 | Five throwaway spikes run right after Phase 0 (EZD-027 to EZD-031): the plan canvas with a 150,000-entity drawing on the iPad, the PDF path, the DXF parser on a real architect file, wall openings with a sloped ceiling, and a render trial. Each ends in a go or no-go note. (Claude) |
| R10 | CI gates on counts that need no GPU; Josh runs the benchmark page on the iPad at each field check. (Claude) |
| R11 | Named tools and a conventions file (EZD-000) that every build session reads. (Claude) |
| R12 | Environments, promotion-only production releases, add-before-remove migrations, Sentry, a System status page. (Claude) |
| R13 | Stored files are backed up nightly to a second provider; the restore drill runs before the first real job. (Claude) |
| R14 | Client link: server routes with a field list, private files, hashed tokens, rate limits. The signer check stays as Round 24 #32 with an attempt limit. A 6-digit emailed code at signing remains an option if stronger proof is wanted. (Claude) |
| R15 | Crew sign-in email carries a link and a 6-digit code, because a link opened from email does not sign in the installed app on iPad or iPhone. The EZ Binder sign-on exchange is a single-use 60-second code swapped on the server for a session, defined in the contract. (Claude) |
| R16 | DXF: one parser for imports and references, chosen in the spike; unsupported entity types are counted and shown per reference as "N entities of type X not drawn". The promise is all supported entity types, not 100% of every file. (Claude) |
| R17 | Interface language: the field pack and the other phone screens for crew are available in Spanish, buttons and messages included; the office editor and the client link are English in v1. Every interface string goes through one message helper from Phase 0. (Claude) |
| R18 | The cloud render API is the primary path until the GPU test passes; the local worker protocol is still built in Phase 11, with its own revocable key. This narrows Round 24 #50, which stays the goal. (Claude) |
| R19 | Code check covers every building code relevant to what is drawn: the 2023 NEC and the Florida Building Code, Residential, as rule sets in Calculations, with more volumes added the same way. Rules are written in our own words with section numbers and links to the publishers' free viewers; code text is not copied. Every rule is unverified until a licensed person checks it. (Josh for the scope; Claude for the method and the rule list) |
| R20 | Voltage-drop formula, the load calc worked example, the five load calc cases and the takeoff formulas are in Calculations. (Claude) |
| R21 | First image-model adapter: Google's Gemini image-editing API; a second adapter (OpenAI image edits) is a follow-up ticket. Model per tier is still chosen by test (Round 24 #49). (Claude) |
| R22 | Option cost lines are typed by the user, as for change orders (Round 24 #25). Option A is the current design; B and C start as copies. (Claude) |
| R23 | Cabinet seed line until a real vendor line is entered: B, DB, SB and W in 3" steps from 9" to 36", fillers 3" and 6". (Claude) |
| R24 | Interior elevations are generated for every wall that hosts a cabinet, fixture or tile shower; any other wall is added with Add elevation. (Claude) |
| R25 | A non-Polycam DXF layer is converted with the same detector as Polycam imports, after the user maps layers to walls, doors and windows. (Claude) |
| R26 | Saved groups other than cabinets are placed from a Saved section in the Fixtures panel. (Claude) |
| R27 | The job-feed ticket is removed; EZ Binder gets notifications through the existing events. (Claude) |
| R28 | Scope of work is a project field entered in the New project wizard and Project settings; it prints in the title block. (Claude) |
| R29 | The client allowance summary moves to Phase 16, where allowance categories exist. (Claude) |
| R30 | A browser path-traced image is saved as a Photoreal render at cost $0 that needs review. (Claude) |
| R31 | The architect's revision letter is typed at upload, prefilled with the next letter. The Foreman who gets a field-measure link is picked in the wizard. (Claude) |
| R32 | The EZ Binder webhook address, signing secret and inbound key are entered at Connect in Settings. (Claude) |
| R33 | A dependency on a split ticket's base number (EZD-120) means all of its lettered parts. (Claude) |
| R34 | The code check uses the full Code rules catalog, not a short list: 1,248 rules across the Florida Building Code volumes and the NEC, each Automatic, Needs data or Reminder, with sections for both editions. The catalog file in the repo is the source of truth; tickets EZD-611b to EZD-639 build it, and EZD-620 adds the project and object values the rules need. (Josh for the scope; Claude for the catalog) |

**Still open (waiting on things outside the software)**

- [ ] Round 26 R2 is answered (two permissions); nothing open.
- [ ] Mark each code rule verified in Settings 15g (EZD-1710 prints the list). Building rules were checked against the official code text on Oct 11; electrical rules against published summaries only, so those need the NEC book.
- [ ] Terms of service text from Josh or the attorney (EZD-1707 ships a placeholder).
- [ ] A real vendor cabinet line to replace the seed line (R23).
- [ ] Confirm the first image-model provider at the render trial spike (R21).

* [ ] Supplier 2020 sample export (DXF + cabinet order report): when available.
* [ ] 2–3 architect DXFs for performance testing: when available.
* [ ] Real per-render costs, and the default model per tier: measured during testing.
* [ ] Confirm unverified department items (PBC stamp space and sheet size, West Palm Beach naming sheet, Broward BCD revision naming) when submitting a first job there.
* [ ] Is Josh's computer GPU suited to the local render worker? Test before relying on it; the cloud API covers until then.
* [ ] Mockups needed before build: New project wizard (01), Takeoff, Versions / revision history and the cleanup sheet, Field measurements review, Field tasks, Settings 15a to 15h, phone 3D viewer.

**Resolved from the plan doc's open list (Oct 11)**

- Polycam Business: Josh has it, so DXF floor-plan export is available.
- Bluetooth laser: none owned today. Keyboard-mode laser input is built in v1 anyway (Round 24 #47).
- Visual direction: the Studio mockups are final and approved.
- Who signs, and the GC load calc: decided in #42 and #43.

## Build answers (Josh)

Josh's answers during the build. Each overrides the spec text and any earlier row above. Source rows are in `vault/questions/QUESTIONS.md`.

| Q-ID | Date | Answer |
| --- | --- | --- |
| Q-0001 | 2026-10-11 | No NEC book. Proceed with the current code rules; unverified rules keep their "not yet verified" tag in the app. |
| Q-0003 | 2026-10-11 | Docker Desktop is installed on the build PC. Vercel, Supabase and Resend accounts exist, shared with EZ Binder for now. (GitHub repo, DNS, Claude API key, image-model API keys, Sentry and the backup bucket were not covered; still in `tickets/needs-from-josh.md`.) |
| Q-0004 | 2026-10-11 | Fable uses existing usage credits with no auto-refill. Use Fable for phase audits; fall back to Opus if the credits run out. |
| Q-0014 | 2026-10-11 | Round 26 R2 is done: two permissions, See company costs and See sell prices. |
| Q-0015 | 2026-10-11 | Claude drafts the Terms of service in EZD-1707. Attorney review is recommended before the app takes paying customers. |
| Q-0016 | 2026-10-11 | R21 provider choice: the render spike (EZD-031) runs the same 5 rooms through Gemini image, GPT Image 2 and Flux Kontext pro, records the cost per render and keeps the output images. Josh picks the provider from those images. |
| Q-0017 | 2026-10-11 | Department items: the Broward stamp space is the default for all departments. No per-department file naming; users rename files locally. |
| Q-0018 | 2026-10-11 | GPU: the build PC has Intel UHD Graphics only (no dedicated GPU memory). No local GPU rendering; all renders use cloud providers. (Whether Phase 11 still builds the local worker protocol is open as Q-0020.) |
| Q-0019 | 2026-10-11 | Build PC has 16 GB RAM: keep parallel test workers low (Playwright workers = 2) and never run two gate checks at once. |
| Q-0006 | 2026-10-11 | Each ticket's check runs the phase's tests plus a smoke set; the full suite runs at the phase gate. Rule 3 in `tickets/README.md` is updated; Josh applies the `scripts/gate.mjs` change specified in the EZD-001 plan. |
| Q-0011 | 2026-10-11 | The duplicate first export at the repo root is moved to `vault/archive/original-export/`. Agents never read `vault/archive/`. |
| Q-0025 | 2026-10-11 | The `.env` read deny is narrowed to `.env.local`, `.env.*.local`, `.env.production` and `.env.development`; `.env.example` is readable. |
| Q-0034 | 2026-10-11 | S15 has 29 permission switches (the Permission list and the mockup). Every "28" in the S15 text is a counting error; use 29. |
| — | 2026-10-11 | Mockups: 14 new Studio boards (S01b, S15a–S15h, S17c, S19–S22) and updated S02, S15, S16. Every screen now has a mockup; tickets README rule 6 ("built from the spec text") no longer applies to any screen. |
| Q-0013 | 2026-10-12 | (a): the framework default browser floor: Safari/iOS 16.4+, Chrome/Edge 111+, Firefox 113+. |
| Q-0026 | 2026-10-12 | (a): spec oklch() values only, no sRGB fallback (follows Q-0013 (a), which sets Firefox 113+). |
| Q-0024 | 2026-10-12 | (a): EZ Draft's own ezdraft-dev and ezdraft-prod projects inside EZ Binder's existing Supabase organization, which is on Pro. |
| Q-0027 | 2026-10-12 | (a): Vercel Pro default function limits (300 s, 2 GB). The account is on Pro. |
| Q-0029 | 2026-10-12 | (a): new users default to English; the inviter or the user switches to Spanish in settings. |
| Q-0030 | 2026-10-12 | (a): each ticket's builder writes the Spanish in the same commit; a Spanish-speaking crew member checks it at the field checks (and in Phase 15). |
| Q-0031 | 2026-10-12 | (a): the ezdraft project goes inside EZ Binder's existing Vercel team, which is on Pro. |
| Q-0032 | 2026-10-12 | (a): EZD-003's repo work merges to develop in Stage 3; the ticket stays blocked (waiting on Josh: Vercel, DNS, Phase 0 merge) and the live HTTPS check runs right after the Phase 0 merge, as part of the field check. |
| Q-0033 | 2026-10-12 | (a): a one-time SQL setup file Josh pastes into each cloud project's SQL editor, typing his own email there; runbook step. No personal data committed. |
| Q-0035 | 2026-10-12 | (b): send from EZ Binder's verified ezcontractorbinder.com for now. Also: everything that sends an email must also generate and show the sender a link they can copy and paste, because emails still land in spam. Exception (orchestrator note, for security): sign-in emails cannot show their link on screen, since anyone who typed an email would get in; the sign-in page tells the user to check spam and accepts the 6-digit code. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0036 | 2026-10-12 | (b) with a change: the sender shows as "<Company> via EZ Draft"; replies go to a company email address set in company settings (where all responses to the company are received), not to the individual sender. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0037 | 2026-10-12 | (b): the review pill text uses the mockups' darker amber (new token, about oklch(0.48 0.13 65)); the spec amber stays for the dot. |
| Q-0039 | 2026-10-12 | (c): no extra page or notice. Production shows whatever sign-in provides until Phase 1; the build-gate test signs in and opens /dev/shell. Josh is the only user and does not need an "under construction" screen. |
| Q-0040 | 2026-10-12 | (c): tooltip radius 6 px, as the approved mockups (board-cited exception token). [Josh answered with the batch file's letter (a); this is option (c) in the question above.] |
| Q-0041 | 2026-10-12 | Build both modes, chosen per environment: previews default to the stub transport now (no paid accounts); a setting can switch a preview to live sending later if Josh allows small tests. |
| Q-0043 | 2026-10-12 | (a): one active company per person in v1; inviting someone already active elsewhere is refused. |
| Q-0046 | 2026-10-12 | (a): the planner's draft wording in vault/plans/EZD-007.md. |
| Q-0047 | 2026-10-12 | (b): English / Español switch on the sign-in page, remembered on the device; the sign-in email carries both languages, English first. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0048 | 2026-10-12 | (a): stay signed in until sign-out, deactivation, or 400 days unused. |
| Q-0049 | 2026-10-12 | (b): emailed sign-in link and code valid 15 minutes. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0050 | 2026-10-12 | (b): a person with a valid (unexpired, not cancelled) pending invite may sign in from the sign-in page; that accepts the invite. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0051 | 2026-10-12 | (a): white lowercase "ez" on a cobalt square now; Josh may supply artwork later. |
| Q-0053 | 2026-10-12 | Josh has no iPad: he uses an iPhone in the field and sometimes a Surface (believed to be a Surface Pro, to be confirmed). The full editor is built and tested for both the Surface and iPad landscape (Q-0088). iPad size: iPad Air 11-inch default, 1180 × 820. Surface Pro: about 1440 × 960 until confirmed. |
| Q-0054 | 2026-10-12 | (a): full editor from 1024 px wide; below that the phone layout. |
| Q-0055 | 2026-10-12 | (a): on screens narrower than the desktop reference, Share, Export and Stop editing show only their icon (name as tooltip and for screen readers). |
| Q-0056 | 2026-10-12 | (a): "Editing is done on an iPad or a computer. Open this project there." (Spanish per Q-0030). |
| Q-0057 | 2026-10-12 | (b): dialog radius 14 px, as the approved mockups (board-cited exception token). [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0058 | 2026-10-12 | (a): toasts clear after 5 seconds; toasts that need an answer stay until used or closed. |
| Q-0059 | 2026-10-12 | (a): up to 5 tries per job step, waiting 1, 2, 4 and 8 minutes; paid kinds may set fewer in their own tickets. |
| Q-0065 | 2026-10-12 | (b): real fixtures are committed only after Josh removes names, addresses and photo location data; the README says so. The repository will be made private after the app is built (public for now for the free tooling). |
| Q-0067 | 2026-10-12 | (b): failed-job and failed-webhook emails also go to the Owner(s) of that job's company; errors with no company go to the single ALERT_EMAIL_TO address. |
| Q-0068 | 2026-10-12 | (a): one email per failed job and per failed webhook delivery, at most 20 alert emails per rolling hour. |
| Q-0069 | 2026-10-12 | (a): the planner's draft in vault/plans/EZD-024.md Approach Step 8. |
| Q-0070 | 2026-10-12 | (a): a new free Sentry organization with one ezdraft project; Sentry's own new-issue emails turned off. |
| Q-0074 | 2026-10-12 | (a): Backblaze B2. Also: the system limits how much storage each company can use (Q-0089). |
| Q-0075 | 2026-10-12 | (c), Josh's own rule: replaced or deleted file versions kept 90 days off-site, weekly database dumps kept 13 weeks. Users are regularly prompted to delete older data, and each company has a storage limit (Q-0089). |
| Q-0076 | 2026-10-12 | Deferred: Josh decides which accounts serve Gemini and Flux after testing the top options; the live render trial moves to after Phase 10 (Q-0082). EZD-021 builds the adapters with the endpoint configurable. |
| Q-0077 | 2026-10-12 | Build both modes, chosen per environment: previews default to AI_MODE=stub now (no paid accounts); a setting can switch a preview to live later if Josh allows small tests. |
| Q-0078 | 2026-10-12 | (a): EZ Binder keeps each EZ Draft project id and opens that project; with only a job id, EZ Draft shows that job's projects. |
| Q-0080 | 2026-10-12 | (b): the version the client signed off (selection set approval), with client-ready renders. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0081 | 2026-10-12 | (a): EZ Binder asks for the project type and sends it; type is required in the contract. |
| Q-0082 | 2026-10-12 | Deferred: the live render trial runs after Phase 10, using the app's real 3D views. EZD-031 closes in Phase 0 on its stub run; the provider pick (R21) is needed before Phase 11. |
| Q-0083 | 2026-10-12 | (a): fixed opening sentence plus one or two sentences from Josh per room on finishes. |
| Q-0084 | 2026-10-12 | Deferred: Josh chooses models and settings when he runs the trial (after Phase 10); the script lets him pick at run time. |
| Q-0086 | 2026-10-12 | (a): "Can't reach the database. Try again in a minute." / "You don't have permission to do that." / "That job no longer exists." |
| Q-0020 | 2026-10-12 | Build it: Phase 11 still builds the local render worker protocol (R18 stands), for a future GPU machine. |
| Q-0088 | 2026-10-12 | Tablet targets: the full editor is built and tested for the Surface (Surface Pro, about 1440 × 960, model to be confirmed) and iPad landscape (1180 × 820). Josh uses an iPhone in the field and sometimes a Surface; the EZD-027 drawing-speed field run is on the Surface. |
| Q-0090 | 2026-10-12 | Passwords too: people can sign in with email and password as well as by emailed link or 6-digit code. The owner (Manage users) can set a password for a crew member and hand it over, like EZ Binder. Overrides "no passwords" in the EZD-007 row. Invites still generate a copy link for the inviter. |
| Q-0091 | 2026-10-12 | Sign-in page is password first: email and password boxes with "Sign in"; "Email me a sign-in link instead" underneath; "Forgot password? Email me a code". Wrong password: "Email or password is wrong." |
| Q-0092 | 2026-10-12 | Reset-requested email (no link): "Someone asked to reset your EZ Draft password. Open EZ Draft and choose 'Email me a code' to sign in. If this wasn't you, ignore this email." |
| Q-0093 | 2026-10-12 | No bot check on sign-in for now; revisit before other companies join. |
| Q-0097 | 2026-10-12 | The Surface drawing-speed run (EZD-027) is judged as a tablet: 30 fps, 95th-percentile frame ≤ 34.33 ms, no frame over 100 ms. |
| Q-0098 | 2026-10-12 | Icon-only header buttons: Share uses `share`, Export uses `download`. |
| Q-0099 | 2026-10-12 | A person with valid invites from several companies who signs in gets the most recent invite accepted; the others stay pending. |
| Q-0100 | 2026-10-12 | "You're signed out. Sign in again to continue." and the sign-in spam hint "Not in your inbox? Check your spam or junk folder." |
| Q-0101 | 2026-10-12 | Sign-in throttle messages: "Too many wrong passwords. Use 'Forgot password? Email me a code', or try again in 15 minutes." / "Too many wrong codes. Try again in 15 minutes." / "Too many sign-in emails. Try again in an hour." / "Too many sign-in tries from this network. Try again in 15 minutes." |
| Q-0102 | 2026-10-12 | Recovery email subject "EZ Draft password reset requested"; confirmation-code email subject "Your EZ Draft confirmation code", body "Type this code in EZ Draft to confirm it's you: {code}. If you didn't ask for this, ignore this email." |

Still pending from Josh as of 2026-10-11 (tickets that depend on these stay blocked; everything else continues): R23 vendor cabinet line, Supplier 2020 sample, architect DXFs, real per-render costs.
