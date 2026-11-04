// EZD-171 T8-T10 (vault/plans/EZD-171.md section 4). Pattern app/src/server/messages/request-language.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSessionClient = vi.fn();
vi.mock('../../../../server/auth/supabase-server', () => ({
  createSessionClient: (...a: unknown[]) => createSessionClient(...a),
}));

import { GET } from './route';

const UUID = '11111111-1111-4111-8111-111111111111';
const getClaims = vi.fn();
const rpc = vi.fn();

const req = (headers: Record<string, string> = {}) =>
  new Request('http://127.0.0.1:3000/dev/cloud-check/read', { headers });

describe('EZD-171 cloud check read route', () => {
  beforeEach(() => {
    getClaims.mockReset();
    rpc.mockReset();
    createSessionClient.mockReset();
    createSessionClient.mockReturnValue({ auth: { getClaims }, rpc });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const signedIn = (claims: Record<string, unknown> = { sub: UUID, tenant_id: UUID }) =>
    getClaims.mockResolvedValue({ data: { claims }, error: null });

  it('EZD-171 T8 (a) production, no sub: empty 404, rpc not called', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });
    const res = await GET(req({ 'x-forwarded-for': '198.51.100.7' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('EZD-171 T8 (b) production, client cannot be built: empty 404', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    createSessionClient.mockImplementation(() => {
      throw new Error('no env');
    });
    const res = await GET(req({ 'x-forwarded-for': '198.51.100.7' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('EZD-171 T8 (c) production, signed in: 200 with the booleans and the address', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    signedIn();
    rpc.mockResolvedValue({ data: UUID, error: null });
    const res = await GET(req({ 'x-forwarded-for': '198.51.100.7' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({
      vercelEnv: 'production',
      clientIp: '198.51.100.7',
      session: { signedIn: true, tenantClaim: true, gate: 'accepted' },
    });
    expect(Object.keys(body)).toEqual(['vercelEnv', 'clientIp', 'session']);
  });

  it('EZD-171 T9 preview: first forwarded address, signed out is not_checked', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });
    const res = await GET(req({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      vercelEnv: 'preview',
      clientIp: '198.51.100.7',
      session: { signedIn: false, tenantClaim: false, gate: 'not_checked' },
    });
  });

  const t10: [string, () => void, object][] = [
    [
      'a',
      () => {
        signedIn();
        rpc.mockResolvedValue({ data: UUID, error: null });
      },
      { signedIn: true, tenantClaim: true, gate: 'accepted' },
    ],
    [
      'b',
      () => {
        signedIn();
        rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
      },
      { signedIn: true, tenantClaim: true, gate: 'refused' },
    ],
    [
      'c',
      () => {
        signedIn();
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST301' } });
      },
      { signedIn: true, tenantClaim: true, gate: 'error' },
    ],
    [
      'd',
      () => {
        createSessionClient.mockImplementation(() => {
          throw new Error('no env');
        });
      },
      { signedIn: false, tenantClaim: false, gate: 'client_unavailable' },
    ],
    [
      'e',
      () => {
        signedIn({ sub: UUID });
        rpc.mockResolvedValue({ data: UUID, error: null });
      },
      { signedIn: true, tenantClaim: false, gate: 'accepted' },
    ],
    [
      'f',
      () => {
        getClaims.mockResolvedValue({ data: null, error: { message: 'x' } });
      },
      { signedIn: false, tenantClaim: false, gate: 'not_checked' },
    ],
  ];
  for (const [label, setup, session] of t10) {
    it(`EZD-171 T10 (${label}) session ${JSON.stringify(session)}`, async () => {
      vi.stubEnv('VERCEL_ENV', '');
      setup();
      const res = await GET(req());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ vercelEnv: null, clientIp: null, session });
    });
  }
});
