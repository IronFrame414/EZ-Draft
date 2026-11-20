// EZD-423 (AC-EZD-423-2; 11 Budgets editor download size; 11 rule 7): the drawing shell the editor entry holds, over
// the real drawing engine loaded through a held promise. Expected values: EZD-210b D2, D3 and D9 (the same keys, the
// four-wall chain closing an 80 sq ft Room 1, the 1/2" gap box), so the shell changes nothing the engine does.
import { describe, expect, it, vi } from 'vitest';
import { roomAreaSqFt, type Point } from '@ezdraft/geometry';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import {
  createDrawingController,
  railMode as engineRailMode,
  type DrawingHandle,
  type ToolKeyEvent,
} from './drawing-controller';
import { createDrawingShell, FIRST_INPUT, type DrawingEngine } from './drawing-shell';
import { railMode, toolForKey } from './rail-mode';
import { baseObjects, idSeq, roomsOf, uid, wallsOf, WHEN, WHO, withWalls } from './test-utils/fixtures';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { effectiveBindings, type ShortcutBindings } from '../../lib/defaults/shortcuts';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });

function ev(kind: PlanPointerEvent['kind'], x: number, y: number): PlanPointerEvent {
  return {
    kind,
    model: pt(x, y),
    screen: toScreen(pt(x, y)),
    pointerType: 'mouse',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

function ke(key: string, over: Partial<ToolKeyEvent> = {}): ToolKeyEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: null,
    ...over,
  };
}

function fakeHandle() {
  const receivers: Array<PlanPointerReceiver | null> = [];
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => PPI,
    modelToScreen: toScreen,
    onCameraChange: () => () => {},
    setPointerReceiver: (r) => void receivers.push(r),
    setHoverMode: () => {},
    getHoveredWallId: () => null,
    wallAt: () => null,
  };
  return { handle, receiver: () => receivers.at(-1) ?? null, receivers };
}

// An event target that records the shell's first-input listeners.
function fakeInputs() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: vi.fn((name: string, l: EventListenerOrEventListenerObject) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(l as () => void);
    }),
    removeEventListener: vi.fn((name: string, l: EventListenerOrEventListenerObject) => {
      listeners.get(name)?.delete(l as () => void);
    }),
    fire: (name: string) => [...(listeners.get(name) ?? [])].forEach((l) => l()),
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

function setup(objects: Map<string, ObjectValue> = baseObjects(), canEdit = true) {
  const store = createModelStore({ objects });
  const h = fakeHandle();
  const inputs = fakeInputs();
  let resolve: (m: DrawingEngine) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<DrawingEngine>((r) => {
        resolve = r;
      }),
  );
  const shell = createDrawingShell(
    {
      handle: h.handle,
      store,
      viewer: { appUserId: WHO, canEdit },
      onMessage: () => {},
      newId: idSeq(100),
      now: () => WHEN,
    },
    { load, inputs },
  );
  const arrive = async () => {
    resolve({ createDrawingController });
    await Promise.resolve();
    await Promise.resolve();
  };
  const send = (e: PlanPointerEvent) => {
    const r = h.receiver();
    if (!r) throw new Error('no pointer receiver set');
    r(e);
  };
  const click = (x: number, y: number) => {
    send(ev('down', x, y));
    send(ev('up', x, y));
  };
  return { store, shell, h, inputs, load, arrive, send, click };
}

const GAP_POINTS = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120), pt(0, 0.5)];

describe('EZD-423 drawing shell', () => {
  it('loads nothing until the first pointer or key input, then loads the engine once and tells no one', async () => {
    const { shell, inputs, load, arrive } = setup();
    expect(load).not.toHaveBeenCalled();
    expect(inputs.count()).toBe(FIRST_INPUT.length);
    const ui0 = shell.getUi();
    expect(ui0.enabled).toBe(true);
    expect(ui0.tool).toBeNull();
    expect(ui0.boxes).toEqual([]);
    expect(shell.getFrame()).toBeNull();
    expect(shell.claimSelectPointer(ev('move', 1, 1))).toBe(false);

    inputs.fire('pointermove');
    inputs.fire('keydown');
    expect(load).toHaveBeenCalledTimes(1);
    expect(inputs.count()).toBe(0);
    let calls = 0;
    shell.subscribe(() => void calls++);
    await arrive();
    // 11 rule 4 (no React commit during a pan): the engine's first ui has the same values, so the same object.
    expect(calls).toBe(0);
    expect(shell.getUi()).toBe(ui0);
    expect(shell.keyDown(ke('w'))).toBe(true);
    expect(calls).toBeGreaterThan(0);
    expect(shell.getUi().tool).toBe('wall');
  });

  it('shows the gap box before the engine is there (EZD-210b D9 values)', () => {
    const { shell } = setup(withWalls(baseObjects(), 1, GAP_POINTS, false));
    const boxes = shell.getUi().boxes;
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.sizeText).toBe('1/2"');
    expect(boxes[0]!.actions).toEqual(['absorb', 'keep']);
  });

  it('a gap box closed by an edit before the load leaves the shell ui', () => {
    const { shell, store } = setup(withWalls(baseObjects(), 1, GAP_POINTS, false));
    let calls = 0;
    shell.subscribe(() => void calls++);
    store.applyEdit([{ id: uid(4), value: null }]);
    expect(calls).toBe(1);
    expect(shell.getUi().boxes).toEqual([]);
  });

  it('W and four clicks made before the engine loads draw the EZD-210b D3 room once it loads', async () => {
    const { shell, store, h, load, arrive, click, send } = setup();
    expect(shell.keyDown(ke('w'))).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    // The plan's presses are held, not handed to the selection.
    expect(h.receiver()).not.toBeNull();
    click(0, 0);
    click(120, 0);
    click(120, 96);
    click(0, 96);
    send(ev('move', 1, 0.5));
    click(1, 0.5);
    expect(wallsOf(store.getState().objects)).toHaveLength(0);
    expect(shell.getUi().tool).toBe('wall');

    await arrive();
    expect(shell.getUi().tool).toBe('wall');
    const w = wallsOf(store.getState().objects);
    expect(w).toHaveLength(4);
    expect(w[3]!.data.geometry.end).toEqual(pt(0, 0));
    const r = roomsOf(store.getState().objects);
    expect(r).toHaveLength(1);
    expect(r[0]!.data.attributes.name).toBe('Room 1');
    expect(roomAreaSqFt(r[0]!.data.geometry.boundary)).toBe(80);
    expect(shell.getUi().lastLength).toBe(96);
  });

  it('keys: only the engine keys turn a tool on before the load (EZD-210b D2)', () => {
    const { shell, load } = setup();
    expect(shell.keyDown(ke('w', { ctrlKey: true }))).toBe(false);
    expect(shell.keyDown(ke('w', { defaultPrevented: true }))).toBe(false);
    expect(shell.keyDown(ke('w', { target: { tagName: 'INPUT' } }))).toBe(false);
    expect(shell.keyDown(ke('x'))).toBe(false);
    expect(shell.keyDown(ke('Escape'))).toBe(false);
    expect(shell.keyDown(ke('Enter'))).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(shell.keyDown(ke('R', { shiftKey: true }))).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('toolForKey agrees with a fresh engine for every letter, with and without Edit model', () => {
    const keys = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const variants: Array<Partial<ToolKeyEvent>> = [
      {},
      { shiftKey: true },
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
    ];
    for (const canEdit of [true, false]) {
      for (const key of [...keys, ...keys.map((k) => k.toUpperCase()), 'Escape', 'Enter']) {
        for (const over of variants) {
          const engine = createDrawingController({
            handle: fakeHandle().handle,
            store: createModelStore({ objects: baseObjects() }),
            viewer: { appUserId: WHO, canEdit },
            onMessage: () => {},
          });
          const e = ke(key, over);
          const handled = engine.keyDown(e);
          const tool = toolForKey(e, canEdit);
          expect({ key, over, canEdit, handled }).toEqual({
            key,
            over,
            canEdit,
            handled: tool !== null,
          });
          expect(engine.getUi().tool).toBe(tool);
        }
      }
    }
  });

  it('a tool asked for before the load is on at once; its calls wait for the engine; Select turns it off again', async () => {
    const { shell, load, arrive, h } = setup();
    shell.selectTool(null);
    expect(load).not.toHaveBeenCalled();
    shell.selectTool('room-rect');
    expect(load).toHaveBeenCalledTimes(1);
    expect(shell.getUi().tool).toBe('room-rect');
    // Esc and Enter are the tool's while it is on.
    expect(shell.keyDown(ke('Enter'))).toBe(true);
    shell.selectTool(null);
    expect(shell.getUi().tool).toBeNull();
    expect(h.receiver()).toBeNull();
    expect(shell.keyDown(ke('Escape'))).toBe(false);
    shell.selectTool('room-rect');
    await arrive();
    expect(shell.getUi().tool).toBe('room-rect');
  });

  it('a viewer without Edit model: disabled, no tool keys but Shift+L and C, nothing held for a plain tool', async () => {
    const { shell, h, arrive } = setup(baseObjects(), false);
    expect(shell.getUi().enabled).toBe(false);
    expect(shell.keyDown(ke('w'))).toBe(false);
    shell.selectTool('wall');
    expect(h.receiver()).toBeNull();
    expect(shell.keyDown(ke('L', { shiftKey: true }))).toBe(true);
    expect(shell.getUi().tool).toBe('measure');
    expect(h.receiver()).not.toBeNull();
    await arrive();
    expect(shell.getUi().tool).toBe('measure');
  });

  it('a pause before the load turns editing off and the engine starts paused', async () => {
    const { shell, arrive, store } = setup();
    shell.keyDown(ke('w'));
    shell.pause();
    expect(shell.getUi().enabled).toBe(false);
    expect(shell.getUi().tool).toBeNull();
    await arrive();
    expect(shell.getUi().enabled).toBe(false);
    expect(shell.getUi().tool).toBeNull();
    expect(wallsOf(store.getState().objects)).toHaveLength(0);
  });

  it('a gap box shown before the load selects the last wall; frames and ui follow the engine after', async () => {
    const { shell, arrive, inputs } = setup(withWalls(baseObjects(), 1, GAP_POINTS, false));
    let ids: readonly string[] = [];
    const listeners = new Set<() => void>();
    const link = {
      getUi: () => ({ ids, selectMore: false }),
      select: (next: readonly string[]) => {
        ids = next;
        listeners.forEach((l) => l());
      },
      subscribe: (l: () => void) => {
        listeners.add(l);
        return () => void listeners.delete(l);
      },
    };
    shell.attachSelection(link);
    // The press on the gap pill is the page's first input.
    inputs.fire('pointerdown');
    shell.showGap(shell.getUi().boxes[0]!.wallIds);
    expect(ids).toEqual([uid(4)]);
    const frames: unknown[] = [];
    shell.onFrame((f) => frames.push(f));
    await arrive();
    // The engine draws the selected wall's frame at once (its chips and handles).
    expect(frames.length).toBeGreaterThan(0);
    expect(shell.getFrame()?.selection).toBeTruthy();
  });

  it('dispose before the load: no engine, no receiver, no listeners', async () => {
    const { shell, h, inputs, arrive, store } = setup();
    shell.keyDown(ke('w'));
    shell.dispose();
    expect(h.receiver()).toBeNull();
    expect(inputs.count()).toBe(0);
    const receivers = h.receivers.length;
    await arrive();
    // No engine was made: it would set its pointer receiver for the held W.
    expect(h.receivers).toHaveLength(receivers);
    expect(shell.keyDown(ke('r'))).toBe(false);
    expect(wallsOf(store.getState().objects)).toHaveLength(0);
  });

  it('a failed load is tried again on the next input', async () => {
    const { store } = setup();
    const inputs = fakeInputs();
    const load = vi
      .fn<() => Promise<DrawingEngine>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ createDrawingController });
    const shell = createDrawingShell(
      {
        handle: fakeHandle().handle,
        store,
        viewer: { appUserId: WHO, canEdit: true },
        onMessage: () => {},
      },
      { load, inputs },
    );
    inputs.fire('pointerdown');
    await Promise.resolve();
    await Promise.resolve();
    expect(inputs.count()).toBe(FIRST_INPUT.length);
    inputs.fire('pointerdown');
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    expect(shell.keyDown(ke('w'))).toBe(true);
    expect(shell.getUi().tool).toBe('wall');
  });

  it('a key event with its fields on the prototype, as a DOM KeyboardEvent has them, still reaches the engine', async () => {
    const { shell, arrive } = setup();
    class FakeKey {
      get key() {
        return 'w';
      }
      get ctrlKey() {
        return false;
      }
      get metaKey() {
        return false;
      }
      get altKey() {
        return false;
      }
      get shiftKey() {
        return false;
      }
      get defaultPrevented() {
        return false;
      }
      get target() {
        return null;
      }
    }
    expect(shell.keyDown(new FakeKey())).toBe(true);
    await arrive();
    expect(shell.getUi().tool).toBe('wall');
  });

  it('railMode is the engine export unchanged', () => {
    expect(engineRailMode).toBe(railMode);
  });
});

// EZD-222 (AC-EZD-222-1 "Rebinding the Wall key changes the tool shortcut"; S15d Keyboard shortcuts): the key map in
// force is read on every key, before and after the engine loads. Wall moved to B: B turns Wall on, W does not.
describe('EZD-222 rebound tool keys', () => {
  function rebound(keys: () => ShortcutBindings) {
    const store = createModelStore({ objects: baseObjects() });
    const h = fakeHandle();
    let resolve: (m: DrawingEngine) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<DrawingEngine>((r) => {
          resolve = r;
        }),
    );
    const shell = createDrawingShell(
      {
        handle: h.handle,
        store,
        viewer: { appUserId: WHO, canEdit: true },
        onMessage: () => {},
        newId: idSeq(100),
        now: () => WHEN,
        keys,
      },
      { load, inputs: fakeInputs() },
    );
    const arrive = async () => {
      resolve({ createDrawingController });
      await Promise.resolve();
      await Promise.resolve();
    };
    return { shell, load, arrive };
  }

  it('toolForKey reads the given map', () => {
    const b = effectiveBindings({ wall: 'B' });
    expect(toolForKey(ke('b'), true, b)).toBe('wall');
    expect(toolForKey(ke('w'), true, b)).toBeNull();
    expect(toolForKey(ke('w'), true)).toBe('wall');
    // Measure still needs no Edit model under its own key.
    expect(toolForKey(ke('L', { shiftKey: true }), false, b)).toBe('measure');
  });

  it('before the load: W is no tool key, B asks for Wall', () => {
    const { shell, load } = rebound(() => effectiveBindings({ wall: 'B' }));
    expect(shell.keyDown(ke('w'))).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(shell.keyDown(ke('b'))).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('after the load the engine reads the map live: a change applies on the next key', async () => {
    let map = effectiveBindings({ wall: 'B' });
    const { shell, arrive } = rebound(() => map);
    shell.selectTool('move');
    await arrive();
    expect(shell.getUi().tool).toBe('move');
    shell.keyDown(ke('Escape'));
    expect(shell.getUi().tool).toBeNull();
    expect(shell.keyDown(ke('w'))).toBe(false);
    expect(shell.getUi().tool).toBeNull();
    expect(shell.keyDown(ke('b'))).toBe(true);
    expect(shell.getUi().tool).toBe('wall');
    shell.keyDown(ke('Escape'));
    map = effectiveBindings({});
    expect(shell.keyDown(ke('b'))).toBe(false);
    expect(shell.keyDown(ke('w'))).toBe(true);
    expect(shell.getUi().tool).toBe('wall');
  });
});
