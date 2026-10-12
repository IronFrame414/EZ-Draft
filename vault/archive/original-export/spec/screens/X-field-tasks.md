# Field tasks (not in mockup)

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Office drafts the crew task list from the model with AI, using the company trade-sequence template per room, edits it, and issues the field pack to the crew (Round 14). (not in mockup)

**Entry points:** Tasks tab in the Plan left panel (beside Layers, Rooms, Versions); "Issue field pack" in the header Share menu; the review pill when a published task was edited on a phone. (not in mockup)

**Permissions:** View: View projects. Draft, edit, reorder, delete, publish tasks and Issue field pack: Edit field tasks. No edit lock needed; tasks are not model edits (Round 24 #16). Controls the user lacks are hidden.

**Layout:** Left panel: rooms, each with its phases from the template (demo → rough-in → inspection → drywall → finish). Canvas: plan with the selected task's objects highlighted. Inspector: task text in English and Spanish (with translation status), linked objects, photos, Publish state. Footer: Issue field pack. (not in mockup; needs a mockup before build)

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Draft tasks with AI | Left panel header | Builds draft tasks per room and phase from the model's Demo and New objects and the room's template (15h). Shown as drafts for review. | Never published without review (AI never applies silently). Needs a connection. |
| Task row | Left panel | Selects the task; canvas highlights its linked objects. | Draft rows grey; published rows normal; done rows checked with user and time. |
| Add task / Delete / drag to reorder | Left panel | Manual edits within a phase. | Edit field tasks. |
| Task text (EN) | Inspector | Editable English text. Spanish is drafted and enters the translation queue (16). | Spanish users always see Spanish (Round 24 #40). |
| Linked objects | Inspector | Pick objects on the canvas to tie to the task. | Optional. |
| Publish selected / Publish all | Inspector footer | Marks drafts as published tasks. | Published tasks show in the field pack after the next issue. |
| Issue field pack | Footer (primary) | Freezes the current sheets, published tasks and finishes into a field\_pack\_issue tied to the current version; notifies the assigned crew "New field pack issued" (in-app and email with Copy link). | Needs at least one published task or a sent version. Offline: disabled with a "Needs connection" note. |

**Data shown:** field\_task (room, phase, text\_en, text\_es, status, photos, done\_by, linked objects), template per room type, last field\_pack\_issue (date, by, version).

**States:** empty ("Draft tasks with AI or add a task"); drafting (progress); drafts pending review; published; issued (date and version on the header badge); offline (read-only); permission-denied (hidden controls).

**Validation & warnings:** a task needs text; tasks tied to deleted objects are flagged for review; issuing with unpublished drafts asks to confirm.

**Events emitted:** field\_task.completed (from phones); field\_pack.issued (new).

**Decisions:**

1. Field tasks live in a Tasks tab in the Plan left panel and are issued with an "Issue field pack" action; the phone pack updates only on issue, so crews never see half-edited lists (Claude).
2. AI drafts per room and phase from the template in 15h and the model's Demo and New objects; the office reviews before publishing (Round 14).
3. Editing and issuing need Edit field tasks and no edit lock (Round 24 #16, Claude).
4. Issue notifies only users assigned to the project (membership scope) (Claude).
5. Needs a mockup before build (Claude).
