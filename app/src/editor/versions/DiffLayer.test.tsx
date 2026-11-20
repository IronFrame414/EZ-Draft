// EZD-139 L1-L6 (AC-EZD-139-1, -3, -4). Expected values from examples 09p "Visual diff" rows 1-4 (wall 4 moved from
// x = 0 to x = 6" is changed; wall 5 in the old version only is removed since; wall 9 in the working copy only is
// added since and not drawn; identical shows nothing) and Q-0703 (changed: amber outline; removed since: red dashed
// outline; added since: not drawn). The canvas shows the old version, so the outline sits on the old wall at x = 0.
// The layer's writes are checked on fake elements and a fake handle, since the app's unit tests have no DOM
// (vault/build/assumptions.md EZD-105b, EZD-5604b).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { PlanCanvasHandle } from '../plan/controller';
import { baseObjects, uid, withWalls } from '../tools/test-utils/fixtures';
import { els, render } from '../assistant/preview-markup.test-helpers';
import { bindDiffWrites, DiffLayer, diffGeometry, diffPaths } from './DiffLayer';
import { versionDiff } from './version-diff';
import type { VersionView, VersionViewState } from './version-view';

const wallAt = (objects: Map<string, ObjectValue>, n: number, x: number) =>
  withWalls(
    objects,
    n,
    [
      { x, y: 0 },
      { x, y: 96 },
    ],
    false,
  );

const id = (p: Point) => p;

// Every x of every point in an SVG path "M x y L x y ...".
const xs = (d: string): number[] => {
  const nums = d.replace(/[MLZ]/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number);
  return nums.filter((_, i) => i % 2 === 0);
};

type Listener = (view: never) => void;
function fakeHandle(toScreen: (p: Point) => Point) {
  const h = {
    toScreen,
    listeners: new Set<Listener>(),
    modelToScreen: (p: Point) => h.toScreen(p),
    onCameraChange(fn: Listener) {
      h.listeners.add(fn);
      return () => h.listeners.delete(fn);
    },
  };
  return h;
}

function fakeEls() {
  const attrs: Record<string, string> = {};
  const el = (name: string) => ({
    setAttribute: (k: string, v: string) => {
      if (k === 'd') attrs[name] = v;
    },
    removeAttribute: () => {},
  });
  return { els: { changed: el('changed'), removed: el('removed') }, attrs };
}

function fakeView(state: Partial<VersionViewState>): VersionView {
  const s: VersionViewState = {
    viewing: null,
    opening: null,
    failed: false,
    objects: null,
    diff: null,
    showChanges: true,
    ...state,
  };
  return {
    getState: () => s,
    subscribe: () => () => {},
    open: async () => {},
    back: () => {},
    setShowChanges: () => {},
    dispose: () => {},
  };
}

describe('EZD-139 DiffLayer', () => {
  it('L1 row 1: a moved wall gets an outline at its old place, nothing removed (AC-EZD-139-1)', () => {
    const old = wallAt(baseObjects(), 4, 0);
    const working = wallAt(baseObjects(), 4, 6);
    const p = diffPaths(diffGeometry(old, versionDiff(old, working), null), id);
    expect(p.changed).not.toBe('');
    expect(p.removed).toBe('');
    // The old wall: its drawn face runs along x = 0, not along the new place x = 6".
    expect(xs(p.changed)).toContain(0);
    expect(xs(p.changed)).not.toContain(6);
  });

  it('L2 row 2: a wall removed since gets the removed outline only', () => {
    const old = wallAt(baseObjects(), 5, 0);
    const p = diffPaths(diffGeometry(old, versionDiff(old, baseObjects()), null), id);
    expect(p.changed).toBe('');
    expect(p.removed).not.toBe('');
    expect(xs(p.removed)).toContain(0);
  });

  it('L3 row 3: a wall added since is not drawn', () => {
    const old = baseObjects();
    const working = wallAt(baseObjects(), 9, 0);
    expect(diffPaths(diffGeometry(old, versionDiff(old, working), null), id)).toEqual({
      changed: '',
      removed: '',
    });
  });

  it('L4 row 4: an identical version draws no highlight (AC-EZD-139-3)', () => {
    const old = wallAt(baseObjects(), 4, 0);
    const working = wallAt(baseObjects(), 4, 0);
    expect(diffPaths(diffGeometry(old, versionDiff(old, working), null), id)).toEqual({
      changed: '',
      removed: '',
    });
  });

  it('L5 writes at mount and again on a camera change', () => {
    const old = wallAt(wallAt(baseObjects(), 4, 0), 5, 48);
    const working = wallAt(baseObjects(), 4, 6);
    const g = diffGeometry(old, versionDiff(old, working), null);
    const handle = fakeHandle(id);
    const { els: fake, attrs } = fakeEls();
    const off = bindDiffWrites(handle, fake, g);
    expect(attrs.changed).toBe(diffPaths(g, id).changed);
    expect(attrs.removed).toBe(diffPaths(g, id).removed);
    const twice = (p: Point) => ({ x: p.x * 2, y: p.y * 2 });
    handle.toScreen = twice;
    for (const l of handle.listeners) l(undefined as never);
    expect(attrs.changed).toBe(diffPaths(g, twice).changed);
    off();
    expect(handle.listeners.size).toBe(0);
  });

  it('L6 the look follows Q-0703: amber outline for changed, red dashed for removed; hidden with Show changes off', () => {
    const old = wallAt(baseObjects(), 4, 0);
    const working = wallAt(baseObjects(), 4, 6);
    const handle = fakeHandle(id) as unknown as PlanCanvasHandle;
    const viewing = { id: 'v1' } as VersionViewState['viewing'];
    const on = render(
      <DiffLayer
        view={fakeView({ viewing, objects: old, diff: versionDiff(old, working) })}
        handle={handle}
      />,
    );
    expect(els(on, 'diff-layer')).toHaveLength(1);
    expect(els(on, 'diff-changed')).toHaveLength(1);
    expect(els(on, 'diff-removed')).toHaveLength(1);
    const off = render(
      <DiffLayer
        view={fakeView({
          viewing,
          objects: old,
          diff: versionDiff(old, working),
          showChanges: false,
        })}
        handle={handle}
      />,
    );
    expect(els(off, 'diff-layer')).toHaveLength(0);
    expect(els(render(<DiffLayer view={fakeView({})} handle={handle} />), 'diff-layer')).toHaveLength(0);

    const css = readFileSync(
      fileURLToPath(new URL('./VersionsPanel.module.css', import.meta.url)),
      'utf8',
    );
    const rule = (name: string) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))![1]!;
    expect(rule('diffChanged')).toContain('stroke: var(--ez-amber);');
    expect(rule('diffChanged')).toContain('fill: none;');
    expect(rule('diffChanged')).not.toContain('dasharray');
    expect(rule('diffRemoved')).toContain('stroke: var(--ez-red);');
    expect(rule('diffRemoved')).toContain('fill: none;');
    expect(rule('diffRemoved')).toMatch(/stroke-dasharray: \d/);
  });
});
