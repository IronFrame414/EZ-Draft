# Worked examples · versions, sends, cleanup and the project card (phase 9)

Added by spec-check 9 (Q-0700). Phase 9 has no building-code calculations; these are its numbering, clock, match and diff rules. The rules are in decisions 03-data-model, 05-screens and 10-permissions-and-settings, rows Q-0700.

## Numbering (EZD-121)

version_no = 1 + the highest version_no among the project's sent versions.

| # | Sent before | Result | Source |
| --- | --- | --- | --- |
| 1 | none | Card and header read "Working copy"; the first send makes Version 1 | S01 Data shown; R24 #26 |
| 2 | Version 1, Version 2 | Version 3 | R24 #26 |
| 3 | Version 1; two sends at once | One gets 2, the other 3 | Q-0700 unique index |
| 4 | 149 sent | Version 150 (no cap) | R24 #26 |
| 5 | Nothing changed since Version 3 | Still Version 4 | R24 #16b |

## Cleanup clock (EZD-123)

Due when created_at is at least age days before the run; deleted when the run is at least grace days after cleanup_shown_at.

| # | Age / grace | Version made | Run | Result | Source |
| --- | --- | --- | --- | --- | --- |
| 1 | 30 / 7 | Oct 1 09:00 | Oct 31 03:00 | Not due (29.75 days); due at the Nov 1 03:00 run; deleted at the Nov 8 03:00 run if ignored | R24 #4; Q-0700 |
| 2 | 0 / 7 | today | next run | Due at once; deleted 7 days after that run | PHASES slice 9 step 5 |
| 3 | 30 / 0 | Oct 1 | Oct 31 | Due and deleted in the same run unless the sheet is saved first | S15d:44 |
| 4 | 30 / 7, ticked | any | Save choices | Becomes a named snapshot; never listed again | S20 Keep row |
| 5 | sent or named | any | any | Never listed; the trigger refuses the delete | S20 Version rules |
| 6 | 30 / 7, two batches | A due Nov 1, B due Nov 3 | sheet opened Nov 4 | Footer shows the earliest delete date, Nov 8 | Q-0700 |

## Delete confirmation (EZD-124)

Delete is enabled when the trimmed text equals the project name exactly, case included.

| # | Project name | Typed | Result |
| --- | --- | --- | --- |
| 1 | Kitchen remodel | Kitchen remodel | Enabled |
| 2 | Kitchen remodel | kitchen remodel | Disabled |
| 3 | Kitchen remodel | "  Kitchen remodel " | Enabled (trimmed) |
| 4 | Kitchen remodel | (empty) | Disabled |

## Working-row collapse (EZD-122)

| # | Working rows | Shown |
| --- | --- | --- |
| 1 | 0 | Only the Working copy row |
| 2 | 3 | Three rows, no collapse line |
| 3 | 12 | Three rows, then "+ 9 older" |

## Visual diff (EZD-139)

Old version O against working copy W, by object id.

| # | O | W | Result |
| --- | --- | --- | --- |
| 1 | wall 4 at x = 0 | wall 4 at x = 6" | 1 changed |
| 2 | wall 5 | absent | 1 removed since |
| 3 | absent | wall 9 | 1 added since, not drawn |
| 4 | identical | identical | Nothing highlighted; 0 changed, 0 removed, 0 added |

## Status moves (EZD-124, EZD-137)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | In build → Mark complete | complete; completed_from = in build | Q-0700 |
| 2 | Reopen | In build again; completed_from cleared | Q-0700 |
| 3 | Reopen with completed_from null | Draft | Q-0700 |
| 4 | Send | Status unchanged | Q-0199 |
| 5 | Completed project archived, then restored | Still complete | Q-0700 |

## Token (EZD-111)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | New send | 32 random bytes → 43-character base64url; only its SHA-256 hash is stored | R14; Q-0700 |
| 2 | Opened on day 29 | Resolves | S15d:46 (30 days) |
| 3 | Opened on day 31 | Nothing | S15d:46 |
| 4 | Project deleted | Nothing, at once | Q-0700 |
