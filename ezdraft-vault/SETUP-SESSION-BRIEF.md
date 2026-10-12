# Brief for the build-setup session

Reading this file, `README.md`, `tickets/README.md` and `spec/INDEX.md` is enough to start. Do not load `spec/_full-spec.md`.

## 1. What this session produces

No app code. The session ends when a fresh Claude Code session can run the coordinator and have it start EZD-000 with nothing else explained.

1. A GitHub repository with this vault committed at `vault/` (or the path chosen in 3.1), connected to Vercel.
2. `.claude/agents/coordinator.md`, `builder.md` and `qa.md`, each with its own `model:` line.
3. A root `CLAUDE.md` that points at the vault and states the session rules in section 2.
4. A session-end hook that updates `vault/handoff.md` and fails the session if the ledger and handoff disagree.
5. The decisions in section 3, recorded in `vault/decisions.md`.
6. A dry run: `python3 vault/tools/next_ticket.py` prints EZD-000; the coordinator, given no other input, picks the same ticket.

## 2. The build structure Josh chose

- Plan mode is used before a ticket is built.
- Work is split into phases and tickets. One ticket is one session or one builder subagent, so no session carries another ticket's context.
- Three subagents in `.claude/agents/`: coordinator, builder, QA. Each has its own `model:`.
- An optional plan review happens before the architecture is locked. EZD-000 (conventions) and the five spikes EZD-027 to EZD-031 are that point: nothing in Phase 2 starts before their go or no-go notes exist.
- The vault holds the canonical spec, the decisions and the handoff file. The handoff file is updated at the end of every session, by a session-end hook.
- One commit per passing ticket.
- GitHub repository; Vercel deploys.

Roles, as the tickets assume them:

| Agent | Reads | Does | Writes |
| --- | --- | --- | --- |
| Coordinator | `handoff.md`, `tickets/status.json`, `tools/next_ticket.py` output | Picks the next ready ticket; starts one builder, then one QA; never builds | `status.json`, `handoff.md` |
| Builder | The ticket row, its `spec_files`, `spec/02`, `spec/03`, Performance in `spec/10`, the conventions file, its mockup | Builds the ticket and its Done-when test in one change | Code and tests; questions to the coordinator |
| QA | The ticket row, its Spec ref files and mockup, the diff | Runs the tests; checks the result against Spec ref and mockup; passes or returns it | A pass or a list of failures |

Coordinator rule: work phases in order; in the current phase take the lowest-numbered ticket whose dependencies are all passed. A dependency on a base ID (EZD-120) means every lettered part. `tickets.json` has these already expanded in `depends_on`, and `build_order` is one valid full order (401 tickets, checked: no cycles, every dependency in the same or an earlier phase). 29 tickets depend on a later-numbered ticket in the same phase, so "next number" is not the rule.

The eight rules for build agents are in `tickets/README.md`. The two that shape agent prompts: a builder that finds the spec undecided writes the question to the handoff file and the coordinator moves on (rule 5, no guessing); a ticket waiting on a Needs from Josh item uses the named placeholder fixture or is marked blocked (rule 8).

## 3. Decisions the setup session must make

Each has a recommended default. Record the choice in `decisions.md`.

| # | Decision | Recommended | Why it is open |
| --- | --- | --- | --- |
| 3.1 | Source of truth after this export | The vault files in the repo. The Claude documents are frozen as of Oct 11 and marked superseded. | The spec lived in a Claude document that Claude Code agents cannot open. Two editable copies will drift. |
| 3.2 | Vault location | `vault/` inside the app repository | One commit can change code and the spec file it affects; agents need no second checkout. EZD-000 says the conventions files are "copied to the vault", which assumes this. |
| 3.3 | Commit and branch policy | One branch per ticket; QA pass, then squash-merge to main as one commit; CI on the branch | EZD-002 says a failing test blocks merge and each branch gets a preview deploy. The plan says one commit per passing ticket. Squash-merge satisfies both. |
| 3.4 | What QA runs per ticket | The current phase's tests plus a smoke set; CI runs everything on the branch before merge | Rule 3 says QA runs the whole suite. With three device sizes and several hundred browser tests that becomes slow by about Phase 10. Changing it means editing rule 3 in `tickets/README.md`. |
| 3.5 | Production deploys | Only at a phase gate or on Josh's approval; previews on every branch | Round 26 sets this; the Vercel project settings must match. |
| 3.6 | Models per agent | Set in each agent file | Josh's call. |
| 3.7 | Who edits spec files during the build | The coordinator only, in the same commit as the `decisions.md` row | Otherwise builders "fix" the spec to match their code. |
| 3.8 | Oversized tickets | The coordinator may split a ticket into lettered parts before work starts, adding rows to the phase file, `tickets.json` and `status.json` | The tickets tab already allows this. The 20 code-rule tickets (EZD-611b, 611c, 616 to 618, 621 to 639) each cover about 30 checks plus about 35 reminders and are the likeliest to need it. |

## 4. Setup checklist

- [ ] Create the GitHub repository; enable Actions; connect Vercel; confirm a preview deploy of an empty commit.
- [ ] Commit this vault (3.2). Do not commit `spec/_full-spec.md` into any agent's default reading list.
- [ ] Write the three agent files and the root `CLAUDE.md`. The coordinator file repeats the coordinator rule above and the blocked-ticket rule.
- [ ] Write the session-end hook. It rewrites the State block of `handoff.md` from `status.json` and runs `tools/next_ticket.py`, which exits non-zero when the ledger has a passed ticket with no commit, a blocked ticket with no note, or an unknown status.
- [ ] Agent machine: Docker Desktop (local Supabase, EZD-004), Node and pnpm, Supabase CLI, Playwright browsers including WebKit.
- [ ] Record decisions 3.1 to 3.8.
- [ ] Give Josh the Needs from Josh list (`tickets/needs-from-josh.md`). Phase 0 passes on the local Supabase and stub email; only EZD-003 and the cloud steps of EZD-004 and EZD-008 wait for accounts and keys.
- [ ] Dry run (section 1, item 6).

Not part of setup: EZD-000 writes `docs/architecture.md` and the conventions. The setup session creates the agents and the hook; it does not choose library versions.

## 5. What is in the package

| Item | State |
| --- | --- |
| Spec | 12 section files and 34 screen files, split from doc revision 502. The split was checked against the full export. |
| Tickets | 401 tickets, 18 phases, from doc revision 634. `tickets.json` adds parsed `depends_on`, `spec_files` and `mockups` for each ticket. |
| Ledger | `status.json`, all 401 not started. |
| Code rules | 1,248 rules: 277 Automatic, 276 Needs data, 695 Reminder. Each has its section for both editions. |
| Mockups | 22 Studio boards as PNG and source. 13 spec screens have no mockup (list in `mockups/INDEX.md`). |
| Audit | The Oct 11 audit, as a record. |

## 6. Known limits of these documents

State these to the agents where they apply; none blocks the start.

- **`spec_files` is a best-effort map.** It was derived from each ticket's Spec ref text. The Spec ref text governs. Seventeen sub-heading references (for example "Geometry rules", "Objects inside model_json") were not matched to a file automatically; they sit inside files the ticket already lists or inside `spec/02` and `spec/08`.
- **Electrical rules are not checked against the code book.** Of the 480 NEC rules, 307 come from published summaries and 173 are unverified; the NEC text could not be opened. Of the 768 Florida rules, 756 were read from the code text in the official online viewer; 5 come from published summaries and 7 are unverified. Every rule ships with the "not yet verified" tag until a licensed person marks it in Settings 15g (EZD-1710). A rule ticket must take its numbers from the catalog's check text and must not look up or copy code text.
- **Code editions.** In force now: Florida Building Code 8th Edition (2023) with the 2020 NEC. For permits applied for after December 31, 2026: 9th Edition with the 2023 NEC. The catalog's `section_now` and `section_next` hold both. Some mockup sample text shows "NEC 2023 · FBC 9th ed."; that is sample data for a 9th Edition project.
- **Mockup sample data is not a decision.** Names, prices and numbers in boards are illustration, except the Electrical board's load calculation, which matches the worked example in `spec/08`.
- **The audit's counts are historical.** Its sections were written at different passes (346, then 381 tickets). The current count is 401.
- **Not verified:** whether Playwright's WebKit supports the Phase 14 service-worker tests, and whether CI machines hold the frame budgets without a GPU. Round 26 moved the CI gate to countable measures for the second; the first is found out in Phase 14.
- **The last 31 ticket-table edits** (the code-rule tickets) were applied to the Claude document and exported here; the export shows all 401 tickets with resolvable dependencies, but those rows were not diffed cell by cell against the intended text as the earlier ones were.

## 7. Open items for Josh

None blocks Phase 0.

- Accounts and keys (GitHub, Vercel, Supabase dev and prod, DNS, email provider, Claude API key, image-model keys, Sentry, second-provider backup bucket).
- Sample files: a Polycam export, plan PDFs, 2 to 3 architect DXFs, a supplier 2020 sample, a hand load calc, a hand material count, a past cabinet order.
- Review of five decisions Claude made in Round 26: R14 (signer check is a typed email with an attempt limit), R17 (Spanish for crew phone screens only), R18 (cloud render first until the GPU test passes), R21 (first render provider), R24 (which walls get elevations).
- NEC access for a verification pass on the electrical rules, or a licensed person marking them in Settings 15g.
- Terms of service text; a real vendor cabinet line; mockups for the 13 screens without one (optional; rule 6 covers building without them).
- EZ Binder's side of the integration contract (EZD-019). EZ Draft runs against the stub until then.
