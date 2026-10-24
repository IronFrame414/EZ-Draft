# EZD-028 spike: PDF from a drawing list

Throwaway spike (vault/plans/EZD-028.md). A hard-coded 12' x 10' room becomes a drawing list, and
PDFKit writes it to one 24x36 page (2592 x 1728 pt) with a hatch, the two embedded fonts, one
bookmark and a check dimension, inside a local emulation of the production function limits
(300 s, 2048 MB; Q-0027 (a)). Nothing in `app/`, `packages/` or `worker/` imports this folder,
and the root gate does not run its tests.

## Files

- `src/drawing-list.mjs`: `buildRoomList()` (the room) and `buildStressList()` (150,000 segments).
- `src/metrics.mjs`: text widths from EZD-010's font files in `app/src/styles/fonts/` with fontkit.
- `src/write-pdf.mjs`: `writePdf(list)`, the PDFKit writer.
- `src/run-in-limits.mjs`, `src/child.mjs`: run the writer in a child Node process started with
  `--max-old-space-size=2048` and killed after 300 s.
- `test/`: T1 to T12.

## Run

From the repository root (never while a gate check is running):

- `pnpm --filter ./spikes/EZD-028-pdf run spike-test`: the tests.
- `pnpm --filter ./spikes/EZD-028-pdf run spike-pdf`: writes `out/EZD-028-room.pdf` and the
  `room` block of `out/results.json`.
- `pnpm --filter ./spikes/EZD-028-pdf run spike-stress`: writes `out/EZD-028-stress.pdf` and the
  `stress` block of `out/results.json`.

## Outputs

- `out/EZD-028-room.pdf` (committed): the field check file. The page reads 36 x 24 in; the check
  dimension measures 3.00 in at 1:1, or 12'-0" with the measure scale set to 1/4" = 1'-0".
- `out/results.json` (committed): the limits and, for each run, `ms`, `maxRssMb`, `bytes`,
  `execArgv`, `node`, `pdfkit` and `pdf`.
- `out/EZD-028-stress.pdf`: not committed.
