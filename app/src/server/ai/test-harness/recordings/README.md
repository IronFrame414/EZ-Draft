# AI recordings (EZD-021)

Stub mode runs the real provider adapter with a fetch that answers from a recording
(`../recorded-fetch.ts`). A recording is `{ provider, purpose, source, exchanges }`; exchanges are served in
order and a request that does not match the next one throws `StubMismatchError` (`ai_stub_mismatch`).

- `source: 'synthetic'`: written from the provider's API reference, because no key exists yet (Q-0003). The
  first live calls (EZD-031 for images, EZD-606 for Claude) may replace them. Values are test data, not
  product wording.
- `source: 'live <date>'`: saved from a live call. Remove keys and personal data before committing.
- Lookup order (`../stub.ts`): `setStubRecording` override, then `<AI_STUB_DIR>/<provider>/<purpose>.json`,
  then the built-in map in `index.ts`. None found: `ai_stub_no_recording`.
- A later ticket adds `"<provider>/<purpose>"` entries to `index.ts` (one module per provider) and calls
  `expectSafeToRunTwice` for its purpose.
- `image.ts`: `STUB_PNG_B64` / `STUB_PNG`, a 2 x 2 px PNG.
