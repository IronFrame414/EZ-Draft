// EZD-016a Step 4 (vault/plans/EZD-016a.md): several signed-in people at once (12 Edit lock row; EZD-018
// presence). Each session is its own browser context at the current project's size and device values
// (testInfo.project.use), signed in with signInAs. The fixture's teardown closes every context it opened,
// including after a failure.
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionClaims } from './session-claims';
import { signInAs } from './sign-in-as';

export type OpenSession = {
  email: string;
  context: BrowserContext;
  page: Page;
  claims: SessionClaims;
  accessToken: string;
  serverDb: SupabaseClient;
  browserDb: SupabaseClient;
};

export type Sessions = { open(emails: string[]): Promise<OpenSession[]> };

// Builds the fixture value and the teardown that closes every context it opened.
export function createSessions(
  browser: Browser,
  testInfo: TestInfo,
): { sessions: Sessions; closeAll: () => Promise<void> } {
  const opened: BrowserContext[] = [];
  const use = testInfo.project.use;
  const sessions: Sessions = {
    async open(emails) {
      const out: OpenSession[] = [];
      for (const email of emails) {
        const context = await browser.newContext({
          viewport: use.viewport,
          deviceScaleFactor: use.deviceScaleFactor,
          isMobile: use.isMobile,
          hasTouch: use.hasTouch,
          userAgent: use.userAgent,
          baseURL: use.baseURL,
        });
        opened.push(context);
        const page = await context.newPage();
        const { accessToken, serverDb, browserDb, ...claims } = await signInAs(page, email);
        out.push({ email, context, page, claims, accessToken, serverDb, browserDb });
      }
      return out;
    },
  };
  const closeAll = async () => {
    const all = opened.splice(0);
    await Promise.allSettled(all.map((c) => c.close()));
  };
  return { sessions, closeAll };
}
