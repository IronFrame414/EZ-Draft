// EZD-1935 (AC-EZD-1935-1): signInAs on a page whose session was just ended. Cause of the conflict-list B6 gate
// flake, from a failing trace: removing the member's listed project ends their sessions and pushes session.ended;
// the open page then sends itself to /sign-in (GET /sign-in began 17 ms before the harness's goto), and that
// navigation interrupts the goto to /auth/confirm. These tests pin the harness answer (EZD-603, commit 7dd1c481):
// one interruption is waited out and the goto runs again with the same unspent token; nothing else is retried.
// The admin API, the email lock and the session readers are stubbed; no browser and no live service.
import type { Page } from '@playwright/test';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../rls/fixtures', () => ({
  adminDb: () => {
    const query = {
      select: () => query,
      eq: () => query,
      limit: async () => ({ data: [{ id: 'user-1' }], error: null }),
    };
    return {
      from: () => query,
      auth: {
        admin: {
          createUser: async () => ({ error: null }),
          generateLink: async () => ({
            data: { properties: { hashed_token: 'tok 1' } },
            error: null,
          }),
        },
      },
    };
  },
}));
vi.mock('./email-lock', () => ({
  withEmailLock: (_email: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('./session-claims', () => ({
  sessionClaims: async () => ({ appUserId: 'user-1' }),
  sessionDbs: async () => ({ accessToken: 'jwt' }),
}));

import { signInAs } from './sign-in-as';

const CONFIRM_URL = '/auth/confirm?token_hash=tok%201&type=email';
const interrupted = () =>
  new Error(
    `page.goto: Navigation to "http://127.0.0.1:3030${CONFIRM_URL}" is interrupted by another navigation to "http://127.0.0.1:3030/sign-in"`,
  );

// A page that records what the harness does to it, in order. `gotoErrors` are thrown by the first gotos, in turn.
function fakePage(gotoErrors: Error[]) {
  const calls: string[] = [];
  const page = {
    goto: async (url: string) => {
      calls.push(`goto ${url}`);
      const error = gotoErrors.shift();
      if (error) throw error;
    },
    waitForLoadState: async (state: string) => {
      calls.push(`waitForLoadState ${state}`);
    },
    getByTestId: (id: string) => ({
      click: async () => {
        calls.push(`click ${id}`);
      },
      // The error box never shows: the race is won by the arrival at '/'.
      waitFor: () => new Promise<void>(() => {}),
      isVisible: async () => false,
      textContent: async () => null,
    }),
    waitForURL: async () => {
      calls.push('waitForURL');
    },
    context: () => ({}),
  };
  return { page: page as unknown as Page, calls };
}

describe('EZD-1935 signInAs after the page session ended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('EZD-1935 T1 no interruption: one goto, then confirm', async () => {
    const { page, calls } = fakePage([]);
    const signedIn = await signInAs(page, 'Member@Example.test');
    expect(calls).toEqual([`goto ${CONFIRM_URL}`, 'click confirm-submit', 'waitForURL']);
    expect(signedIn).toEqual({ appUserId: 'user-1', accessToken: 'jwt' });
  });

  test('EZD-1935 T2 a goto interrupted by the ended-session redirect waits for that page, then goes again with the same token', async () => {
    const { page, calls } = fakePage([interrupted()]);
    const signedIn = await signInAs(page, 'member@example.test');
    expect(calls).toEqual([
      `goto ${CONFIRM_URL}`,
      'waitForLoadState load',
      `goto ${CONFIRM_URL}`,
      'click confirm-submit',
      'waitForURL',
    ]);
    expect(signedIn).toEqual({ appUserId: 'user-1', accessToken: 'jwt' });
  });

  test('EZD-1935 T3 a second interruption still fails; confirm is never clicked', async () => {
    const { page, calls } = fakePage([interrupted(), interrupted()]);
    await expect(signInAs(page, 'member@example.test')).rejects.toThrow(
      /interrupted by another navigation/,
    );
    expect(calls).toEqual([
      `goto ${CONFIRM_URL}`,
      'waitForLoadState load',
      `goto ${CONFIRM_URL}`,
    ]);
  });

  test('EZD-1935 T4 any other goto error fails at once, with no second goto', async () => {
    const { page, calls } = fakePage([new Error('page.goto: net::ERR_CONNECTION_REFUSED')]);
    await expect(signInAs(page, 'member@example.test')).rejects.toThrow(/ERR_CONNECTION_REFUSED/);
    expect(calls).toEqual([`goto ${CONFIRM_URL}`]);
  });
});
