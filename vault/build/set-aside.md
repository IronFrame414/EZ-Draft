# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, run `node scripts/loop.mjs --retry <ticket>` (the loop picks it up again).

## EZD-2030 · The emailed sign-in code is 8 digits
- When: 2026-11-27T12:57:50Z
- Reason: check red after merging newer develop (first try: check red after a review fix)
- Branch: t/EZD-2030 · worktree: .claude/worktrees/EZD-2030
- Last output:
```
996-2 the same screens reached by moving around the app without a reload @desktop @ipad
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
  -  702 [ipad-landscape] › e2e/ezd-2026-field-measure-wide.spec.ts:214:9 › EZD-2026 Field measure screenshots before / after (AC-EZD-2026-2) › EZD-2026 field measure narrow-1023x768 looks as before @ipad
  -  703 [ipad-landscape] › e2e/ezd-2026-field-measure-wide.spec.ts:214:9 › EZD-2026 Field measure screenshots before / after (AC-EZD-2026-2) › EZD-2026 field measure portrait-820x1180 looks as before @ipad
[WebServer] Error: aborted
[WebServer]     at ignore-listed frames {
[WebServer]   code: 'ECONNRESET'
[WebServer] }
  -  726 [ipad-landscape] › e2e/style-split-screens.spec.ts:101:7 › EZD-1996 screens look the same with per-page CSS › AC-EZD-1996-2 sign-in @desktop @ipad
  -  727 [ipad-landscape] › e2e/style-split-screens.spec.ts:107:7 › EZD-1996 screens look the same with per-page CSS › AC-EZD-1996-2 Projects, editor Plan, Settings and field pack @desktop @ipad
  -  728 [ipad-landscape] › e2e/style-split-screens.spec.ts:149:7 › EZD-1996 screens look the same with per-page CSS › AC-EZD-1996-2 the same screens reached by moving around the app without a reload @desktop @ipad
  -  759 [phone] › e2e/ezd-2026-field-measure-wide.spec.ts:214:9 › EZD-2026 Field measure screenshots before / after (AC-EZD-2026-2) › EZD-2026 field measure phone-390x844 looks as before @phone
  1) [desktop] › e2e/screen-messages.spec.ts:45:7 › EZD-1995 per-screen messages › AC-EZD-1995-1 an editor open and the first pointer move fetch the lock UI messages only, never the whole catalog 
    Error: expect(received).toBeLessThan(expected)
    Expected: < 20000
    Received:   33511
      78 |     await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40);
      79 |     const sliceBody = await (await slice).text();
    > 80 |     expect(sliceBody.length).toBeLessThan(SLICE_MAX_BYTES);
         |                              ^
      81 |     expect(wholeCatalog(sliceBody)).toBe(false);
      82 |
      83 |     await page.waitForLoadState('networkidle');
        at /Users/josh/Projects/ezdr
```

## History (last 20 retries)

| Ticket | Set aside | Retried | By | Reason |
| --- | --- | --- | --- | --- |
| EZD-2029 | 2026-11-27T11:03:52Z | 2026-11-27T11:14:41Z | overwatch | check red after merging newer develop (first try: check red after merging newer develop) |
| EZD-2000 | 2026-11-27T04:12:31Z | 2026-11-27T04:29:39Z | overwatch | check red after merging newer develop (first try: check red after merging newer develop) |
