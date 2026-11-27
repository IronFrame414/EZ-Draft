// EZD-2022 (AC-EZD-2022-3; audit 2026-11-27 X7): /api/health answers only { status } to a caller without a session
// or the cron secret; the schema version goes to the cron secret (the release check) and to a signed-in member.
// Stubs: the database read and the session (no live service).
// AC-EZD-2022-4: this route test covers the health change with stubs; no function or policy changed, so no
// database test is needed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: async (): Promise<unknown> => null,
}));
vi.mock('../../../server/db/health', () => ({
  readHealth: vi.fn(async () => ({ status: 'ok', schema_version: '20261127130000' })),
}));
vi.mock('../../../server/auth/session', () => ({
  getSession: vi.fn(() => state.session()),
}));
vi.mock('../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));
import { carriesCronSecret } from '../../../server/auth/health-caller';
import { GET } from './route';

const SECRET = 'cron-secret-TEST';
const FULL = { status: 'ok', schema_version: '20261127130000' };
const QUIET = { status: 'ok' };

function req(authorization?: string): Request {
  return new Request('http://localhost/api/health', {
    headers: authorization === undefined ? {} : { authorization },
  });
}

async function body(r?: Request) {
  const res = await GET(r);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toContain('no-store');
  return res.json();
}

describe('EZD-2022 GET /api/health shows the schema version only to the cron secret or a session', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
    state.session = async () => null;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('signed out, no secret: only the status', async () => {
    expect(await body(req())).toEqual(QUIET);
    expect(await body()).toEqual(QUIET);
  });

  it('a wrong, partial or unprefixed secret: only the status', async () => {
    for (const a of [`Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, SECRET, `bearer ${SECRET}`, 'Bearer ']) {
      expect(await body(req(a)), a).toEqual(QUIET);
    }
  });

  it('no CRON_SECRET set: even "Bearer " or "Bearer undefined" gets only the status', async () => {
    vi.stubEnv('CRON_SECRET', '');
    for (const a of ['Bearer ', 'Bearer undefined']) expect(await body(req(a)), a).toEqual(QUIET);
    expect(carriesCronSecret(req('Bearer '))).toBe(false);
  });

  it('the cron secret: status and schema version', async () => {
    expect(await body(req(`Bearer ${SECRET}`))).toEqual(FULL);
  });

  it('a signed-in session: status and schema version', async () => {
    state.session = async () => ({ authUserId: 'a', appUserId: 'b', email: 'm@example.com' });
    expect(await body(req())).toEqual(FULL);
  });

  it('a session check that fails counts as signed out', async () => {
    state.session = async () => {
      throw new Error('db down');
    };
    expect(await body(req())).toEqual(QUIET);
  });
});
