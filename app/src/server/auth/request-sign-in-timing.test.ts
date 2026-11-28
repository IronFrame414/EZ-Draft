// EZD-2021 (audit 2026-11-27 X9; AC-EZD-2021-2, AC-EZD-2021-3): "Email me a code" (requestSignIn) answers after the same
// minimum time for a member and for a stranger. Auth is stubbed (no live service): for a member signInWithOtp
// succeeds after a short delay (the email is sent); for a stranger it is refused at once with 403 (the
// before-user-created hook). Expected values: both answer { step: 'code' } (Q-0174 (a), one answer for every
// address), neither before SIGN_IN_MIN_ANSWER_MS and both at it; an Auth call slower than the minimum answers
// when Auth answers, with no extra wait. Fake timers only; nothing reaches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  otp: null as null | ((email: string) => Promise<{ error: unknown }>),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {} }),
}));
vi.mock('./request-cookies', () => ({
  readAppCookie: async () => null,
  setAppCookie: async () => {},
  clearAppCookie: async () => {},
}));
vi.mock('../errors/report', () => ({ reportError: async () => {} }));
vi.mock('./supabase-server', () => ({
  createSessionClient: () => ({
    auth: {
      signInWithOtp: ({ email }: { email: string }) => {
        if (!state.otp) throw new Error('otp stub not set');
        return state.otp(email);
      },
    },
  }),
}));
vi.mock('./throttle', async (importOriginal) => {
  const real = await importOriginal<typeof import('./throttle')>();
  return {
    ...real,
    throttleTake: async () => ({
      allowed: true,
      limitedBy: null,
      attemptId: 'a',
      ipAttemptId: 'b',
    }),
    throttleSettle: async () => {},
  };
});

import { requestSignIn } from './actions';
import { answerAfter, SIGN_IN_MIN_ANSWER_MS } from './min-answer-time';

const MEMBER = 'member@example.test';
const STRANGER = 'stranger@example.test';
const MEMBER_SEND_MS = 50;

function form(email: string): FormData {
  const f = new FormData();
  f.set('email', email);
  return f;
}

// Starts requestSignIn and records when (in fake time) it answered.
function start(email: string): { done: () => boolean; answer: Promise<unknown> } {
  let finished = false;
  const answer = requestSignIn(form(email)).then((v) => {
    finished = true;
    return v;
  });
  return { done: () => finished, answer };
}

const memberOrStranger = (sendMs: number) => (email: string) =>
  email === MEMBER
    ? new Promise<{ error: unknown }>((resolve) => setTimeout(() => resolve({ error: null }), sendMs))
    : Promise.resolve({ error: { status: 403, code: 'hook_refused', message: 'refused' } });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  state.otp = null;
});

describe('EZD-2021 requestSignIn minimum answer time (X9)', () => {
  it('T1 a member and a stranger both answer { step: code } after the same minimum time, not before', async () => {
    state.otp = memberOrStranger(MEMBER_SEND_MS);
    const member = start(MEMBER);
    const stranger = start(STRANGER);

    await vi.advanceTimersByTimeAsync(SIGN_IN_MIN_ANSWER_MS - 1);
    expect(member.done()).toBe(false);
    expect(stranger.done()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(member.done()).toBe(true);
    expect(stranger.done()).toBe(true);
    expect(await member.answer).toEqual({ step: 'code' });
    expect(await stranger.answer).toEqual({ step: 'code' });
  });

  it('T2 the stranger path alone (Auth refuses at once) still waits the full minimum', async () => {
    state.otp = memberOrStranger(MEMBER_SEND_MS);
    const stranger = start(STRANGER);
    await vi.advanceTimersByTimeAsync(0);
    expect(stranger.done()).toBe(false);
    await vi.advanceTimersByTimeAsync(SIGN_IN_MIN_ANSWER_MS - 1);
    expect(stranger.done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await stranger.answer).toEqual({ step: 'code' });
  });

  it('T3 a member whose Auth call is slower than the minimum answers when Auth answers, with no extra wait', async () => {
    const slow = SIGN_IN_MIN_ANSWER_MS + 700;
    state.otp = memberOrStranger(slow);
    const member = start(MEMBER);
    await vi.advanceTimersByTimeAsync(slow - 1);
    expect(member.done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(member.done()).toBe(true);
    expect(await member.answer).toEqual({ step: 'code' });
  });

  it('T4 an error answer (Auth rate limit) also waits the minimum', async () => {
    state.otp = async () => ({ error: { status: 429, code: 'over_request_rate_limit', message: 'x' } });
    const out = start(MEMBER);
    await vi.advanceTimersByTimeAsync(SIGN_IN_MIN_ANSWER_MS - 1);
    expect(out.done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await out.answer).toEqual({ error: 'too_many_requests' });
  });

  it('T5 an invalid email answers at once (the format check tells nothing about membership)', async () => {
    state.otp = memberOrStranger(MEMBER_SEND_MS);
    const out = start('not-an-email');
    await vi.advanceTimersByTimeAsync(0);
    expect(out.done()).toBe(true);
    expect(await out.answer).toEqual({ error: 'invalid_email' });
  });

  it('T6 answerAfter waits the rest of the minimum after a throw as well', async () => {
    let settled = false;
    const p = answerAfter(SIGN_IN_MIN_ANSWER_MS, async () => {
      throw new Error('boom');
    }).catch((e: Error) => {
      settled = true;
      return e.message;
    });
    await vi.advanceTimersByTimeAsync(SIGN_IN_MIN_ANSWER_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe('boom');
  });
});
