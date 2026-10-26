# Live-network guard (EZD-021)

Only loopback hosts (`localhost`, `127.0.0.1`, `::1`) are reachable in tests. Any other host is blocked,
recorded as `{ via, method, host, at }` (never query, headers or body), and fails the call with
`NetGuardError` (`live_network_blocked_in_tests`).

- `net-guard.mjs`: the core (`installNetGuard`, `isLoopback`, `blockedAttempts`). Wraps `fetch`, `http` and `https` `request`/`get`, `net.connect`, `net.createConnection`,
  `net.Socket.prototype.connect`, `tls.connect` and the global `WebSocket`; Unix socket paths are allowed (EZD-159).
- `vitest.setup.ts`: in `app/vitest.config.ts` `setupFiles`; fails a test that made an attempt, even if it caught the error.
- `preload.mjs`: `node --import` for the root `node:test` run and the app server under Playwright; appends to
  `EZD_NET_GUARD_LOG`, exits 1 on any attempt.
- Playwright: `../e2e/net-guard-fixture.ts` (auto fixture; page WebSockets through `routeWebSocket`, EZD-159) and `../e2e/global-teardown.ts` (backstop).
- `probe.vitest.config.ts` and `probes/`: run only by `net-guard.test.ts` (T12) in child processes.
