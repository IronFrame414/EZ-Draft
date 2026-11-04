// EZD-108 T22 (vault/plans/EZD-108.md section 4 row T22 and Decided "changePassword", "setPassword"; AC-EZD-108-5,
// -8): the error paths of changePassword and setPassword against a fake Auth client, so no live service runs.
// Expected values: the plan's T22 row. Sources: Q-0251 (a) (a captcha refusal is a 400 `captcha_failed` that is
// settled and not reported), Q-0465 (a) (Change sends the security-check token to the password sign-in),
// Q-0094 (a wrong current password counts, so it is not settled), Q-0447 (a) (a code is checked by shape first).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../auth/session';
import { changePassword, setPassword } from './password';

const fake = vi.hoisted(() => ({
  hasPassword: true,
  cookie: {} as Record<string, unknown>,
  fresh: {} as Record<string, unknown>,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
  headers: async () => new Headers(),
}));

vi.mock('../auth/supabase-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/supabase-server')>();
  return {
    ...actual,
    // No argument: the cookie session client; a jar argument: the fresh in-memory session client.
    createSessionClient: vi.fn((jar?: unknown) => (jar === undefined ? fake.cookie : fake.fresh)),
  };
});

vi.mock('../auth/throttle', () => ({
  throttleTake: vi.fn(async () => ({
    allowed: true,
    limitedBy: null,
    attemptId: 'a1',
    ipAttemptId: null,
  })),
  throttleSettle: vi.fn(async () => undefined),
  throttleKey: (scope: string, value: string) => `${scope}:${value}`,
  clientIp: () => null,
}));

vi.mock('../errors/report', () => ({ reportError: vi.fn(async () => ({})) }));

import { throttleSettle, throttleTake } from '../auth/throttle';
import { reportError } from '../errors/report';

const takeMock = vi.mocked(throttleTake);
const settleMock = vi.mocked(throttleSettle);
const reportMock = vi.mocked(reportError);

const EMAIL = 'mia@example.test';
const SESSION: Session = { authUserId: 'auth-1', appUserId: 'app-1', email: EMAIL };
const CURRENT = 'current-pass-1';
const NEXT = 'abcd-wxyz1';
const TOKENS = { access_token: 'access-1', refresh_token: 'refresh-1' };

type Call = ReturnType<typeof vi.fn>;
let signInWithPassword: Call;
let updateUser: Call;
let freshSignOut: Call;
let setSession: Call;
let cookieUpdateUser: Call;
let sendEmail: Call;

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPassword = vi.fn(async () => ({
    data: { session: TOKENS },
    error: null,
  }));
  updateUser = vi.fn(async () => ({ data: {}, error: null }));
  freshSignOut = vi.fn(async () => ({ error: null }));
  setSession = vi.fn(async () => ({ data: {}, error: null }));
  cookieUpdateUser = vi.fn(async () => ({ data: {}, error: null }));
  sendEmail = vi.fn(async () => undefined);
  const rpc = vi.fn(async () => ({ data: fake.hasPassword, error: null }));
  fake.fresh = {
    rpc,
    auth: {
      signInWithPassword,
      updateUser,
      signOut: freshSignOut,
      getSession: vi.fn(async () => ({ data: { session: TOKENS }, error: null })),
    },
  };
  fake.cookie = {
    rpc,
    auth: { setSession, updateUser: cookieUpdateUser, reauthenticate: vi.fn() },
  };
});

const deps = () => ({ sendEmail }) as unknown as Parameters<typeof changePassword>[2];

describe('EZD-108 password error paths', () => {
  it('T22 (a) a captcha refusal from the password sign-in is a settled 400 captcha_failed, not reported', async () => {
    fake.hasPassword = true;
    signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'captcha_failed', status: 400 },
    });
    const result = await changePassword(
      SESSION,
      {
        mode: 'change',
        currentPassword: CURRENT,
        newPassword: NEXT,
        confirmPassword: NEXT,
        captchaToken: 'tok-1',
      },
      deps(),
    );
    expect(result).toEqual({ status: 400, code: 'captcha_failed' });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: EMAIL,
      password: CURRENT,
      options: { captchaToken: 'tok-1' },
    });
    expect(settleMock).toHaveBeenCalledTimes(1);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it('T22 (b) an empty captcha token is sent as undefined; invalid credentials count (not settled)', async () => {
    fake.hasPassword = true;
    signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'invalid_credentials', status: 400 },
    });
    const result = await changePassword(
      SESSION,
      {
        mode: 'change',
        currentPassword: CURRENT,
        newPassword: NEXT,
        confirmPassword: NEXT,
        captchaToken: '',
      },
      deps(),
    );
    expect(result).toEqual({ status: 400, code: 'current_password_wrong' });
    const arg = signInWithPassword.mock.calls[0][0] as {
      options?: { captchaToken?: string };
    };
    expect(arg.options?.captchaToken).toBeUndefined();
    expect(settleMock).not.toHaveBeenCalled();
  });

  it('T22 (c) a failed move onto the fresh session is reported, the fresh session signs out locally, the answer stays 200', async () => {
    fake.hasPassword = true;
    setSession.mockRejectedValueOnce(new Error('move failed'));
    const result = await changePassword(
      SESSION,
      { mode: 'change', currentPassword: CURRENT, newPassword: NEXT, confirmPassword: NEXT },
      deps(),
    );
    expect(result.status).toBe(200);
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect((reportMock.mock.calls[0][0] as Error).message).toBe('profile_session_move_failed');
    expect(freshSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('T22 (d) a blank or short code is a 400 code_invalid before any throttle slot or Auth call', async () => {
    fake.hasPassword = false;
    for (const code of ['', '12']) {
      const result = await setPassword(
        SESSION,
        { mode: 'set', newPassword: NEXT, confirmPassword: NEXT, code },
        deps(),
      );
      expect(result, JSON.stringify(code)).toEqual({ status: 400, code: 'code_invalid' });
    }
    expect(takeMock).not.toHaveBeenCalled();
    expect(cookieUpdateUser).not.toHaveBeenCalled();
  });

  it('T22 (e) reauthentication_needed with a code is a 400 code_invalid and is not reported', async () => {
    fake.hasPassword = false;
    cookieUpdateUser.mockResolvedValueOnce({
      data: {},
      error: { code: 'reauthentication_needed', status: 400 },
    });
    const result = await setPassword(
      SESSION,
      { mode: 'set', newPassword: NEXT, confirmPassword: NEXT, code: '123456' },
      deps(),
    );
    expect(result).toEqual({ status: 400, code: 'code_invalid' });
    expect(reportMock).not.toHaveBeenCalled();
  });
});
