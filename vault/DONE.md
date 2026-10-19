# Done

Append-only. One line per merged ticket: date · ticket · title · user-visible result · commit.
2026-10-19 · EZD-000 · Architecture conventions · docs/architecture.md pins one version per Named tools row; the gate now fails when package.json holds an unlisted dependency · 1739318
2026-10-19 · EZD-000b · Hidden-token settings and honesty rules · Claude sessions in the repo turn off the task list, prompt suggestions, auto-compaction, token reminders and goal check-ins; CLAUDE.md and the three reviewers carry honesty rules 14-16 · 2929564
2026-10-19 · EZD-000c · Whole-read guard and outline tool · Claude sessions in the repo that try to load a file over 20,000 characters in one go get its outline back and read only the ranges they need; vault/tools/outline.mjs prints that outline · 3b7c7c1
2026-10-19 · EZD-000d · Research report store · agent lookups are saved once as numbered reports R-001, R-002 … in vault/research/ with a one-line index; vault/tools/research.mjs files pending reports, and planners cite them instead of repeating the lookup · ffa76d7
2026-10-19 · EZD-000e · Retriever agents and dispatch brief · the planner and the three reviewers can hand a big lookup to a cheap Haiku retriever (retriever-digest for repo documents, retriever-web for the web) and get back a short answer with pointers; the builder, test-author and other agents cannot start agents · 89d95e9
2026-10-19 · EZD-000f · Retriever spawn limits · only the planner and the three reviewers can start a helper agent, and only a retriever; the builder, test-author, ui-verifier and retrievers cannot start any; retrievers can write only their report under vault/research/pending/; the main session still starts every agent · 5a8ebe3
