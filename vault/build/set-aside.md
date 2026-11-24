# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-1939 · Loop: failure lines in loop.log name the failing tests
- When: 2026-11-24T03:27:53Z
- Reason: check red after merging newer develop (first try: check red after merging newer develop)
- Branch: t/EZD-1939 · worktree: .claude/worktrees/EZD-1939
- Last output:
```

EZD-1001a first open of 3D on the benchmark project: 391 ms
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] Error: aborted
[WebServer]     at ignore-listed frames {
[WebServer]   code: 'ECONNRESET'
[WebServer] }
  1) [desktop] › e2e/property-appraiser-import.spec.ts:43:7 › EZD-711 Property appraiser import › EZD-711 AC-1 the wizard reads the link and the ticked owner and PCN fill the title block 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 8
    + Received  + 1
    - Array [
    -   Object {
    -     "legal_description": null,
    -     "owner": "HENDRICKS FAMILY TRUST",
    -     "parcel_no": "00-43-44-21-01-000-0010",
    -     "year_built": 1975,
    -   },
    - ]
    + Result []
      84 |       from public.project p join public.property_record r on r.id = p.property_record_id
      85 |       where p.tenant_id = ${tenant}::uuid`;
    > 86 |     expect(rows).toEqual([
         |                  ^
      87 |       { owner: 'HENDRICKS FAMILY TRUST', parcel_no: '00-43-44-21-01-000-0010', legal_description: null, year_built: 1975 },
      88 |     ]);
      89 |
        at /Users/josh/Projects/ezdraft/.claude/worktrees/EZD-1939/app/e2e/property-appraiser-import.spec.ts:86:18
    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/property-appraiser-import--0b7c1-nd-PCN-fill-the-title-block-desktop/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    Error Context: test-results/property-appraiser-import--0b7c1-nd-PCN-fill-the-title-block-desktop/error-context.md
    Error Context: test-results/property-appraiser-import--0b7c1-nd-PCN-fill-the-title-block-desktop/error-context.md
    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/property-appraiser-import--0b7c1-nd-PCN-fill-the-title-block-desktop/trace.zip
    Usage:
        pnpm exec playwright show-trace test-results/property-appraiser-import--0b7c1-nd-PCN-fill-the-title-block-desktop/trace.zip
    ───────────────────
```
