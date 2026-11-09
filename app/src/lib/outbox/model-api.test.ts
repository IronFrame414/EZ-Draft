// EZD-120b U9 (vault/plans/EZD-120b.md section 4; AC-EZD-120b-4, -5). Expected values: AC-5 (the load answer
// as the route gives it; a thrown fetch is status 0, code `network`) and Decided "Reopen" (loaded objects with
// that project's entries on top; a null entry removes the object).
import { describe, expect, it, vi } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import { fetchModel, loadWorkingCopy, type ModelLoad } from './model-api';
import type { OutboxEntry } from './outbox';

const P = '11111111-1111-4111-8111-111111111111';
const LOAD: ModelLoad = {
  project: { id: P, name: 'Kitchen', clientName: null },
  viewer: { appUserId: 'u1', tenantId: 't1', membershipId: 'm1', canEdit: true },
  lockEpoch: 0,
  objects: [
    { id: 'A', updatedSeq: 1, ...v(1) },
    { id: 'B', updatedSeq: 2, ...v(2) },
  ],
  invalid: [],
  numberHighs: { wall: 0, door: 0, window: 0 },
};
const entry = (id: string, value: OutboxEntry['value']): OutboxEntry => ({
  projectId: P,
  id,
  baseSeq: 0,
  lockEpoch: 0,
  value,
  rev: 1,
  queuedAt: 0,
});

describe('EZD-120b model api', () => {
  it('U9 fetchModel reads the load route, and maps a refusal and a thrown fetch', async () => {
    const ok = vi.fn(async () => Response.json(LOAD));
    const a = await fetchModel(P, { fetchImpl: ok as unknown as typeof fetch });
    expect(ok).toHaveBeenCalledTimes(1);
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain(`/api/projects/${P}/model`);
    expect(a).toEqual({ ok: true, model: LOAD });

    const missing = vi.fn(async () =>
      Response.json(
        { error: { code: 'project_not_found', message_key: 'error.project_not_found' } },
        { status: 404 },
      ),
    );
    expect(await fetchModel(P, { fetchImpl: missing as unknown as typeof fetch })).toEqual({
      ok: false,
      status: 404,
      code: 'project_not_found',
    });

    const broken = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await fetchModel(P, { fetchImpl: broken as unknown as typeof fetch })).toEqual({
      ok: false,
      status: 0,
      code: 'network',
    });
  });

  it('U9 loadWorkingCopy puts the outbox entries on top of the loaded objects', () => {
    const map = loadWorkingCopy(LOAD, [entry('A', v(10)), entry('B', null), entry('C', v(30))]);
    expect(map.get('A')).toEqual(v(10));
    expect(map.has('B')).toBe(false);
    expect(map.get('C')).toEqual(v(30));
    expect(map.size).toBe(2);
  });
});
