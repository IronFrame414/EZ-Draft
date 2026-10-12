# Known limits of the vault documents

Every agent that plans, builds or reviews reads this once. None of these blocks the start. (From the planning session's setup brief, Oct 11, 2026.)

1. **`spec_files` in `tickets/tickets.json` is best-effort.** It was derived from each ticket's Spec ref text. The Spec ref text governs. Some sub-heading references (for example "Geometry rules", "Objects inside model_json") sit inside files the ticket already lists or inside Data model (`03`) and Calculations (`09`).
2. **Electrical rules are not checked against the code book.** Of the 480 NEC rules, 307 come from published summaries and 173 are unverified; the NEC text could not be opened. Of the 768 Florida rules, 756 were read from the code text in the official online viewer, 5 come from published summaries and 7 are unverified. Every rule ships with the "not yet verified" tag until a licensed person marks it in Settings 15g (EZD-1710).
3. **Rule tickets take their numbers from the catalog's check text** in `spec/code-rules.json`. They must not look up, quote or copy code text.
4. **Code editions.** In force now: Florida Building Code 8th Edition (2023) with the 2020 NEC. For permits applied for after December 31, 2026: 9th Edition with the 2023 NEC. The catalog's `section_now` and `section_next` hold both. Some mockups show "NEC 2023 · FBC 9th ed."; that is sample data for a 9th Edition project.
5. **Mockup sample data is not a decision.** Names, prices and numbers on the boards are illustration, except the Electrical board's load calculation (35,868 VA, 149.5 A), which matches the worked example in Calculations.
6. **The Oct 11 audit's counts are historical** (346, then 381 tickets). The current count is 401.
7. **Not verified yet:** whether Playwright's WebKit supports the Phase 14 service-worker tests (found out in Phase 14), and whether CI machines hold the frame budgets without a GPU (Round 26 moved the CI gate to countable measures).
8. **The last 31 ticket-table edits** (the code-rule tickets, Phase 6) were exported from the doc but not diffed cell by cell against the intended text. Planners read those rows with extra care and raise anything that looks inconsistent as a question.
9. **29 tickets depend on a later-numbered ticket in the same phase**, so "next number" is not the rule. Use `node vault/tools/next_ticket.mjs`, which follows `depends_on` in `tickets/tickets.json` (base IDs such as EZD-120 already expanded to every lettered part).

- **Direct Supabase Auth calls bypass the app sign-in throttle (Q-0105, Oct 12, 2026).** Anyone with the public key can call Supabase Auth's password and code endpoints directly; those calls are limited only by Supabase's per-IP limits, the 15-character minimum, leaked-password protection and the unconfirmed-password guard. Accepted for tenant 1; revisit before other companies join and at EZD-1705.
