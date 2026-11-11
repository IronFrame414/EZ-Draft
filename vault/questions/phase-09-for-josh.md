# Phase 9 · for Josh (spec-check 9, 2026-11-11)

Phase 9: sending versions, the Versions panel, version cleanup and the project card menu. The spec check found 27 gaps. Agents settled 24 under your standing rule (CLAUDE.md rule 3): the code-reviewer checked the data and timing answers, and the security-reviewer checked permissions, the client link and project Delete. They are recorded as Q-0700 in the decisions files. Three design questions wait for you. Phase 9 is ready for your sign-off; each question holds only the tickets it names.

## 1. Design questions (answer by number)

1. **Q-0701 · Send dialog.** No board shows it.
   - (a) **Recommended:** build it from this text. A "To" line shows the project's client name and email; you can't type another address. Below it are an optional one-line note, Send and Cancel. After sending, a Copy link button appears beside Send. If the project has no client email, the dialog says so and links to Project settings. The same dialog is used later for permit, change-order and supplier sends.
   - (b) You draw a board first.
   - Holds up: EZD-111, and so the rest of phase 9 (EZD-121 to EZD-124, EZD-137, EZD-139).
2. **Q-0702 · Project card menu, Completed and Archived.** The Projects board has no card menu, no Completed tab and no Archived filter.
   - (a) **Recommended:** a three-dot menu on each card with Rename, Set status, Mark complete (Reopen on a completed project), Archive (Restore on an archived one) and Delete (type the project name). Two more tabs after In build, "Completed" and "Archived", each with its count. "All" shows active projects only. The Completed pill is grey like Draft. Customers already uses an Archived filter the same way.
   - (b) You draw a board first.
   - (c) As (a), but Archived is a switch in the sort menu instead of a tab.
   - Holds up: EZD-124, EZD-137.
3. **Q-0703 · What changed since an old version.** When you open an old version, how should the changes against today's drawing show?
   - (a) **Recommended:** changed things get an amber outline and things deleted since get a red dashed outline. Things added since aren't drawn, because they didn't exist then. The bottom bar shows "N changed · N removed · N added since", with a Show changes switch that is on by default.
   - (b) Amber outline on changed things only, with no count.
   - (c) You draw a board first.
   - Holds up: EZD-139.

## 2. Agent answers to confirm

Confirm or override each. Nothing waits on these.

- **Delete removes everything, as you decided (Q-0201):** the project, every version, every file including sent files, and the client link, which stops working at once. The files are removed by a background job that retries until done. Copies in the off-site backup age out after 90 days (database copies after 13 weeks).
- **A send never changes the project's status;** you move status by hand (Q-0199).
- **Sends go only to the project's client email** in phase 9. Other kinds of sends come with their own phases.
- **The client link lasts 30 days** (the Defaults value). Its secret is never stored, only a scrambled copy, so Copy link works only right after sending. A link needed later makes a new one (phase 39).
- **Sending works for anyone with Send to client,** even if someone else holds the lock. It sends the last saved work and tells you who is editing.
- **Who can do what:**
  - Anyone who can see the project can open the Versions panel.
  - With Edit permission you can name a snapshot, rename, set status, mark complete and reopen; no lock needed.
  - Revert and the cleanup sheet's Save need the lock.
  - Archive, Restore and Delete need Delete projects.
- **Archived and completed projects open and edit normally.**
- **Revert** saves today's work as a version first, so nothing is lost.
- **Version cleanup:** unsent, unnamed versions older than 30 days are listed. If nobody acts, they are deleted 7 days after the list first appears, whether or not anyone opened it. Everyone with Edit permission on the project is notified. Sent and named versions are never deleted.
- **Card label after a send** is "Version N". The board's "Version 2 sent" was sample text.
- **Snapshot names** can't be empty; repeats are allowed.

Worked examples: `vault/spec/sections/09p-versions-and-cleanup-examples.md`. Glossary: `vault/spec/sections/00j-glossary-phase-09.md`.
