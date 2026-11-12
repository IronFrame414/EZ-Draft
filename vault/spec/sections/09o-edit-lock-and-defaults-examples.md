# Worked examples · edit lock and Defaults (phase 8)

Added by spec-check 8 (Q-0697). Phase 8 has no calculations; these are its timers, counters and value rules, each with cases. The rules are in decisions 03-data-model, 04-app-shell-and-global-ui, 05-screens and 10-permissions-and-settings, rows Q-0697.

## Auto-release deadline (EZD-125)

deadline_at = requested_at + the Defaults minutes read at request time.

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | Request at 9:42:10, Defaults 5 minutes | Deadline 9:47:10; a sweep at 9:48:00 releases (up to 60 s late); any lock read or save after 9:47:10 releases at once | S15d:45; Q-0697 |
| 2 | Request at 9:42:10, Defaults 1 minute (test script) | Deadline 9:43:10 | PHASES slice 8 step 4 |
| 3 | Request at 5 minutes, Defaults changed to 2 at 9:43 | Deadline stays 9:47:10 | Q-0697 |
| 4 | Holder presses Keep at 9:47:11 | Refused; the auto release already won | Q-0697 |
| 5 | Minutes typed 0, 1, 1,440, 1,441, 2.5 | Refused, saved, saved, refused, refused | Q-0697 |

## lock_epoch (EZD-125)

| # | Case | Epoch | Source |
| --- | --- | --- | --- |
| 1 | Free project (0), A starts editing | 1 | 03b rule 6 |
| 2 | A opens a second tab | stays 1; both tabs save | Q-0697 |
| 3 | Auto release | 2; A's queued save with 1 is refused | Q-0697 |
| 4 | B starts editing | 3; B saves with 3 | 03b rule 6 |
| 5 | A's first tab released; A's second tab saves with the old epoch | Refused with the "your other device released" wording | Q-0697 |

## Requests (EZD-125, EZD-126)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | B requests; B requests again | Second refused; after Cancel a new one is accepted | S06:75 |
| 2 | A (holder) requests | Refused | S06:20 |
| 3 | B requests just after the lock went free | Told it is free; green toast | Q-0697 |
| 4 | Toast for a viewer without Edit model | No button; clears after 5 s | Q-0058 |
| 5 | Toast for a viewer with Edit model | Start editing; stays until used or closed | Q-0058 |

## Value checks (EZD-116, EZD-130)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | Percent −1, 0, 100, 100.5 | Refused, saved, saved, refused | S15d:61 |
| 2 | Length "12 6" | Refused with the formats message | Q-0561 |
| 3 | Length 12.5' | Saved as 150" | Q-0561 |
| 4 | Standard overhang 1 1/2", seating limit 1 1/2" | Refused (must be above) | S15d:62 |
| 5 | Standard overhang 1 1/2", seating limit 12" | Saved | S15d:62 |
| 6 | Seating limit empty | Support check off; features that need it show "Set in Defaults" | S15d:31 |

## Effective value (EZD-116)

| # | Stored | Registry default | Shown | Source |
| --- | --- | --- | --- | --- |
| 1 | none | 3" | 3" | Q-0697 |
| 2 | 4" | 3" | 4" | Q-0697 |
| 3 | none | none | Not set | S15d:56 |

## Copy at creation (EZD-116, EZD-130)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | Company tile waste 10%; project P created; company changed to 12% | P keeps 10%; a new project gets 12% | S15d Decision 4 |
| 2 | P's tile waste changed to 15% in Project settings | Only P changes | EZD-130 row |
| 3 | Project made before EZD-116 (no copy); company 12% | Shows 12% live; Save in Project settings stores a copy | Q-0697 |
| 4 | Pattern adjustment changed at company level | Every project reads the new value (not copied) | S15d:42; Q-0697 |
