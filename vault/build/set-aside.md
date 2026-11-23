# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-1939 · Loop: failure lines in loop.log name the failing tests
- When: 2026-11-23T20:13:58Z
- Reason: check red after merging newer develop (first try: check red after merging newer develop)
- Branch: t/EZD-1939 · worktree: .claude/worktrees/EZD-1939
- Last output:
```
.
EZD-1001a first open of 3D on the benchmark project: 554 ms
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
    ──────────────────
```

## EZD-1934 · Move dev-only glob and minimatch to patched versions
- When: 2026-11-23T22:18:43Z
- Reason: check red after merging newer develop (first try: check red after merging newer develop)
- Branch: t/EZD-1934 · worktree: .claude/worktrees/EZD-1934
- Last output:
```
 and before phase-6 (AC-EZD-360-3)
    ok 2 - EZD-360 T6 compareReleaseTags orders phase-56 after phase-5.3 and before phase-6 (AC-EZD-360-3)
      ---
      duration_ms: 0.094375
      type: 'test'
      ...
    # Subtest: EZD-360 T7 a Phase 6 pull request after phase-56 gets phase-6 (AC-EZD-360-3)
    ok 3 - EZD-360 T7 a Phase 6 pull request after phase-56 gets phase-6 (AC-EZD-360-3)
      ---
      duration_ms: 0.300125
      type: 'test'
      ...
    # Subtest: EZD-360 T8 a Phase 56 pull request after phase-5 gets phase-56 (AC-EZD-360-3)
    ok 4 - EZD-360 T8 a Phase 56 pull request after phase-5 gets phase-56 (AC-EZD-360-3)
      ---
      duration_ms: 0.061542
      type: 'test'
      ...
    # Subtest: EZD-360 T9 a Phase 56 pull request after phase-6 is not_newer (AC-EZD-360-3)
    ok 5 - EZD-360 T9 a Phase 56 pull request after phase-6 is not_newer (AC-EZD-360-3)
      ---
      duration_ms: 0.047375
      type: 'test'
      ...
    1..5
ok 379 - EZD-023a release tags
  ---
  duration_ms: 1.753291
  type: 'suite'
  ...
# Subtest: EZD-023c Vercel client requests
    # Subtest: EZD-023c T23 (a)-(g) requests and results
    ok 1 - EZD-023c T23 (a)-(g) requests and results
      ---
      duration_ms: 3.476791
      type: 'test'
      ...
    # Subtest: EZD-023c T23 (h) errors name neither ids nor token nor body
    ok 2 - EZD-023c T23 (h) errors name neither ids nor token nor body
      ---
      duration_ms: 0.742625
      type: 'test'
      ...
    # Subtest: EZD-023c T23 (i) evaluateVercelProject and PROTECTED_DEPLOYMENT_TYPES
    ok 3 - EZD-023c T23 (i) evaluateVercelProject and PROTECTED_DEPLOYMENT_TYPES
      ---
      duration_ms: 0.162125
      type: 'test'
      ...
    1..3
ok 380 - EZD-023c Vercel client requests
  ---
  duration_ms: 4.826292
  type: 'suite'
  ...
# Subtest: EZD-023e release workflow
    # Subtest: EZD-023e done when: the release runs only from release.yml on a push to main in the release environment
    ok 1 - EZD-023e done when: the release runs only from release.yml on a push to main in the release environment
      ---
      duration_ms: 3.88075
      type: 'test'
      ...
    # Subtest: EZD-023e T17 nothing local, nothing in the gate, build scripts denied
    ok 2 - EZD-023e T17 nothing local, nothing in the gate, build scripts denied
      ---
      duration_ms: 2.115167
      type: 'test'
      ...
    1..2
ok 381 - EZD-023e release workflow
  ---
  duration_ms: 6.381625
  type: 'suite'
  ...
# Subtest: EZD-176 wor
```
