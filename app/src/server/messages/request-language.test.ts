// EZD-026b B5, B6 (vault/plans/EZD-026b.md Tests).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const createSessionClient = vi.fn();
const createJobsDbClient = vi.fn();

vi.mock('../auth/session', () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock('../auth/supabase-server', () => ({
  createSessionClient: (...a: unknown[]) => createSessionClient(...a),
}));
vi.mock('../jobs/db', () => ({
  createJobsDbClient: (...a: unknown[]) => createJobsDbClient(...a),
}));

import { getRequestLanguage, NotSignedInError } from './request-language';

type Result = { data: { language: string } | null; error: { code: string } | null };

function clientReturning(result: Result) {
  const calls = { from: [] as string[], select: [] as string[], eq: [] as [string, unknown][] };
  const end = () => Promise.resolve(result);
  const chain = {
    select: (c: string) => {
      calls.select.push(c);
      return chain;
    },
    eq: (col: string, v: unknown) => {
      calls.eq.push([col, v]);
      return chain;
    },
    single: end,
    maybeSingle: end,
  };
  const client = {
    from: (t: string) => {
      calls.from.push(t);
      return chain;
    },
  };
  return { client, calls };
}

describe('EZD-026b request language', () => {
  beforeEach(() => {
    getSession.mockReset();
    createSessionClient.mockReset();
    createJobsDbClient.mockReset();
  });

  it('EZD-026b B5 office and client read nothing', async () => {
    getSession.mockResolvedValue(null);
    await expect(getRequestLanguage('office')).resolves.toBe('en');
    await expect(getRequestLanguage('client')).resolves.toBe('en');
    expect(getSession).toHaveBeenCalledTimes(0);
    expect(createSessionClient).toHaveBeenCalledTimes(0);
    expect(createJobsDbClient).toHaveBeenCalledTimes(0);
  });

  it('EZD-026b B6 field reads the user record through the session client', async () => {
    getSession.mockResolvedValue({ authUserId: 'a1', appUserId: 'u1', email: 'x@example.com' });
    const { client, calls } = clientReturning({ data: { language: 'es' }, error: null });
    createSessionClient.mockReturnValue(client);
    await expect(getRequestLanguage('field')).resolves.toBe('es');
    expect(createSessionClient).toHaveBeenCalledTimes(1);
    expect(calls.from).toEqual(['app_user']);
    expect(calls.select).toEqual(['language']);
    expect(calls.eq).toEqual([['id', 'u1']]);
    expect(createJobsDbClient).toHaveBeenCalledTimes(0);
  });

  it('EZD-026b B6 no session rejects with NotSignedInError', async () => {
    getSession.mockResolvedValue(null);
    await expect(getRequestLanguage('field')).rejects.toBeInstanceOf(NotSignedInError);
  });

  it('EZD-026b B6 a query error rejects with no fallback language', async () => {
    getSession.mockResolvedValue({ authUserId: 'a1', appUserId: 'u1', email: 'x@example.com' });
    const { client } = clientReturning({ data: null, error: { code: 'XX000' } });
    createSessionClient.mockReturnValue(client);
    await expect(getRequestLanguage('field')).rejects.toBeDefined();
  });
});
