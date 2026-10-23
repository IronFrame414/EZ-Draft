# EZD-027 spike: plan canvas on the tablet

Throwaway measuring page (vault/plans/EZD-027.md). One persistent Three.js orthographic canvas
drawing 150,000 line segments (10 layers, one draw call each), 3,000 instanced symbols (10 types)
and 24,000 glyphs of atlas text (one draw call), with a scripted 3-second pan and zoom. It records
frame times and memory to the screen and to a results file. Never imported by the app.

All scene values other than the ticket's 150,000 segments and 3,000 symbols are spike inputs, not
product values (seed 27, 960 x 720 in extent, segment lengths 6-96 in, symbol radius 4 in, glyph
height 4 in).

## Run

From the repo root:

- `pnpm --filter ./spikes/EZD-027-canvas run spike-serve`: serves http://127.0.0.1:4027/ on this PC only.
- `pnpm --filter ./spikes/EZD-027-canvas run spike-serve-lan`: listens on all interfaces and prints one
  `http://<PC address>:4027/?device=surface` link per private IPv4 address (field run).
- `pnpm --filter ./spikes/EZD-027-canvas run spike-unit`: unit tests (U1-U8, D1).
- `pnpm --filter ./spikes/EZD-027-canvas run spike-test`: browser tests (B1-B4), Chromium `desktop`
  and WebKit `ipad-landscape`, one worker. Never run while a gate is running (Q-0019).

Results files are written to `out/` (`out/test/` for the browser tests) as
`results-<device>-<UTC stamp>.json`. `out/` is git-ignored.

## URL parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `device` | none (`unknown` in file names) | Label written into the results and the file name |
| `runs` | 3 | Measured passes, 1-5 (after one warm-up pass that is not counted) |
| `autorun` | off | `1` starts the run on load (tests) |
| `labels` | 3000 | Number of labels (8 glyphs each); stress run only |
| `dpr` | `devicePixelRatio` | Pixel ratio for a recorded comparison run |

## Field check (Josh, on the Surface; Q-0088)

1. The orchestrator runs `spike-serve-lan` on the build PC and gives Josh the printed
   `http://<PC address>:4027/?device=surface` link. If the PC asks whether Node may use private
   networks, allow it.
2. Surface on the same office network, plugged in, battery saver off; Edge, window maximized then
   full screen (F11); no other tabs or apps playing video.
3. Open the link, press **Run**, wait about 15 seconds without touching the screen, rotating the
   Surface or detaching the keyboard. The numbers appear and the panel shows `Saved: <file>`. If it
   shows `Not saved`, press **Download results** and copy the file to the build PC.
4. Recorded only: the same link with `&labels=15000` and with `&dpr=1`.
5. On the build PC: `http://127.0.0.1:4027/?device=desktop` in Edge or Chrome, press Run (recorded only, Q-0063 (a)).
6. Tell the orchestrator if the page reloaded, went blank or showed an error at any point (Q-0062 (a)).

## Findings (builder, automated runs, 2026-10-23)

- `three` 0.186.1 (the pinned row) installed and ran unchanged; no version bump. The server serves
  its `build/` folder (`three.module.js` imports `three.core.js`).
- The build machine for these runs was macOS (darwin), not the Windows PC with Intel UHD Graphics
  that Q-0018 describes; the renderer strings below say what drew the frames.
- Unit tests: 9 of 9 pass (U1-U8, D1). Browser tests: 5 pass, 3 skipped by design (B2-B4 are
  desktop only).
- Countable checks held in both projects: 21 draw calls, 150,000 lines and 64,500 triangles on every
  frame; 21 geometries, 1 texture; 1 WebGL context and 1 canvas, also after a second Run; 0 buffers
  rebuilt during the script; 0 renders in the 2,000 ms idle window. Atlas 512 x 512 (1,048,576
  bytes); scene GPU buffers 4,178,040 bytes (line positions 3,600,000).
- `desktop` (headless Chromium, 1600 x 1000, ratio 1): renderer `ANGLE (Google, Vulkan 1.3.0
  (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`, i.e. software WebGL.
  1 measured pass: 14 frames, frame interval mean 237.2 ms, p95 300 ms, max 300 ms; render CPU p95
  0.2 ms; buildMs 15.5; firstFrameMs 47.6; 14 long tasks; JS heap 12,700,000 bytes. Software
  rendering numbers, not a desktop or tablet result.
- `ipad-landscape` (Playwright WebKit, 1180 x 820, ratio 2, drawing buffer 920 x 1332): renderer
  `Apple GPU`. 1 measured pass: 181 frames, mean 16.7 ms, p95 18 ms, max 19 ms, none over 33.3 ms
  or 100 ms; render CPU p95 1 ms; buildMs 30; firstFrameMs 233; long tasks and JS heap not
  available (`null`). This is WebKit on a Mac GPU, not Safari on an iPad.
- Frame times are recorded only and never compared with a budget in a test (11 Performance;
  R26 R10). The verdict comes from the Surface run.
- Nothing failed or was left out.
