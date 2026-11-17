// EZD-421 (Q-0753 (a); AC-EZD-421-1, -2): setPassword and the throttle slot rethrow an ended-session error to
// the route (which answers 401 with no report, server/auth/ended-session.ts) instead of reporting it and
// answering 500; a live session's failure keeps its report and 500. Fake Auth client and throttle, as
// password.errors.test.ts; the ended-session check is stubbed (its own tests: ended-session.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../auth/session';
import { setPassword } from './password';

const fake = vi.hoisted(() => ({ cookie: {} as Record<string, unknown>, ended: false }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
  headers: async () => new Headers(),
}));

vi.mock('../auth/supabase-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/supabase-server')>()),
  createSessionClient: vi.fn(() => fake.cookie),
}));

vi.mock('../auth/throttle', () => ({
  throttleTake: vi.fn(async () => ({ allowed: true, limitedBy: null, attemptId: 'a1', ipAttemptId: null })),
  throttleSettle: vi.fn(async () => undefined),
  throttleKey: (scope: string, value: string) => `${scope}:${value}`,
  clientIp: () => null,
}));

vi.mock('../auth/ended-session', () => ({ sessionEnded: vi.fn(async () => fake.ended) }));
vi.mock('../errors/route-failure', () => ({ reportRouteFailure: vi.fn(async () => undefined) }));
vi.mock('../errors/report', () => ({ reportError: vi.fn(async () => ({})) }));

import { throttleTake } from '../auth/throttle';
import { reportError } from '../errors/report';
import { reportRouteFailure } from '../errors/route-failure';

const SESSION: Session = { authUserId: 'auth-1', appUserId: 'app-1', email: 'mia@example.test' };
const NEXT = 'abcd-wxyz1';
const GONE = { name: 'AuthApiError', status: 403, code: 'session_not_found' };
const sendEmail = vi.fn(async () => undefined);
const deps = () => ({ sendEmail }) as unknown as Parameters<typeof setPassword>[2];
let updateUser: ReturnType<typeof vi.fn>;
let reauthenticate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fake.ended = false;
  updateUser = vi.fn(async () => ({ data: {}, error: GONE }));
  reauthenticate = vi.fn(async () => ({ data: {}, error: GONE }));
  fake.cookie = {
    rpc: vi.fn(async () => ({ data: false, error: null })),
    auth: { updateUser, reauthenticate },
  };
});

const setReq = (code?: string) =>
  ({ mode: 'set', newPassword: NEXT, confirmPassword: NEXT, ...(code ? { code } : {}) }) as const;

describe('EZD-421 password paths after the session read', () => {
  it('P1 an ended session failing updateUser is rethrown, not reported', async () => {
    fake.ended = true;
    await expect(setPassword(SESSION, setReq(), deps())).rejects.toBe(GONE);
    expect(reportRouteFailure).not.toHaveBeenCalled();
  });

  it('P2 a live session failing updateUser keeps its report and 500', async () => {
    await expect(setPassword(SESSION, setReq(), deps())).resolves.toEqual(
      expect.objectContaining({ status: 500, code: 'db_unavailable' }),
    );
    expect(reportRouteFailure).toHaveBeenCalledWith(GONE, '/api/profile/password');
  });

  it('P3 an ended session failing reauthenticate is rethrown, not reported', async () => {
    fake.ended = true;
    updateUser.mockResolvedValueOnce({ data: {}, error: { code: 'reauthentication_needed', status: 400 } });
    await expect(setPassword(SESSION, setReq(), deps())).rejects.toBe(GONE);
    expect(reportRouteFailure).not.toHaveBeenCalled();
  });

  it('P4 an ended session failing the throttle slot is rethrown, not reported as a throttle fault', async () => {
    fake.ended = true;
    const denied = new Error('auth_throttle_unavailable', { cause: { code: '42501' } });
    vi.mocked(throttleTake).mockRejectedValueOnce(denied);
    await expect(setPassword(SESSION, setReq('123456'), deps())).rejects.toBe(denied);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('P5 a live session failing the throttle slot keeps its report and 500', async () => {
    vi.mocked(throttleTake).mockRejectedValueOnce(new Error('auth_throttle_unavailable'));
    await expect(setPassword(SESSION, setReq('123456'), deps())).resolves.toEqual(
      expect.objectContaining({ status: 500, code: 'db_unavailable' }),
    );
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
