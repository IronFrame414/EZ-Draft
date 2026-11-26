# Assumptions: EZD-224b

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-224b | Where the capture code lives (plan: render-root.ts and controller.ts import the frame capture and thumbnail rules directly) | They load with import() on the first capture (frame-capture.ts gains readThumbnail and createThumbnailCapture; captureThumbnail awaits lib/thumbnail), because the direct imports put the editor route 426 bytes over its 500,000 byte budget. Behaviour, the one extra frame and the read in scene.onAfterRender are unchanged | 11 Budgets; ARCH "Entry points and lazy modules (EZD-020)"; e2e editor.spec.ts B11, plan-canvas.spec.ts B8 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
