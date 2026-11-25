// EZD-1971, EZD-1989: how long a browser test waits for the benchmark project (3,000 objects) to reach
// editor `ready`. The first open took 7.5 to 9 s on the CI runner, past Playwright's default 5 s expect
// timeout, which stays the limit for small projects. One value, shared by every spec that opens the
// benchmark project, so no spec gets a larger allowance than EZD-1971 settled.
export const BENCHMARK_EDITOR_READY_TIMEOUT_MS = 60_000;
