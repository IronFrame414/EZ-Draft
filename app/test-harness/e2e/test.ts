// EZD-016a Step 6 (vault/plans/EZD-016a.md): the one import for browser specs. Fixtures: signInAs bound to
// the test's page, sessions (Step 4) and network (Step 5). Re-exports the seed ids (EZD-005b, EZD-016c),
// signInAsOwner, the session readers and EZD-006's adminDb.
import { test as base, expect } from '@playwright/test';
import { createNetwork, type Network } from './network';
import { createSessions, type Sessions } from './sessions';
import { signInAs as signInAsPage, type SignedIn } from './sign-in-as';

export const test = base.extend<{
  signInAs: (email: string) => Promise<SignedIn>;
  sessions: Sessions;
  network: Network;
}>({
  // The fixture callback is named `provide`, not `use`, so the React hooks lint does not read it as a hook.
  signInAs: async ({ page }, provide) => {
    await provide((email: string) => signInAsPage(page, email));
  },
  // Playwright runs the code after provide() as teardown, also when the test failed.
  sessions: async ({ browser }, provide, testInfo) => {
    const { sessions, closeAll } = createSessions(browser, testInfo);
    await provide(sessions);
    await closeAll();
  },
  // Playwright requires an object pattern as the first argument, even with no dependencies.
  // eslint-disable-next-line no-empty-pattern
  network: async ({}, provide) => {
    await provide(createNetwork());
  },
});

export { expect };
export * from '../../test-utils/seed-ids';
export { signInAsOwner, type SignedIn } from './sign-in-as';
export {
  sessionAccessToken,
  sessionClaims,
  sessionDbs,
  type SessionClaims,
} from './session-claims';
export type { OpenSession, Sessions } from './sessions';
export type { Network } from './network';
export { expectTouchTargets } from '../touch-targets';
export { adminDb } from '../rls/fixtures';
// Section 4: fresh tenants and users come from EZD-006 createTenant / createMember and are removed with
// cleanup() and closeHarness(); re-exported so specs still import only from this file.
export { cleanup, closeHarness, createMember, createTenant } from '../rls/fixtures';
// EZD-018 Step 9 item 3: projects and the admin SQL client for the Realtime spec's database broadcast.
export { createProjects, harnessSql } from '../rls/fixtures';
// EZD-024 Re-validation V8: the email and Sentry stub readers for the error-reporting spec.
export { linksIn, readStubOutboxDir } from '../email-outbox';
export { eventsIn, readSentryStubOutboxDir } from '../sentry-outbox';
// EZD-033 Step 8: members with passwords, the code sign-in helper and the mail catcher readers, so specs
// still import only from this file.
export {
  cleanupTestMembers,
  createPasswordMember,
  createTestMember,
  createUnconfirmedPasswordUser,
  randomPassword,
} from '../auth-users';
export { signInWithCode } from '../sign-in';
export { countAuthEmails, emailSubjects, waitForAuthEmail, waitForRawEmail } from '../mail-catcher';
