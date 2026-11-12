# Phase 8 · for Josh (spec-check 8, 2026-11-11)

Phase 8: Defaults, the edit lock and Project settings. The spec check found 24 gaps. Agents settled 22 under your standing rule (CLAUDE.md rule 3); the code-reviewer checked the lock and data answers and the security-reviewer the permission answers. They are recorded as Q-0697 in the decisions files. Two design questions wait for you. Phase 8 is ready for your sign-off. Only EZD-128 and EZD-130 wait on these questions.

## 1. Design questions (answer by number)

1. **Q-0698 · Project switcher menu.** Clicking the project name in the header opens a menu to jump to another project. No board shows it.
   - (a) **Recommended:** a small menu with a search box, your 8 most recently opened projects (name and client), then "Back to projects" and "Project settings". Eight fit without scrolling.
   - (b) The same with 5 recent projects.
   - (c) You draw a board first.
   - Holds up: EZD-128, and EZD-130, which opens from this menu.
2. **Q-0699 · Project settings.** The window for changing one project's details and its own copy of the company defaults. No board shows it.
   - (a) **Recommended:** a dialog that looks like the New project dialog: name, client, address, type and scope of work at the top, then a section "Defaults for this project" (waste factors, overhangs, cabinet and countertop increments), with Save and Cancel. It reuses a look you already approved.
   - (b) A full page like the Settings pages.
   - (c) You draw a board first.
   - Holds up: EZD-130.

## 2. Agent answers to confirm

Confirm or override each. Nothing waits on these.

- **Defaults page follows your board** (S15d), plus rows decided since: a Walls group (thickness, stud, drywall, height, exterior block) and the snap step. The Keyboard shortcuts card stays off until the shortcuts ticket in phase 11.
- **Who can change Defaults:** only people with the Defaults page switch (the Owner by default). Everyone can read them.
- **Locked vs no permission.** Someone with no Edit permission sees no drawing tools. Someone who can edit but doesn't hold the lock sees the tools greyed with "Editing tools paused while view only".
- **The green "Available to edit" message** goes to everyone in the project. People who can edit get a Start editing button and the message stays; others see it for 5 seconds.
- **Lock pieces built from the spec text without a board:** the holder's pop-up with a countdown and Release / Keep editing, the "Requested" state with Cancel, the Stop editing button and the faces of who is in the project.
- **Same person, second tab or device:** still the holder; nothing is taken away from the first tab.
- **Auto release** happens when a request goes unanswered for the minutes set in Defaults (1 to 1,440; 5 by default). Changing Defaults doesn't change a request already waiting. No one, not even an Owner, can force the lock off someone; they request like anyone.
- **Leaving the project** (Stop editing, back to projects, switching projects, signing out) saves, takes a checkpoint and gives up the lock. If you just close the tab with changes still waiting to send, the lock stays until they send next time, so nothing is lost.
- **Project settings permissions.** Anyone who can edit the project can change its name, address and scope of work. Changing the project type or its own defaults also needs the lock, because they change what the drawings show. Changing the client needs the customer-list permission, as on the New project dialog. People who can't see customer contact details see only the client's name.
- **Each project keeps its own copy** of waste factors, overhangs, and cabinet and countertop increments, made when the project is created. Changing the company default later doesn't change existing projects. Pattern adjustment is not copied; it always follows the company value.
- **Every lock event** (take, request, cancel, keep, release, auto release) is written to the event log.

Worked examples: `vault/spec/sections/09o-edit-lock-and-defaults-examples.md`. Glossary: `vault/spec/sections/00i-glossary-phase-08.md`.

## 3. Added after your sign-off (round 2, Q-0706)

- **Day values in Defaults** are whole numbers from 1 to 365. Version cleanup age and grace may also be 0.
- **The share-link reminder** must come before the link expires. For example, a 7-day reminder works on a 30-day link; a 30-day reminder on a 30-day link is refused.
