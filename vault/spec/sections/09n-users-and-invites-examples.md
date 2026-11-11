# Worked examples · users, switches, invites and project scope (phase 7)

Added by spec-check 7 (Q-0695). Phase 7 has no calculations; these are its counting, timing and guard rules, each with cases. The rules are in decisions 10-permissions-and-settings, 03-data-model and 05-screens, rows Q-0695. Switch keys and groups are `app/src/lib/permissions/catalog.ts`; preset grants are migration `20261024100001`.

## Switch counts (EZD-104, EZD-106)

| # | Case | Shown | Source |
| --- | --- | --- | --- |
| 1 | Owner preset, unchanged | "37 / 37", role pill "Owner" | catalog.ts:16-54; 20261024100001 |
| 2 | Crew preset, unchanged | "4 / 37", "Crew" | same |
| 3 | Foreman preset with See company costs ticked | "12 / 37", "Foreman (modified)" | Q-0235; S15 Role select |
| 4 | Designer preset, admin group | "2 of 10" (settings_catalog, settings_libraries) | Q-0223 |
| 5 | Foreman with one switch unticked, then Reset | back to "11 / 37", "(modified)" gone, nothing saved until Save | S15 Controls |

## Invite expiry (EZD-105, EZD-138)

The link and code are valid for 7 days from the last send (invited_at; Resend moves it).

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | Sent day 0 at 00:00, Accept pressed day 6 at 23:59 | Accepted | invite_is_valid; Q-0216 |
| 2 | Same invite, Accept pressed day 7 at 00:01 | Refused, expired | same |
| 3 | Resend on day 6, Accept on day 12 | Accepted (clock reset; the old link and code no longer work) | Q-0695 |
| 4 | Link opened by an email scanner (GET only) | Nothing accepted; the page shows Accept | Q-0695; architecture "Password sign-in" pattern |

## Invite code tries (EZD-138)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | 4 wrong codes, then the right one | Accepted | Q-0695 |
| 2 | 5 wrong codes | Code locked until Resend; the link still works | Q-0695 (security-reviewer) |
| 3 | Unknown email, email with no invite, wrong code | The same one answer for all three | Q-0695 (security-reviewer) |
| 4 | Right code after Accept already done | Refused (single use) | Q-0695 |

## Last settings_users holder (EZD-106)

Counted: active memberships with settings_users granted. Only a change from 1 to 0 is refused.

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | 2 active holders; untick one | Allowed (count 2 to 1) | S15 Validation; Q-0695 |
| 2 | 1 active holder; deactivate them | Refused, last_settings_users_holder | same |
| 3 | 1 active holder and 1 invited holder; remove the active one | Refused (invited does not count) | same |
| 4 | 2 active holders untick each other at the same moment | One succeeds, the other is refused (per-tenant lock, then recount) | Q-0695 (security-reviewer) |
| 5 | Company deleted | Allowed (cascade passes, role_preset_guard precedent) | 20261024100002:22 |

## Status bar and Last active (EZD-104)

| # | Case | Shown | Source |
| --- | --- | --- | --- |
| 1 | 4 active, 1 invited, 1 deactivated | "Users 4 active · 1 invited" | S15 board |
| 2 | 3 English, 2 Spanish active or invited | "Languages EN 3 · ES 2" | S15 board |
| 3 | Last request 0 s and 59 s ago | "Now" | Q-0695 |
| 4 | 12 min ago | "12 min ago" | Q-0695 |
| 5 | 26 h ago | "Yesterday" | Q-0695 |
| 6 | 40 days ago | the date | Q-0695 |
| 7 | Never signed in | "—" | Q-0695 |
| 8 | Two requests 10 min apart | one write of last_active_at (at most once per 15 min) | Q-0695 |

## Project scope (EZD-129)

| # | Case | Result | Source |
| --- | --- | --- | --- |
| 1 | Listed, one project | Projects shows that project only; the API returns zero rows for any other project id | phase-01 EZD-129; RLS 20261019170006:34 |
| 2 | Listed, zero projects | Saves; Projects is empty | Q-0695 |
| 3 | Scope changed from All to Listed | The user's sessions end; the next sign-in reads the new scope | 20261026112732; Q-0695 |
| 4 | A project added to a Listed user's list | Applies on their next request; no sign-out | Q-0695 (security-reviewer) |
| 5 | New invite as Foreman, Crew or a custom role | Defaults to Listed; Owner and Designer default to All | S15 D13; Q-0695 |
