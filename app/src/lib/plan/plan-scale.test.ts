// EZD-219 U1, U2 (vault/plans/EZD-219.md section 4; Q-0664; Decided "Scale list", "Reading `plan_scale`";
// section 3 `savePlanScale`). The fetch is a stub; no network.
import { describe, expect, it, vi } from 'vitest';
import { PLAN_SCALES, isPlanScale, planScaleFromSettings, savePlanScale } from './plan-scale';

describe('EZD-219 plan scale', () => {
  it('EZD-219 U1 plan scales and reading the project setting', () => {
    expect([...PLAN_SCALES]).toEqual([0.125, 0.1875, 0.25, 0.375, 0.5, 0.75, 1]);
    expect(planScaleFromSettings({ plan_scale: 0.25 })).toBe(0.25);
    expect(planScaleFromSettings({})).toBe(0.5);
    expect(planScaleFromSettings({ plan_scale: 0.3 })).toBe(0.5);
    expect(planScaleFromSettings({ plan_scale: '0.5' })).toBe(0.5);
    expect(planScaleFromSettings(null)).toBe(0.5);
    expect(planScaleFromSettings([])).toBe(0.5);
    expect(isPlanScale(0.1875)).toBe(true);
    expect(isPlanScale(1)).toBe(true);
    expect(isPlanScale(2)).toBe(false);
  });

  it('EZD-219 U2 savePlanScale sends one PUT and is true only on 200', async () => {
    const ok = vi.fn(async () => Response.json({ scale: 0.25 }, { status: 200 }));
    expect(await savePlanScale('p1', 0.25, { fetchImpl: ok as unknown as typeof fetch })).toBe(
      true,
    );
    expect(ok).toHaveBeenCalledTimes(1);
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('/api/projects/p1/plan-scale');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"scale":0.25}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');

    const fail = vi.fn(async () =>
      Response.json({ error: { code: 'db_unavailable', message_key: 'x' } }, { status: 500 }),
    );
    expect(await savePlanScale('p1', 0.25, { fetchImpl: fail as unknown as typeof fetch })).toBe(
      false,
    );
    expect(fail).toHaveBeenCalledTimes(1);

    const thrown = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await savePlanScale('p1', 0.25, { fetchImpl: thrown as unknown as typeof fetch })).toBe(
      false,
    );
    expect(thrown).toHaveBeenCalledTimes(1);
  });
});
