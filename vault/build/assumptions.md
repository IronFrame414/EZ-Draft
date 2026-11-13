# Assumptions and wording for Josh

The builder records here every choice the spec, decisions and mockups did not settle, and any user-visible text not on a mockup. Josh confirms or changes them in bulk; a change becomes a new ticket.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-397 | Why EZD-117a B2 (warm Projects page, first cards within 1,000 ms) took 1033.2 ms and 1013.1 ms on CI, and the fix | Not an app defect: between the last green run (6229456b) and the first red one (d1db60f0) only editor, geometry, icon and catalog files changed, and locally the warm first card shows at 75 to 106 ms (4 runs of a throwaway timing spec, idle machine). The extra time is other browser workers' load on the CI runner. Fix: B2 moved unchanged (same title, bound 1,000 ms, no retry) to app/e2e/perf-projects-warm.spec.ts, so the `perf` project runs it alone after the device projects. Side effect: like every perf spec, B2 is skipped when a device-project test fails, and the gate fails then anyway. | 11 Budgets "Projects page"; EZD-207c D-Isolate (docs/architecture.md "Perf project"); git diff 6229456b..d1db60f0 |
