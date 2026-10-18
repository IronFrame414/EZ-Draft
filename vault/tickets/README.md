> **Build-process overrides (Oct 11, 2026; process v2 Oct 18).** Where this file and `vault/PROCESS.md` or `vault/PROCESS-EZDRAFT.md` differ, those win:
> - The "Done when" test is written by the **test-author** before the builder starts, not by the builder (rule "Done when" below). Each Done-when sentence is an acceptance criterion `AC-<ticket>-<n>` (`vault/spec/acceptance-criteria.md`).
> - Questions go to `vault/questions/QUESTIONS.md` through the chain of command, not to the handoff file (rules 5 and 8).
> - "Coordinator" in this file means the orchestrator (the main session). "QA agent" means code-reviewer (plus ui-verifier, security-reviewer and calc-auditor as the plan says).
> - Phases: the spec's phases 1 to 17 are re-cut into slices in `vault/tickets/PHASES.md` (Josh approves); the tables in `phases/` stay the source of each ticket's text.

# EZ Draft: Phases and tickets

There is no schedule. Work the phases in order; within a phase, work the tickets in order unless "Depends on" says otherwise. A ticket is ready when every ticket in its Depends on column is committed; the coordinator always takes the lowest-numbered ready ticket in the current phase, so a ticket that depends on a later-numbered one waits for it. Each phase ends with a gate: the phase is done when its gate test passes.

**How tickets are written**

- ID format is EZD-\<phase>\<nn>. Phase 0 tickets are EZD-001 to EZD-0nn; phase 1 starts at EZD-101; phase 10 starts at EZD-1001.
- Each ticket is one build session: one builder agent, one QA review, one commit when it passes. A ticket that will not fit one session is split into lettered parts (EZD-217a, EZD-217b) before work starts, never left half done. A dependency on a split ticket's base number (EZD-120) means all of its lettered parts. Spike tickets (EZD-027 to EZD-031) are throwaway tests kept under /spikes and never imported by the app; each ends with a go or no-go note in the vault.
- Spec ref names the section or screen in the main tab. S01 to S18b are the screen numbers in Screen-by-screen spec. R24 #n is Round 24 decision n in Decisions and remaining items, which overrides everything else. R26 Rn is Round 26 decision Rn (the Oct 11 build-readiness audit), which overrides Round 24 where they differ.
- "Done when" is the test that closes the ticket. The builder writes it as an automated test (unit test, or browser test in the harness from EZD-016) in the same commit. Values marked "in Defaults" are company settings the owner enters (S15d).
- Any later phase may add its own values to Defaults (EZD-116) and its own items to the review pill (EZD-127). The first ticket whose Scope names a table creates it: migration, tenant\_id, row-level security policy, indexes and a tenant-isolation test in the EZD-006 harness.

**Rules for build agents**

1. Read before building: the ticket row, the sections its Spec ref names, Data model, App shell, and Non-functional requirements (Performance) in the main tab. Also read the Architecture rules in Data model and the conventions file from EZD-000. Do not load the whole spec.
2. The performance rules apply to every ticket. A ticket does not pass if the performance check from EZD-017 fails or a download-size budget is exceeded.
3. Each ticket's check runs the current phase's tests plus a smoke set, not only the new test; the full suite runs at the phase gate (Q-0006, Josh, Oct 11, 2026). The QA agent checks the ticket against its Spec ref and mockup.
4. Tests never call a live AI model, email provider, render provider or EZ Binder. They use the recorded fixtures and stubs from EZD-008, EZD-016, EZD-019 and EZD-021. Timers such as the 5-minute lock release are read from Defaults so tests can shorten them.
5. If the spec does not decide something, write the question to the handoff file and go on to the next ticket that does not depend on the answer. Do not guess. A layout detail with no rule follows the nearest Studio mockup. The mockup for screen Snn is the Studio board with the same number; boards on the Polished, Refined and Layout C pages of the design canvas are superseded and are never used.
6. A screen marked "needs a mockup before build" is built from its Layout and Controls text with the Studio shell components unless Josh supplies a mockup first.
7. Each phase gate has two parts. The build gate is automated and must pass before the next phase starts. The field check is Josh's own test on real jobs and devices; it does not block the next phase, and what it finds becomes new tickets.
8. A ticket listed under Needs from Josh waits for that item. Use the placeholder fixture if one is named; otherwise skip the ticket, note it in the handoff file and continue.

**Needs from Josh**

Things no agent can produce. Supplying them early keeps the build from stopping.

| Item | Needed by | Without it |
| --- | --- | --- |
| Accounts and keys: GitHub repository with Actions for CI, Vercel, Supabase (dev and prod), DNS for the subdomain, email provider, Claude API key, image-model API keys, Sentry, a storage bucket at a second provider for backups | EZD-002, EZD-003, EZD-004, EZD-008, EZD-1103 | EZD-003, the cloud part of EZD-004 and live email in EZD-008 wait. EZD-1103 and every AI ticket do not wait: they are built and tested on the stub providers from EZD-021 |
| A real Polycam export (layered DXF + GLB) from one job | EZD-016, EZD-302, EZD-303 | Detection is built against a synthetic file and may miss real layer names |
| One vector PDF plan, one scanned PDF plan, one supplier kitchen vector PDF | EZD-304, EZD-305, EZD-915 | Built against synthetic files |
| 2–3 architect DXFs | EZD-029, EZD-901, EZD-1702 | The benchmark uses a generated DXF |
| Supplier 2020 sample (DXF + order report) | EZD-916, EZD-918 | Built against the synthetic report committed in EZD-916; re-checked with the real sample |
| A hand load calc for one sample house, and a hand material count for one kitchen | EZD-607, EZD-1611 | Engines are tested only against textbook examples |
| A past kitchen's cabinet order | Phase 4 field check | Field check waits |
| EZ Binder side of the contract (EZD-019): job, customer and user endpoints, shared sign-on, webhook receiver, mark CO approved, model viewer, field pack tab | Field checks of Phases 1, 10, 13, 14 | EZ Draft runs against the stub |
| iPad, iPhone, keyboard-mode laser | Field checks | Automated tests use device emulation and typed keystrokes |
| The GPU machine for the local render worker, and the choice of model to run on it | EZD-1104 follow-up | The worker runs its stub runner; renders use the cloud API |
| Mockups for screens that had none: supplied Oct 11, 2026 (S01b, S15a–S15h, S17c, S19–S22 in `vault/mockups`) | EZD-118, EZD-122, EZD-123, EZD-1013, EZD-1413, EZD-1420, EZD-1613 and the settings tickets | Done |
| Docker Desktop on the Windows build machine (the local Supabase used by agent test runs needs it) | EZD-004, EZD-006, EZD-016 | No local database; agent test runs cannot start |
| Each code rule checked against the adopted code text, with 9th Edition section numbers | EZD-1710 | Rules are built from the tables in Calculations; their warnings carry the “not yet verified” tag |
| Answer to R26 R2: which money numbers Crew and Foreman may see | EZD-133 | Answered: two permissions, See company costs and See sell prices (R26 R2) |
| Terms of service text | EZD-1707 | The page ships with placeholder text |
| A real vendor cabinet line | EZD-401, EZD-408 | The generic seed line is used |
| Mockup exports of the 36 Studio boards in the vault | Every screen ticket | Done |

