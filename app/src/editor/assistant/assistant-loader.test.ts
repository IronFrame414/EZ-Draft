// EZD-5604b loader (vault/build/assumptions.md EZD-5604b, editor budget): the session is made on the first press of
// the rail button and opened; later presses toggle it; a failed download changes nothing and the next press tries
// again; dispose disposes the session. Fakes only; no live service.
import { describe, expect, it, vi } from 'vitest';
import { createAssistantLoader, type AssistantSessionModule } from './assistant-loader';
import type { AssistantSession, AssistantSessionDeps } from './assistant-session';

function fakeSession() {
  let open = false;
  const listeners = new Set<() => void>();
  const s = {
    getUi: () => ({ open }),
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    setOpen: vi.fn((o: boolean) => {
      open = o;
      for (const l of listeners) l();
    }),
    toggle: vi.fn(() => s.setOpen(!open)),
    getPreview: () => null,
    dispose: vi.fn(),
  };
  return s;
}

const deps = { projectId: 'p-1' } as unknown as AssistantSessionDeps;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('EZD-5604b assistant loader', () => {
  it('makes the session on the first press, opens it, then toggles it; dispose disposes it', async () => {
    const session = fakeSession();
    const create = vi.fn(() => session as unknown as AssistantSession);
    const load = vi.fn(() =>
      Promise.resolve({ createAssistantSession: create } as AssistantSessionModule),
    );
    const loader = createAssistantLoader(deps, load);
    const listener = vi.fn();
    loader.subscribe(listener);
    expect(loader.getSession()).toBeNull();
    expect(loader.isOpen()).toBe(false);
    loader.toggle();
    loader.toggle();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(deps);
    expect(loader.getSession()).toBe(session);
    expect(loader.isOpen()).toBe(true);
    expect(listener).toHaveBeenCalled();
    loader.toggle();
    expect(session.toggle).toHaveBeenCalledTimes(1);
    expect(loader.isOpen()).toBe(false);
    loader.dispose();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(loader.getSession()).toBeNull();
  });

  it('a failed download changes nothing and the next press tries again', async () => {
    const session = fakeSession();
    const load = vi
      .fn<() => Promise<AssistantSessionModule>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        createAssistantSession: () => session as unknown as AssistantSession,
      });
    const loader = createAssistantLoader(deps, load);
    loader.toggle();
    await flush();
    expect(loader.getSession()).toBeNull();
    expect(loader.isOpen()).toBe(false);
    loader.toggle();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(loader.isOpen()).toBe(true);
  });
});
