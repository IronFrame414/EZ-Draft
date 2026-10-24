# Data model: intro, working copy and saves
<!-- Moved word for word from vault/spec/sections/03-data-model.md lines 1-11 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

## Data model

Each project version stores the drawing as one JSON model document; every other record (sheets, renders, takeoff, selections) points at a model version. Every table carries `tenant_id` with row-level security from day one. Model objects have stable ids across versions so revisions can diff and cloud them.

**Working copy and saves** (Claude, Oct 11 performance audit)

- The drawing being edited is the working copy. It is stored as one row per model object (model\_object), so an autosave writes only the objects that changed, a few seconds after the last edit and again on Stop editing.
- A model\_version row, holding the whole model as one document, is written only at a checkpoint: Stop editing or closing the project, lock release, a send or issue, Name snapshot, Revert and Finish import.
- These checkpoints are the unnumbered working versions in the Versions list, so the list holds about one entry per editing session, not one per save. The 30-day cleanup, snapshots and sent versions work as decided in Round 24.
- The browser keeps the open working copy in IndexedDB. Offline edits queue as per-object changes (offline\_change) and sync the same way as an autosave.

