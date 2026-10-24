# Spec index

The spec is split one file per section and one file per screen so an agent loads only what its ticket names.

**Every builder reads on every ticket:** `02-data-model.md` (including Architecture rules), `03-app-shell-and-global-ui.md`, the Performance part of `10-non-functional-requirements.md`, and the conventions file from EZD-000. Then the files its Spec ref names (see `tickets/tickets.json`, field `spec_files`).

| # | Section | File | Characters |
| --- | --- | --- | --- |
| 0 | How to use this spec | spec/00-how-to-use-this-spec.md | 4,102 |
| 1 | Product overview | spec/01-product-overview.md | 8,826 |
| 2 | Data model | spec/02-data-model.md | 20,594 |
| 3 | App shell and global UI | spec/03-app-shell-and-global-ui.md | 8,562 |
| 4 | Screen-by-screen spec | spec/screens/README.md (one file per screen) | 251,952 |
| 5 | Workflows | spec/05-workflows.md | 9,445 |
| 6 | Hooks, events and integrations | spec/06-hooks-events-and-integrations.md | 6,722 |
| 7 | Import and export | spec/07-import-and-export.md | 10,099 |
| 8 | Calculations and rules | spec/08-calculations-and-rules.md | 26,251 |
| 9 | Permissions and settings | spec/09-permissions-and-settings.md | 3,818 |
| 10 | Non-functional requirements | spec/10-non-functional-requirements.md | 11,128 |
| 11 | Build phases and acceptance tests | spec/11-build-phases-and-acceptance-tests.md | 3,210 |
| 12 | Decisions and remaining items | spec/12-decisions-and-remaining-items.md | 17,195 |

Spec ref shorthand used in tickets: `S06` = screen 06 in `spec/screens/`; `R24 #n` = Round 24 decision n and `R26 Rn` = Round 26 decision Rn, both in `12-decisions-and-remaining-items.md`; Round 26 overrides Round 24, and both override everything else.

`_full-spec.md` is the unsplit export, kept for search and for checking the split. Do not load it for a ticket.
