// EZD-036 U3 (vault/plans/EZD-036.md section 4): the runtime guard and no eager server imports.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  optionsLoads: 0,
  reportLoads: 0,
  initErrorReporting: vi.fn(() => 'ok'),
  reportError: vi.fn(async () => undefined),
}));

vi.mock('./server/errors/sentry-options', () => {
  m.optionsLoads += 1;
  return { initErrorReporting: m.initErrorReporting };
});
vi.mock('./server/errors/report', () => {
  m.reportLoads += 1;
  return { reportError: m.reportError };
});

describe('EZD-036 instrumentation runtime guard', () => {
  const err = new Error('EZD-036 probe');
  const req = { path: '/x?y=1', method: 'GET', headers: {} };
  const ctx = (
    routePath: string,
  ): Parameters<typeof import('./instrumentation').onRequestError>[2] => ({
    routerKind: 'App Router',
    routePath,
    routeType: 'route',
    revalidateReason: undefined,
  });

  beforeEach(() => {
    vi.resetModules();
    m.optionsLoads = 0;
    m.reportLoads = 0;
    m.initErrorReporting.mockClear();
    m.reportError.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('EZD-036 U3 (a): nothing loads at import, and the edge runtime does nothing', async () => {
    const mod = await import('./instrumentation');
    expect(m.optionsLoads).toBe(0);
    expect(m.reportLoads).toBe(0);
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await mod.register();
    await mod.onRequestError(err, req, ctx('/api/x'));
    expect(m.optionsLoads).toBe(0);
    expect(m.reportLoads).toBe(0);
    expect(m.initErrorReporting).not.toHaveBeenCalled();
    expect(m.reportError).not.toHaveBeenCalled();
  });

  it('EZD-036 U3 (b): the nodejs runtime starts reporting and reports the route', async () => {
    const mod = await import('./instrumentation');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await mod.register();
    await mod.onRequestError(err, req, ctx('/api/x'));
    expect(m.initErrorReporting).toHaveBeenCalledTimes(1);
    expect(m.initErrorReporting).toHaveBeenCalledWith(process.env, 'function');
    expect(m.reportError).toHaveBeenCalledTimes(1);
    expect(m.reportError).toHaveBeenCalledWith(err, { source: 'function', location: '/api/x' });
  });

  it('EZD-036 U3 (c): with no runtime set, the location is the path without its query', async () => {
    const mod = await import('./instrumentation');
    vi.stubEnv('NEXT_RUNTIME', undefined);
    await mod.onRequestError(err, req, ctx(''));
    expect(m.reportError).toHaveBeenCalledWith(err, { source: 'function', location: '/x' });
  });
});
