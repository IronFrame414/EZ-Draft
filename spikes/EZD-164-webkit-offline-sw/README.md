# EZD-164 spike: WebKit offline service-worker test

Throwaway spike for vault/plans/EZD-164.md. Question: can the automated iPad and iPhone (WebKit) tests check that a
page reloads from a service worker's cache with the network off? Never imported by the app, packages or worker.
The orchestrator writes `vault/spikes/EZD-164.md` from the outputs.

## Run

From the repo root, one command at a time:

1. `pnpm db:up`
2. `pnpm --filter @ezdraft/app exec playwright install chromium webkit`
3. `pnpm --filter @ezdraft/app build`
4. Confirm nothing listens on port 3000 (`lsof -i :3000` prints nothing).
5. `pnpm --filter ./spikes/EZD-164-webkit-offline-sw spike-run`

`spike-test` runs the `node:test` checks of the summary code.

## Outputs

- `out/run-log.txt`: the redacted Playwright output with one `EZD-164 RESULT` line per test.
- `out/summary.json`: `verdict`, `chromiumControl`, `failedWebkitChecks`, `playwrightExit`, `results`.

## Verdict rule

`yes` only when all 9 checks are true for both variants (V1 harness test, V2 plain test) in both WebKit projects
(`ipad-landscape`, `phone`). `desktop` (Chromium) is the control and is not part of the verdict.
