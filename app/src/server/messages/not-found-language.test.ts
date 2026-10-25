// EZD-136 · U8: the not-found page's language (vault/plans/EZD-136.md sections 1, 3, 4; AC-EZD-136-1).
// Sources: Decided "Not-found language", "Not-found failed read"; Q-0305 (c); request-language.test.ts (mock
// pattern); report.ts (ReportResult).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRequestLanguage = vi.fn();
const getSignInLanguage = vi.fn();
const reportError = vi.fn();

vi.mock('./request-language', async () => {
  const actual = await vi.importActual<typeof import('./request-language')>('./request-language');
  return {
    getRequestLanguage: (...a: unknown[]) => getRequestLanguage(...a),
    NotSignedInError: actual.NotSignedInError,
  };
});
vi.mock('../auth/sign-in-language', () => ({
  getSignInLanguage: (...a: unknown[]) => getSignInLanguage(...a),
}));
vi.mock('../errors/report', () => ({
  reportError: (...a: unknown[]) => reportError(...a),
}));

import { NotSignedInError } from './request-language';
import { getNotFoundLanguage } from './not-found-language';

type Case = {
  name: string;
  request: () => Promise<string>;
  cookie: 'en' | 'es';
  expected: 'en' | 'es';
  signInCalls: number | null;
  reported: unknown;
};

describe('EZD-136 not-found language', () => {
  beforeEach(() => {
    getRequestLanguage.mockReset();
    getSignInLanguage.mockReset();
    reportError.mockReset();
    reportError.mockResolvedValue({ sentryEventId: null, alert: 'not_alerted', alertId: null });
  });

  it('U8 not-found language: the record with a session, else the cookie; only an unexpected failure is reported', async () => {
    const dbError = Object.assign(new Error('db'), { code: 'XX000' });
    const cases: Case[] = [
      {
        name: '(a)',
        request: () => Promise.resolve('es'),
        cookie: 'en',
        expected: 'es',
        signInCalls: 0,
        reported: null,
      },
      {
        name: '(b)',
        request: () => Promise.reject(new NotSignedInError()),
        cookie: 'es',
        expected: 'es',
        signInCalls: null,
        reported: null,
      },
      {
        name: '(c)',
        request: () => Promise.reject(new NotSignedInError()),
        cookie: 'en',
        expected: 'en',
        signInCalls: null,
        reported: null,
      },
      {
        name: '(d)',
        request: () => Promise.reject(dbError),
        cookie: 'en',
        expected: 'en',
        signInCalls: 1,
        reported: dbError,
      },
    ];
    for (const c of cases) {
      getRequestLanguage.mockReset();
      getSignInLanguage.mockReset();
      reportError.mockClear();
      getRequestLanguage.mockImplementation(c.request);
      getSignInLanguage.mockResolvedValue(c.cookie);
      let outcome: { ok: true; value: unknown } | { ok: false; error: unknown };
      try {
        outcome = { ok: true, value: await getNotFoundLanguage() };
      } catch (error) {
        outcome = { ok: false, error };
      }
      expect(outcome, c.name).toEqual({ ok: true, value: c.expected });
      expect(getRequestLanguage, c.name).toHaveBeenCalledTimes(1);
      expect(getRequestLanguage, c.name).toHaveBeenCalledWith('field');
      if (c.signInCalls !== null) {
        expect(getSignInLanguage, c.name).toHaveBeenCalledTimes(c.signInCalls);
      }
      if (c.reported === null) {
        expect(reportError, c.name).toHaveBeenCalledTimes(0);
      } else {
        expect(reportError, c.name).toHaveBeenCalledTimes(1);
        expect(reportError.mock.calls[0][0], c.name).toBe(c.reported);
        expect(reportError.mock.calls[0][1], c.name).toEqual({
          source: 'function',
          location: 'not_found.language',
        });
      }
    }
  });
});
