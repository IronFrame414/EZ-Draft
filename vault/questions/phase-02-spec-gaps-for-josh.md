# Phase 2 spec gaps for Josh · Projects list and new project

Stage 0 (spec-check 2), 2026-10-28. Phase 2 is the re-cut phase (vault/tickets/PHASES.md, Q-0218): EZD-108, 110, 117a, 117b, 118, 137, 140. Not the old geometry file `vault/tickets/phases/phase-02.md`, which is spec phase 2 and is now phases 3 to 6. Phase-auditor run 1 found 31 gaps against `vault/spec/READINESS.md`: 13 questions below need Josh; the rest an agent settles with a citation (end of file). User-visible wording not on a mockup is proposed by the planner and approved at Stage 2 (vault/PROCESS.md 3a), so it is not asked here. Q-IDs: Q-0390 to Q-0403.

## For Josh

**1. Phase goal (gap 2).** PHASES.md gives phase 2 only a name.
- Recommended: Goal "The office sees every project on one page, starts a new project, marks one complete, and gets notifications in the app and by email, each chosen per person." Result Josh checks: sign in, see Projects with its tabs and search, make a standalone project, mark it complete and reopen it, receive a test notification in the bell and by email, turn that email off.

**2. Screens with no mockup (gaps 3, 5, 7).** My profile, the notification list and notification settings have no Studio board.
- Recommended: waive the boards; build from the spec text and the planner's proposed wording (tickets README rule 6). Alternative: make the three boards first (phase 2 waits for them).

**3. My profile contents (gaps 3, 4).**
- Recommended: a dialog from the avatar menu with Language (English / Spanish; helper line that it changes the phone screens only, Q-0121), iPad input mode (Pencil only / Pencil or finger; default Pencil or finger), and Change password (already decided in Q-0096 P6, missing from the ticket) with the password-changed email of Q-0096 P5.

**4. Notification settings (gap 7).**
- Recommended: in My profile, one row per notification kind with two switches, In app and Email, all on by default; either can be turned off (Q-0220 says both). Alternative: In app always on, only Email can be turned off.

**5. What a project opens before the editor exists (gap 13).** The plan editor arrives in phase 3; phase 2 cards and Create need somewhere to go.
- Recommended: open the project's page (`/projects/<id>`) showing the header with the project name only; phase 3 puts the editor there. Alternative: cards not clickable and Create returns to Projects until phase 3.

**6. Mark complete and Reopen (gaps 14, 25).** The card menu (Rename, Archive, Delete) is EZD-124 in phase 9.
- Recommended: a small ⋯ menu on the card now with Mark complete or Reopen; phase 9 adds the rest to it. Tab "Completed", status "Complete", grey pill; completed projects leave All and the other tabs; Reopen puts back the status it had before; allowed for anyone who can edit that project (Q-0202), no new switch. Alternative: move EZD-137 to phase 9 with the card menu.

**7. Scope of work field (gap 15).**
- Recommended: optional, several lines, in step 1 below Type; it prints in the title block (Q-0186). Editable later in Project settings (EZD-130).

**8. Foreman picker (gap 16).** It needs the users list and project listing, built in phase 7 (EZD-104, EZD-129).
- Recommended: add the Foreman picker to the wizard in phase 7 (EZD-129), not now. Alternative: build it now listing every active member, optional.

**9. Input sources in step 2 (gap 17).** Six sources (Q-0189); only Blank works in phase 2 (templates phase 4, files phase 12, field measure phase 14).
- Recommended: show only the sources already built; each appears when its phase ships (same as Q-0226 for Settings pages). Alternative: show all six with the unbuilt ones greyed out.

**10. Code edition and submittal profile in the wizard (gap 18).** The ticket says one fixed entry, stored empty, until the code engine (phase 21) and submittal profiles (phase 27). KNOWN-LIMITS: FBC 8th ed. with NEC 2020 is in force now; 9th ed. with NEC 2023 for permits applied for after Dec 31, 2026. The mockup's "FBC 9th ed. · NEC 2023" is sample data.
- Recommended: hide both fields until their phase builds them; set them in Project settings then. Alternative: show a fixed "FBC 8th ed. · NEC 2020" now (stored empty).

**11. Picking a customer without the Company switch (gap 21, left open by Q-0227).**
- Recommended: anyone with Create projects can pick from the customer list; "Add new customer" in the wizard shows only to people with the Company switch. Alternative: anyone with Create projects can also add a customer.

**12. EZ Binder on Projects (gap 8).** Q-0190 removed the connection. The ticket and board still show "From an EZ Binder job", "synced with EZ Binder" and an EZ Binder link in the header.
- Recommended: remove the menu item and the synced text (New project offers Standalone and Start from a file); keep a plain "EZ Binder" header link that opens ezcontractorbinder.com in a new tab. Alternative: remove the header link too.

**13. Tab counts while searching (gap 27).**
- Recommended: the counts follow the search text. Alternative: counts always show the whole list.

## Settled by an agent (say if you object)

- Gap 1: per-user notification settings are in v1 (Q-0220); non-goals.md line 20 is overridden by a decision row, SMS stays out.
- Gap 4: Change password belongs to EZD-108 (Q-0096 P6, vault/plans/EZD-033.md).
- Gap 6: notification kinds are the nine in 04-app-shell section Notifications; "Sent to the EZ Binder feed" dropped (Q-0190); phase 2 tests use a test kind.
- Gap 9: the Settings gear shows to anyone with at least one Settings page switch (Q-0210, Q-0226).
- Gap 10: no-access text is "You don't have access to this. Ask your supervisor." (Q-0214 overrides S01).
- Gap 12: card version label reads "Working copy", empty thumbnail slot, open items from project.open_items_count until their phases (S01 Data shown).
- Gap 22: Property appraiser link is EZD-711 (phase 26), not in EZD-118.
- Gap 23: project.settings starts empty; the Defaults copy comes with EZD-116 and EZD-130 (phase 8).
- Gap 24: a notification for a project that is gone or hidden shows "That job no longer exists." or "You don't have permission to do that." (Q-0086).
- Gaps 26, 28, 29, 30: sort order, performance budget, the Complete status column and the notification link field are build details, each settled in the plan with a citation.
- Gap 31: glossary addendum `vault/spec/sections/00c-glossary-phase-02.md` (definitions only, precedent Q-0231).
- Wording (gaps 4, 5, 6, 11, 15, 19, 20): proposed by the planner, approved by Josh at Stage 2 (PROCESS.md 3a).

## Answers (Josh, 2026-10-28, in chat)

1 Q-0390 recommended; 2 Q-0391 (b) draw the boards first, then "approve" for boards 01c to 01f; 3 Q-0392 recommended; 4 Q-0393 recommended; 5 Q-0394 alternative, "cant be clicked yet. no reason to build something that will is planned to be changed"; 6 Q-0395 alternative (EZD-137 to phase 9); 7 Q-0396, 8 Q-0397, 9 Q-0398, 10 Q-0399 recommended; 11 Q-0400 "anyone who can create a project can create new clients"; 12 Q-0401 "drop the link too"; 13 Q-0402 recommended. Agent-settled list: Q-0403 (no objection). Recorded as decision rows; ACs written (acs_source stage-0).

## Round 2 (re-audit after the answers): 11 gaps, 3 for Josh

**1. New project button with one entry point.** Recommended: opens the wizard directly; the menu returns with a second entry point. Alternative: a one-item menu.
**2. Wizard step 2 with nothing to choose.** Recommended: one step, Create on step 1; step 2 returns with templates (EZD-221). Alternative: keep two steps.
**3. Change password for a user with no password.** Recommended: "Set password" with New and Confirm only. Alternative: hide it and point to Forgot password.

Answer (2026-10-28): "accept recs". Recorded as Q-0410, Q-0411, Q-0412. Agent-settled gaps 4 to 11: Q-0413 (the event-sink gap was checked and is not a gap: the emitter exists). ACs updated.

## Round 3: 4 gaps, none for Josh

Settled by the orchestrator as Q-0414: the wizard's customer list and add supersede AC-EZD-113-6 there (Q-0400; the EZD-118 plan changes the route and EZD-113's test); the password-set email joins AC-EZD-108-8 (Q-0096 P5); the offline state joins AC-EZD-117b-5; AC-EZD-110-5 drops the clause EZD-140 tests.

## Round 4: 2 gaps, none for Josh

Settled by the orchestrator as Q-0422: the Projects page is the signed-in home at /, so phase 2 notification links are / (correcting /projects); EZD-108 ships My profile with the Profile tab only and EZD-140 adds the Notifications tab, now depending on EZD-108.

## Round 5: 1 gap, none for Josh

Settled by the orchestrator as Q-0425: the notification list loads 20 at a time.
