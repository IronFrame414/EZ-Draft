# EZD-029 spike: DXF parser and writer

Throwaway spike for vault/plans/EZD-029.md. Never imported by the app, packages or worker (C4). The
orchestrator writes the go / no-go note `vault/spikes/EZD-029.md` from these findings.

## Run

From the repo root, one command at a time (Q-0019):

- `pnpm --filter ./spikes/EZD-029-dxf run spike-test`: tests T1-T10 (`node:test`, concurrency 1).
- `pnpm --filter ./spikes/EZD-029-dxf run spike-report`: the report for the synthetic fixture
  `fixtures/synthetic/room-12x10.dxf` (the Done-when script).
- `pnpm --filter ./spikes/EZD-029-dxf run spike-standin`: generates the 150,000-entity stand-in to
  `out/standin/` (git-ignored) and reports it.
- `pnpm --filter ./spikes/EZD-029-dxf run spike-writer`: writes `out/room-written.dxf` and the
  `writer` block of `out/results.json`.
- `pnpm --filter ./spikes/EZD-029-dxf run spike-real -- --file <path> --label architect-<n>`: a real
  architect DXF (Step 7). `--file` and `--label` may repeat, paired in order; output goes to the
  git-ignored `out/real/` (Q-0065).

Each parse runs in a child Node process with `--max-old-space-size=2048` and is killed after 300 s
(Q-0027 (a), the EZD-028 Step 5 emulation). Results merge under `runs.<label>` in `out/results.json`.

## Versions

- Parser: `dxf-parser` 1.1.2, plus the spike's own HATCH handler.
- Writer: `@tarikjabiri/dxf` 2.9.0.
- Node v22.23.3, darwin (results record the version; Vercel and CI run Node 22).

## Candidates tried

- `dxf-parser` 1.1.2 (Named tools pick): reads every required type except HATCH, which 1.1.2 has no
  handler for; HATCH is read through its own extension point (below). Kept.
- `@tarikjabiri/dxf` 2.9.0 (Named tools pick): meets T8 on the first try. Kept. No other writer was
  tried.

## Results (`out/results.json`)

- Synthetic fixture: 22 entities in the file, 22 read, nothing not read; 1.4 ms; peak 49.8 MB;
  `$ACADVER` AC1009, decoding latin1; no group 5 handles in the file.
- Stand-in, 1,500 units: 150,000 entities plus 43 block entities, all read, nothing not read;
  16.4 MB; generated in 92 ms (apart from the parse); 436 ms in total (parse 281 ms); peak 401 MB;
  `fitsOneSlice` true; handles kept.
- Writer: `$ACADVER` AC1021, `$INSUNITS` 1, fill HATCH (SOLID), text TEXT; the 26 entities on 5
  named layers read back in full. Recorded only: handles on every entity; BLOCK and INSERT,
  DIMENSION, pattern hatches and paper space in the API; colour (group 62) written; no line weight
  (group 370) written.
- Node built-ins: neither package imports any.

## Own entity handler

`src/hatch-handler.mjs` (`HatchHandler`, registered by `createParser()` in `src/parser.mjs`):
dxf-parser 1.1.2 skips HATCH silently. The handler reads the pattern name, solid flag, polyline and
edge boundary loops (line-edge start points only) and seed points. EZD-901a must carry it.

## Notes

- dxf-parser's Node entry is a UMD bundle that sets `module.exports` to the class. Node lists a named
  export `DxfParser`, but it is `undefined` at run time, so `src/parser.mjs` uses the default import.
- Decoding: the file is read as latin1 to find `$ACADVER`; AC1021 and later are decoded as UTF-8.
- The stand-in (`src/standin.mjs`) is hand-built from the DXF Reference group codes and checked only
  by the raw scanner and the parser, not by AutoCAD. Tables, blocks and objects take handles from 1,
  entities and block entities from 100 (hex), so the two never meet. Every DIMENSION points at one
  block `*D1`, a stand-in shortcut.
- Real architect DXFs: not yet supplied; the generated stand-in is used (tickets README rule 8).
