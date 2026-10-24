# Revisions / version history (not in mockup)

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Working versions, named snapshots, sent versions (Version N before permit, Rev N after), revert, the version cleanup sheet, revision log and change-order creation. (not in mockup)

**Entry points:** Versions tab in the Plan left panel (03); clicking the header version text ("Working copy · Saved just now"); Revision log on Sheets; cleanup notification (in-app and email with Copy link). (not in mockup)

**Permissions:** View: View projects. Revert, name snapshot, keep/delete in cleanup: Edit model, plus edit lock. Issue: Issue permit sets / Issue revisions. Send to client: Send to client. Create CO: Create change orders. Controls the user lacks are hidden. (not in mockup)

**Layout:** Left panel list in three groups (Sent, Named snapshots, Working versions); canvas shows the selected version read-only; inspector with version details and actions. Cleanup sheet is a modal over the editor. (not in mockup; needs a mockup before build)

**Version rules (Round 24 items 4, 16, 26):**

- Internal saves are unnumbered working versions, one per checkpoint (Stop editing, closing the project, Finish import, Revert), not one per autosave.
- Numbers apply only to what is sent to another party (client, department, EZ Binder). Pre-permit client sends are "Version N"; permit issues are "Rev N"; no cap.
- A send freezes that version permanently; editing continues on a working copy; the next send is a new version needing a new signature.
- Sent versions and named snapshots are never deleted.
- Unsent working versions auto-delete at 30 days, through the cleanup sheet below.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Version row (not in mockup) | Left panel | Opens the version read-only on the canvas. Shows label (Version N, Rev N, snapshot name, or date/time), author, preview. | Versions are immutable. |
| Name snapshot (not in mockup) | Version row menu / inspector | Names a working version; it becomes a named snapshot and is never offered for deletion. | Edit model. |
| Revert (not in mockup) | Inspector | Creates a new working version from the selected one. | Edit lock. Sent versions stay unchanged. |
| Issue / Send (not in mockup) | Inspector | Opens screen 13 Issue or the Share send. |  |
| Revision log (not in mockup) | Left panel, Sent group | Rev or Version, date, recipient, description, delta objects. |  |
| Create CO (not in mockup) | Sent revision row | Opens screen 14 for that revision. | Create change orders. |
| Cleanup sheet: version row (not in mockup) | Cleanup sheet | Shows a preview image, date and time, author and a one-line change summary for each unsent working version that reached 30 days. | Round 24 item 4. |
| Cleanup sheet: Keep checkbox (not in mockup) | Each row | Ticked rows are kept. | Default unticked. |
| Cleanup sheet: Name field (not in mockup) | Each ticked row | Name for the kept version; defaults to its date and time. | Kept versions become named snapshots. (Claude) |
| Cleanup sheet: Select all / none (not in mockup) | Sheet header | Ticks or clears every row. | (Claude) |
| Cleanup sheet: Save choices (not in mockup) | Sheet footer (primary) | Kept rows become named snapshots; unticked rows delete now. | Edit model. |
| Cleanup sheet: Later (not in mockup) | Sheet footer | Closes the sheet. | If ignored, unticked versions delete 7 days after the sheet first appeared; the footer shows the delete date. |

**Data shown:** (not in mockup) model\_version (label, is\_snapshot, sent\_to, sent\_at, number, created\_by, parent, preview image), permit\_revision (rev\_no, issued\_at, delta\_object\_ids, description), approvals that lock a version (selection approval, CO approval), edit lock holder, cleanup due date.

**States:** (not in mockup) pre-permit; issued (Rev 0 frozen); working copy after a send; locked by client approval; cleanup due (sheet shown, countdown); offline changes pending sync; view-only when another user holds the lock.

**Validation & warnings:** (not in mockup) undo is session-only, older changes via history (Round 11); a version number is assigned only on send; changed objects clouded with delta tag; approved selection set locks its version; a deleted working version cannot be restored.

**Events emitted:** revision.created; plan\_set.issued; version.sent (new); version.snapshot\_named (new); version.reverted (new); cleanup.due; cleanup.deleted.

**Decisions:**

1. Auto-delete applies only to unsent working versions at 30 days, through the cleanup sheet, with a 7-day grace if ignored; sent versions and named snapshots are kept forever (Round 24 item 4).
2. Entry is the Versions tab in the Plan left panel (one name everywhere) and a click on the header version text. Needs a mockup before build. (Claude)
3. Keeping or deleting in the cleanup sheet needs Edit model. (Claude)
4. Opening an old version shows it read-only on the canvas with its own sheets; no visual diff in v1 (auto-diff stays v2). (Claude)
