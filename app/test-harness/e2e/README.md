# Browser test harness (EZD-016a)

Plan: `vault/plans/EZD-016a.md` Steps 1–6. Specs import only from `app/test-harness/e2e/test.ts`:

```ts
import { test, expect, signInAsOwner } from '../test-harness/e2e/test';
```

## Projects and tags

`app/playwright.config.ts` runs four device projects: `desktop`, `ipad-landscape`, `surface` and `phone`. A test with no device tag runs in `desktop` only; a test tagged `@desktop`, `@ipad`, `@surface` or `@phone` runs in exactly those projects. Sizes, browsers and the gate scope are in `docs/architecture.md` `### Browser tests (EZD-016a)` (EZD-016d).

## Signing in

- `signInAs(email)` (fixture, bound to the test's `page`) and `signInAsOwner(page)` (Josh, the seeded owner) sign in through the app's real `/auth/confirm` page with an admin `generateLink` token, so no email is sent. The person needs an `app_user` row with an `active` membership; otherwise the helper throws `no active membership for <email>` before the browser is touched.
- Each email is signed in by one worker at a time (`email-lock.ts`), because a new `generateLink` replaces the earlier token for that user and four projects sign Josh in at once. A lock file older than 60 s is taken over; a wait over 30 s throws `email lock timeout for <email>`.
- `signInWithCode` (`app/test-harness/sign-in.ts`, EZD-007f) stays for tests that need the email path.

## Server path and browser path

`signInAs` returns the session claims plus `accessToken`, `serverDb` and `browserDb`:

- `serverDb` sends the `x-ezd-api-gate` header, as a server route does.
- `browserDb` does not, so PostgREST refuses it.

Both exist only in the Node test process. The gate secret and the gated client never go to `page.evaluate`, `addInitScript`, `setExtraHTTPHeaders`, `route` handlers or a storage state.

`sessionAccessToken`, `sessionClaims` and `sessionDbs` read the same from any signed-in `BrowserContext`.

## Several people, and the network

- `sessions.open(emails)` opens one signed-in context per email, in order, each at the current project's size. Every context is closed when the test ends, also after a failure.
- `network.set(pageOrContext, 'off' | 'on')` switches a context offline or online and waits until every page reports it; otherwise it throws `network state not reached`.

## Seed rule

Tests never change seeded rows. A test that changes data creates its own rows with the EZD-006 (`createTenant`, `createMember`, re-exported by `test.ts`) or EZD-007a fixtures and removes them in `afterAll` with `cleanup()` and `closeHarness()`.

The global teardown (`global-teardown.ts`, EZD-180) deletes the auth users of `SEEDED_USERS` (`seeded-users.ts`) and fails the run when one is still linked, so a browser sign-in leaves the seeded rows as `pnpm db:up` made them. A ticket that adds a seeded person adds it to `app/test-utils/seed-ids.ts` and to `SEEDED_USERS` (EZD-180 T5 fails otherwise).

## Running

Run `pnpm build`, then `pnpm test:e2e`. Install WebKit once with `pnpm --filter @ezdraft/app exec playwright install webkit`.
