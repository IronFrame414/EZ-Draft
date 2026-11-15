// EZD-116 (AC-EZD-116-8; Q-0697 03 "re-read on the project channel resync"; ARCH Realtime "Resync"; 11 rule 11).
// Expected values: the load's values first; each resync callback makes one GET /api/projects/<id>/defaults and
// a 200 replaces the values and notifies; a failed read keeps them; dispose unsubscribes from the channel.
import { describe, expect, it, vi } from 'vitest';
import { createProjectDefaults, type ResyncSource } from './project-defaults';

const PID = '11111111-1111-4111-8111-111111111111';

function fakeResync() {
  const cbs: (() => void)[] = [];
  const off = vi.fn();
  const source: ResyncSource = (projectId, cb) => {
    expect(projectId).toBe(PID);
    cbs.push(cb);
    return off;
  };
  return { source, fire: () => cbs.forEach((cb) => cb()), off, count: () => cbs.length };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('EZD-116 project defaults in the editor', () => {
  it('starts from the load and re-reads on every resync; dispose releases the channel', async () => {
    const r = fakeResync();
    const fetchImpl = vi.fn(async () =>
      Response.json({ defaults: { waste_tile: 12, seating_support_limit: null } }),
    );
    const d = createProjectDefaults({
      projectId: PID,
      initial: { waste_tile: 10, seating_support_limit: null },
      resync: r.source,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.count()).toBe(1);
    expect(d.get().waste_tile).toBe(10);
    expect(fetchImpl).not.toHaveBeenCalled();

    const seen = vi.fn();
    d.subscribe(seen);
    r.fire();
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]).toEqual([
      `/api/projects/${PID}/defaults`,
      { cache: 'no-store' },
    ]);
    expect(d.get().waste_tile).toBe(12);
    expect(seen).toHaveBeenCalledTimes(1);

    // same values: no notice
    r.fire();
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenCalledTimes(1);

    d.dispose();
    expect(r.off).toHaveBeenCalledTimes(1);
  });

  it('a failed read keeps the values', async () => {
    const r = fakeResync();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }));
    const d = createProjectDefaults({
      projectId: PID,
      initial: { waste_tile: 10 },
      resync: r.source,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    r.fire();
    await flush();
    expect(d.get()).toEqual({ waste_tile: 10 });
  });
});
