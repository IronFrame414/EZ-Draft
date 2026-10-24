# EZD-031 spike: render trial

Draft findings for the go / no-go note `vault/spikes/EZD-031.md`, which the orchestrator writes (vault/plans/EZD-031.md Step 7). Throwaway code: never imported by the app, packages or worker. It imports EZD-021's three image adapters, its recorded-fetch stub and its network guard from `app/src/server/ai/` and changes none of them.

## Run

From the repo root:

- Tests (T1-T13, T15-T17): `pnpm --filter ./spikes/EZD-031-render run spike-test`
- Stub run (no network, no keys): `pnpm --filter ./spikes/EZD-031-render run spike-stub`. It writes `out/stub-run/`: one input and 3 images (2 x 2 px stand-ins), an `*.exchanges.json` per render, `costs.json`, `costs.csv` and the contact sheet `index.html`. The committed copy is refreshed only in the orchestrator's proof step 3.

## Live run (Josh, after Phase 10), step by step in PowerShell

The keys are for the three accounts you pick (Q-0003, Q-0076). Never paste a key in a chat or into any file other than `.env.local` (CLAUDE.md rule 12).

1. In `spikes\EZD-031-render`, copy `.env.example` to `.env.local` and paste the three keys after the `=` signs. If your Gemini or Flux account uses another address, also add `GEMINI_BASE_URL=` or `BFL_BASE_URL=` (https only).
2. Export the 5 rooms' views from EZ Draft's 3D view (Q-0082), each at most 2048 px on the long side, as PNG, JPEG or WebP (not HEIC). Put them in a folder outside the repo with a `rooms.json`:
   `{ "rooms": [ { "id": "room-1", "label": "Smith kitchen", "image": "room-1.png", "finishes": "one or two sentences on the finishes" } ] }`. `id` is lower-case letters, digits and `-`. `image` is relative to `rooms.json`. The script adds the fixed opening sentence (Q-0083 (a)) in front of your finishes sentences.
3. Copy `models.json` next to it and edit the models and settings you want to try (Q-0084). Each entry is `{ "provider": "gemini" | "openai" | "bfl", "model": "<id>", "label": "<optional, unique per provider>", "settings": { ... } }`. `settings` adds request fields: Gemini top-level keys (and keys inside `generationConfig`), OpenAI form fields (text values only), Flux top-level keys. They can add to what the adapters send, never replace it (`contents`, `generationConfig.responseModalities`, `model`, `prompt`, `image`, `input_image` are refused). Leave OpenAI's output format at its default (see Known limits). Copy `prices.json` too and fill the Kontext rate and the rates of any model you add (finding 5).
4. Run `pnpm --filter ./spikes/EZD-031-render run spike-live --rooms <path to rooms.json> --models <path to models.json> --prices <path to your prices.json> --max-usd <most you will spend>` and type `yes` at the confirmation. Optional: `--providers gemini,openai` to skip a provider (finish it later with `--resume <run folder>`), `--run-dir <folder>`. A `--run-dir` folder is emptied first, so it must be a new folder under `runs/` or one outside the repo; never point it at a folder with files you want to keep. `--resume <run folder>` keeps the folder and re-runs every pair without an `ok` record, whatever the run's status; a render that was in flight when a run died has no record, so resume sends it again, and the provider may already have billed the first one.
5. Open `spikes\EZD-031-render\runs\<runId>\index.html`.
6. The next day, read each provider's usage or billing page for the run date and tell the orchestrator the dollars billed per provider, with your pick.

The live run refuses to start when `CI` is set, when it is not in a real terminal, without `--max-usd`, with other than 5 rooms, or with a missing key. It never prints or writes a key. A failed render is recorded and the run goes on; nothing is retried by itself.

## Findings

1. Versions: `tsx` 4.23.15 (new devDependency, row added to `docs/architecture.md`), Node v22.23.3, `vitest` 5.0.5. `pnpm-lock.yaml`: every importer, including the new spike, resolves `vitest` to one string, so the network guard's `vitest.setup.ts` in `app/` and the spike's tests use one Vitest build. Adding `tsx` made `esbuild` (a vite peer) visible to vite, so the vite part of that string changed identically for all importers.
2. `esbuild`'s install script was reported by pnpm 12 and is denied in `pnpm-workspace.yaml` `allowBuilds` (`docs/architecture.md`, Adding a dependency). `tsx` runs the CLI and the tests spawn it, so it works without the script.
3. Stub run results: status `complete`; 3 renders, all `ok`, 2 x 2 px PNG; usage Gemini 300 / 1290 / 1 image, OpenAI 300 / 1056 / 1, Flux null / null / 1; cost 39,000 + 45,240 + 40,000 = 124,240 micro-dollars ($0.12424) at the test price file `test/fixtures/prices.test.json` (made-up rates). `costs.json`, `costs.csv`, `index.html` and 3 images are in `out/stub-run/`. Tests: 52 passed.
4. Model ids in `models.json`, read from the official pages on 2026-10-23 (plan Step 2; the builder copied them, having no web access): `gemini-3.1-flash-image` (https://ai.google.dev/gemini-api/docs/pricing; `gemini-2.5-flash-image` is deprecated there), `gpt-image-2` (https://developers.openai.com/api/docs/models/gpt-image-2, image edit via `v1/images/edits` supported; Josh's "GPT Image 2", Q-0016) and `flux-kontext-pro` (endpoint `https://api.bfl.ai/v1/flux-kontext-pro`, https://docs.bfl.ai/kontext/kontext_text_to_image). They are run-time defaults, not a decision: Josh replaces them with `--models` (Q-0084). The OpenAI image guide's `images.edit` examples (https://developers.openai.com/api/docs/guides/image-generation) use the ids `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare`; Josh may try them through `--models`, with a `--prices` copy that has their rates.
5. Prices in `prices.json`, read from the official pages on 2026-10-23 (`retrieved` is that page-read date): `gemini-3.1-flash-image` $0.50 per million input tokens, $60 per million image output tokens (https://ai.google.dev/gemini-api/docs/pricing); `gpt-image-2` $8 per million image input tokens, $30 per million image output tokens (https://developers.openai.com/api/docs/pricing; the page's separate $5 text-input rate is not used because EZD-021's usage has one input count); `flux-kontext-pro` `null`, because neither https://bfl.ai/pricing nor the Kontext page states a Kontext price. Its cost is `null` with reason `price_not_set` and the confirmation screen lists it under "no price" until Josh fills the rate. The billed check after the run is the measured cost (R24 #18).
6. First live call of EZD-021's adapters: not done (live run waits for Phase 10, Q-0082). EZD-021's recordings are synthetic, so field names, a JPEG instead of a PNG and output sizes may differ from real answers; the exchange files (long strings and all image data redacted, no request headers or bodies) are the evidence to compare.

## Known limits

- One input rate: EZD-021's usage has a single input token count, while some providers price image-input and text-input tokens differently. The estimate uses one input rate; `rawUsage` in each record keeps the provider's breakdown, and the billed check is the measured figure.
- `openaiEditImage` labels every output `image/png` (EZD-021 STATUS deviation). An OpenAI setting that asks for JPEG or WebP output would save those bytes under `.png`: leave OpenAI's output format at its default. Flux's media type comes from the sample's `content-type`.
- Gemini and Flux accounts: the addresses are settings (`GEMINI_BASE_URL`, `BFL_BASE_URL`, Q-0076); OpenAI's is fixed.
- A render has a 10 minute limit (above S08's slowest tier, "Photoreal ~6 min"). A run that dies partway leaves `costs.json` with status `running` and `finishedAt` null; `--resume` re-runs every pair without an `ok` record.
- The contact sheet shows each failed render's error code in place of an image. Real images and outputs of a live run stay in `runs/` (git-ignored); only numbers and Josh's verdict go in the vault note.
