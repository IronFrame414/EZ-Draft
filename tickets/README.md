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
3. The QA agent runs the whole test suite, not only the new test, and checks the ticket against its Spec ref and mockup.
4. Tests never call a live AI model, email provider, render provider or EZ Binder. They use the recorded fixtures and stubs from EZD-008, EZD-016, EZD-019 and EZD-021. Timers such as the 5-minute lock release are read from Defaults so tests can shorten them.
5. If the spec does not decide something, write the question to the handoff file and go on to the next ticket that does not depend on the answer. Do not guess. A layout detail with no rule follows the nearest Studio mockup. The mockup for screen Snn is the Studio board with the same number; boards on the Polished, Refined and Layout C pages of the design canvas are superseded and are never used.
6. A screen marked "needs a mockup before build" is built from its Layout and Controls text with the Studio shell components unless Josh supplies a mockup first.
7. Each phase gate has two parts. The build gate is automated and must pass before the next phase starts. The field check is Josh's own test on real jobs and devices; it does not block the next phase, and what it finds becomes new tickets.
8. A ticket listed under Needs from Josh waits for that item. Use the placeholder fixture if one is named; otherwise skip the ticket, note it in the handoff file and continue.

**Files in this folder**

- `phase-NN-*.md`: one file per phase with its goal, gate and ticket table (the ticket text, unchanged from the Phases and tickets tab, doc revision 634).
- `tickets.json`: the same tickets as data, with parsed dependencies, spec files and mockup for each.
- `status.json`: the status ledger. One entry per ticket: status (not started, in progress, passed, blocked), commit, note. The coordinator is the only writer.
- `needs-from-josh.md`: things no agent can produce.
- `not-in-v1.md`: deferred items; no ticket covers them.
- `../tools/next_ticket.py`: prints the next ready ticket from tickets.json and status.json.
