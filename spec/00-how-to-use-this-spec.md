# How to use this spec

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 0: How to use this spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

This is the build spec for EZ Draft v1, served at ezdraft.ezcontractorbinder.com. It covers every screen, control, workflow, hook, file format and rule decided through Round 25 of the interview. Round 24, Round 25 and Round 26 decisions (last section) override anything earlier. Anything not decided is listed under Still open instead of being guessed.

**Sources, in order of authority**

1. Your answers in the interview rounds (Rounds 1–23 of the Blueprint Creator plan doc).
2. The Studio-style mockups on the EZ Draft design canvas (screens 01–18b). They define layout and controls.
3. The rest of the plan doc (feature specs, data model, architecture, costs). Where it conflicts with a later round, the later round wins.

When a mockup and a decision disagree, this spec follows the decision and notes the conflict in that screen's Decisions.

**For build agents:** read the ticket row, the sections its Spec ref names, Data model, App shell and Non-functional requirements (Performance). Also read the Architecture rules in Data model and the conventions file from EZD-000. Do not load the whole spec for one ticket. If the spec does not decide something, write the question to the handoff file and move to the next ticket; do not guess.

**Conventions**

- Units: imperial only. Lengths in feet-inches with fractions to 1/16". Display precision is 1/2" on plans and 1/16" on details.
- Accepted typed formats in every length field: `12'6"`, `12' 6 1/2"`, `150"`, `12.5'`.
- Permissions use the names from the per-user checklist (section 9), for example *Edit model* or *Issue permit sets*.
- Events use dot names, for example `plan_set.issued`. An event marked *(new)* was added in this spec; all are accepted, and the canonical names are the ones in section 6 (Claude).
- "(not in mockup)" marks a control or screen the decisions require but no mockup shows yet.
- Placeholders in brackets, like \[Supplier\] or $\[ \], are sample data, not decisions. Section numbers used in cross-references: 1 Product overview, 2 Data model, 3 App shell, 4 Screen-by-screen spec, 5 Workflows, 6 Hooks, 7 Import and export, 8 Calculations, 9 Permissions and settings, 10 Non-functional, 11 Build phases, 12 Decisions and remaining items.

**Glossary**

| Term | Meaning |
| --- | --- |
| Model | The single parametric drawing of a project. Every sheet, render, takeoff and field pack reads it. |
| Model version | An immutable saved state of the model. Checkpoints of the working copy (Stop editing, closing the project, Finish import, Revert; autosaves in between do not make one) are unnumbered working versions (cleaned up after 30 days unless kept); a version sent to another party is numbered (Version N before permit, Rev N after) and permanent. |
| Snapshot | A version you name. Named snapshots are never offered for deletion. |
| Status | Existing, Demo or New on each object. Drives the Existing, Demo and Proposed sheets. |
| Phase switch | The Existing / Proposed toggle in the status bar. Sets the default status for new objects. |
| Revision (Rev) | A formal, numbered issue. Rev 0 is the first issued permit set; Rev 1, 2… are assigned when a changed set is next sent to the client or department. |
| Reference drawing | An uploaded DXF or PDF kept at full fidelity under the model. |
| Markup layer | Clouds, comments, arrows, dims and text drawn over a reference without changing it. |
| Camera view | A named saved 3D angle, reused for renders and the client gallery. |
| Client-ready | A render that was approved and then marked client-ready (two steps). Only client-ready renders reach the share link. |
| Selection | A client choice (option A/B/C, countertop edge, finishes) recorded with approval data. |
| Submittal profile | A saved preset per building department: file split, naming, sheet size, flatten, stamp box, resubmittal mode, minimum scale, required notes, who signs. |
| Edit lock | The rule that one person edits a project at a time. |
| Field pack | The phone view of a project for crews. |
| EZ Binder | EZ Contractor Binder, the job management app EZ Draft links to. |
