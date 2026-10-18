# Glossary

Josh's words for things, and the names the code uses. The first table is the spec's own glossary (spec section "How to use this spec"). The second maps each term to its code name; EZD-000 fills the code-name column from docs/architecture.md and later tickets add rows in the same commit that introduces a name. A term used in a plan or a test must appear here.

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


| Josh's term | Code name (table, type, route) | Set by |
| --- | --- | --- |
| Model | `model_object`, `model_version` | EZD-000 / EZD-120 |
| Working version / checkpoint | `model_version.kind = working` | EZD-120 |
| Sent version (Version N, Rev N) | `model_version.kind = sent`, `rev_number` | EZD-7xx |
| Edit lock | `project.lock_holder`, `lock_epoch` | EZD-1xx |
| See company costs / See sell prices | permissions `see_company_costs`, `see_sell_prices` | EZD-1xx |
| Field pack | phone routes under `/field` | EZD-14xx |
| Client link | routes under `/c/<token>` | EZD-12xx |

Rows above the line are the terms the spec defines; the code-name column is a starting proposal and is overwritten by whatever EZD-000 and the owning ticket record. Do not cite this table as a source for a name until that ticket is `done`.
