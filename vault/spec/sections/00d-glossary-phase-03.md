# Glossary addendum · Phase 3

Added by spec-check 3 (Q-0493, Q-0494). Definitions only, each from the source named; no new rules. Read with `vault/spec/glossary.md`, `00b-glossary-phase-01.md` and `00c-glossary-phase-02.md`.

| Term | Meaning | Code name | Source |
| --- | --- | --- | --- |
| Model object | One wall, opening, room or other drawn item of a project, with its id, type, geometry, status (existing, demo, new), floor and attributes. | `model_object` row; object types in the geometry package schema | 03f Objects inside model_json; 03b rule 5 |
| Working copy | The project's current model in the editor: the saved model objects, one row each, changed by autosave. Also the version label on a project card when nothing has been sent (00c). | `model_object` | 03a Working copy and saves; 03b rule 6 |
| Checkpoint | A saved, unchangeable copy of the working copy, built on the server from the saved rows at Stop editing, lock release, Finish import, Revert, Name snapshot, send and issue. Closing the project is not relied on (03b rule 7, which corrects glossary.md "Model version"). | `model_version` | 03b rule 7; EZD-120a |
| Outbox | The one queue on the device that every edit goes into before it is sent; autosave sends it 2 seconds after the last edit, one save at a time. Offline it simply waits longer. | IndexedDB outbox | 03b rule 9; EZD-120b |
| Patch store | The editor's in-memory copy of the model; every edit is a small change applied at once, and the same changes drive undo. | Zustand store | EZD-120b |
| Save state | The words in the editor header that say whether edits are saved: Saving…, Saved just now, Saved N min ago. | none | S03 States |
| Save sequence | A number the server gives an object each time it is saved, used to spot two people changing the same object. | `model_object.updated_seq` | 03b rules 6 and 9 |
| Lock generation | A number that goes up each time the edit lock changes hands; a save with an old number is refused. It stays 0 until the edit lock ships (EZD-125, phase 8). | `edit_lock.lock_epoch` | 03b rule 6; 03e |
| Schema version | The version number of the model's data layout, carried on every stored copy and every queued change. | `schema_version` | 03b rule 5 |
| Migrate | Upgrading an older stored model to the current layout when it is read, without rewriting what is stored. | migrate functions in the geometry package | 03b rule 5 |
| Floor | One storey of a project; every model object belongs to one floor, and a project can have several. Not a room's "floor level" (its floor height) or its floor finish (03f existing conditions). | `level` on each object; the project's floor list | 03f; Q-0490; Q-0494 |
| Conflict | A queued change the server refuses for good, for example because someone else saved the same object first. | none yet (EZD-294 plan names it) | 03b rule 9; Q-0488 |
| Conflict list | The list of conflicts on this device; each is resolved with Keep mine (send my change over the server's) or Keep theirs (drop my change). | none yet (EZD-294 plan names it) | 03b rule 9; Q-0488 |
| Drawing list | The list of lines, arcs, fills, hatches and text (with sizes measured from the bundled font files) that one view of the model turns into; the plan canvas, sheets and PDF all draw from it. | geometry package function (EZD-238) | 02 Product overview · PDF out; R26 R7 |
| Line-weight role | What a line in the drawing list stands for (cut, beyond, hidden, dimension), which sets how heavy it prints. | none yet (EZD-238 plan names it) | 09h Sheet set rules |
| Money field | A cost, sell price, markup, option cost line, change-order amount or render dollar amount; shown only to users with See company costs or See sell prices. | separate money tables and columns | 03b rule 2; R26 R1, R2 |
| Comparison tolerance | The fixed 1/64 inch within which two stored coordinates count as the same point; not a company setting. | none yet (EZD-202 plan names it) | 03b rule 5; 03g |
