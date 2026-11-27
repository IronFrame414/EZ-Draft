// EZD-1911 (AC-EZD-1911-1; editor consolidation plan section 2.6, 5.2 job 6): the four editor dev hooks keep their
// names, members and on/off rule (`devHooks`), and are installed from dev-hooks.ts, not ProjectEditor. The e2e specs
// that read them run unchanged in the gate.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The editor's effects, run at once; their cleanups are kept so a test can take the hooks down.
const cleanups: Array<() => void> = [];
vi.mock('react', () => ({
  useEffect: (fn: () => void | (() => void)) => {
    const off = fn();
    if (typeof off === 'function') cleanups.push(off);
  },
}));
vi.mock('./plan/render-root', () => ({ webglContextsCreated: () => 1 }));
const makeCheckpoint = vi.fn(async (_o: { projectId: string; capture: () => unknown }) => ({ status: 'saved' }));
vi.mock('./thumbnail/checkpoint', () => ({ makeCheckpoint }));

import { useDevHooks, type DevHookParts, type DevHookWindow } from './dev-hooks';

// Section 2.6: hook name and its members.
const HOOKS: Record<string, string[]> = {
  __ezdraftEditor: ['checkpoint', 'edit', 'objects', 'scene3dLoaded'],
  __ezdraftPlan: ['drawn', 'drawnTexts', 'handle', 'phase', 'stats', 'underlay'],
  __ezdraftSelection: ['hoveredId', 'ids'],
  __ezdraft3d: ['stats'],
};

function parts(over: Partial<DevHookParts> = {}): DevHookParts & { applied: unknown[]; flushed: number[] } {
  const applied: unknown[] = [];
  const flushed: number[] = [];
  const handle = { getHoveredId: () => 'w-2' };
  const plan = {
    handle,
    stats: () => ({ draws: 7 }),
    underlay: () => 'underlay',
    drawn: () => 'drawn',
    drawnTexts: () => 'texts',
    captureThumbnail: () => 'png',
  };
  const store = {
    getState: () => ({ objects: new Map([['w-1', { kind: 'wall' }]]) }),
    applyEdit: (c: unknown) => {
      applied.push(c);
      return ['w-1'];
    },
  };
  return {
    devHooks: true,
    projectId: 'p-1',
    session: { store } as unknown as DevHookParts['session'],
    sync: {
      flush: async () => {
        flushed.push(1);
      },
    } as unknown as DevHookParts['sync'],
    plan: plan as unknown as DevHookParts['plan'],
    phase: { phase: 'view' } as unknown as DevHookParts['phase'],
    selection: { getUi: () => ({ ids: ['w-1'] }) } as unknown as DevHookParts['selection'],
    scene3d: { stats: () => ({ meshes: 3 }) } as unknown as DevHookParts['scene3d'],
    show3d: true,
    scene3dLoaded: () => loaded3d,
    applied,
    flushed,
    ...over,
  };
}

// EZD-2009: what the editor's `scene-3d` lazy module reports.
let loaded3d = false;

const g = globalThis as unknown as { window?: DevHookWindow };
const w = () => g.window as Record<string, Record<string, unknown> | undefined>;

beforeEach(() => {
  g.window = {};
  loaded3d = false;
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  delete g.window;
  makeCheckpoint.mockClear();
});

describe('EZD-1911 dev hooks (AC-EZD-1911-1)', () => {
  it('with devHooks on, installs all four hooks under their names with the section 2.6 members', () => {
    useDevHooks(parts());
    for (const [name, members] of Object.entries(HOOKS))
      expect(Object.keys(w()[name] ?? {}).sort(), name).toEqual(members);
  });

  it('with devHooks off, installs none', () => {
    useDevHooks(parts({ devHooks: false }));
    for (const name of Object.keys(HOOKS)) expect(w()[name], name).toBeUndefined();
  });

  it('each hook waits for its own parts', () => {
    useDevHooks(parts({ scene3d: null }));
    expect(w().__ezdraft3d).toBeUndefined();
    expect(w().__ezdraftPlan).toBeDefined();
    cleanups.splice(0).forEach((off) => off());
    useDevHooks(parts({ sync: null, phase: null }));
    expect(w().__ezdraftEditor).toBeUndefined();
    expect(w().__ezdraftPlan).toBeUndefined();
    expect(w().__ezdraftSelection).toBeDefined();
    cleanups.splice(0).forEach((off) => off());
    useDevHooks(parts({ plan: null }));
    for (const name of Object.keys(HOOKS)) expect(w()[name], name).toBeUndefined();
  });

  it('taking the editor down removes every hook', () => {
    useDevHooks(parts());
    cleanups.splice(0).forEach((off) => off());
    for (const name of Object.keys(HOOKS)) expect(w()[name], name).toBeUndefined();
  });

  it('the hooks read the live editor parts', async () => {
    const p = parts();
    useDevHooks(p);
    const ed = w().__ezdraftEditor as unknown as {
      objects(): unknown[];
      edit(c: unknown[]): string[];
      checkpoint(): Promise<unknown>;
      scene3dLoaded(): boolean;
    };
    // EZD-2009: read each time it is asked, so a spec sees the module arrive.
    expect(ed.scene3dLoaded()).toBe(false);
    loaded3d = true;
    expect(ed.scene3dLoaded()).toBe(true);
    expect(ed.objects()).toEqual([{ id: 'w-1', kind: 'wall' }]);
    expect(ed.edit([{ op: 'x' }])).toEqual(['w-1']);
    expect(p.applied).toEqual([[{ op: 'x' }]]);
    await expect(ed.checkpoint()).resolves.toEqual({ status: 'saved' });
    expect(p.flushed).toEqual([1]);
    expect(makeCheckpoint.mock.calls[0]![0].projectId).toBe('p-1');
    expect(makeCheckpoint.mock.calls[0]![0].capture()).toBe('png');

    const plan = w().__ezdraftPlan as unknown as Record<string, () => unknown> & { phase: unknown };
    expect(plan.stats!()).toEqual({ draws: 7, contexts: 1 });
    expect(plan.phase).toBe(p.phase);
    expect([plan.underlay!(), plan.drawn!(), plan.drawnTexts!()]).toEqual(['underlay', 'drawn', 'texts']);

    const sel = w().__ezdraftSelection as unknown as { ids(): string[]; hoveredId(): string | null };
    expect(sel.ids()).toEqual(['w-1']);
    expect(sel.hoveredId()).toBe('w-2');

    const s3 = w().__ezdraft3d as unknown as { stats(): unknown };
    expect(s3.stats()).toEqual({ meshes: 3, contexts: 1, shown: true });
  });

  it('ProjectEditor no longer installs a hook itself; it calls useDevHooks', () => {
    const src = readFileSync(fileURLToPath(new URL('./ProjectEditor.tsx', import.meta.url)), 'utf8');
    for (const name of Object.keys(HOOKS)) expect(src).not.toMatch(new RegExp(`\\.${name}\\s*=`));
    expect(src).toMatch(/useDevHooks\(\{[^}]*devHooks/);
  });
});
