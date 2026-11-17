// EZD-218 AC-EZD-218-3, AC-EZD-218-5: rooms become selectable on the canvas, and a locked layer's objects cannot be
// selected by click, box select or Select all. Real model store and selection controller; the canvas handle and the
// drawing controller are local fakes. Expected values from the spec, never the code: S03 Canvas "Click picks the
// smallest object under the cursor; repeated clicks at the same spot cycle outward", "Drag on empty space … Box
// select … Respects layer filter", "Ctrl/Cmd+A … visible, selectable layers"; Q-0677 (a) (a press with no wall or
// opening under it starts a box, even inside a room; rooms never move); Q-0678 (a) (a locked layer's objects leave
// the selection at once); P208a R5 (10 px capture: 3.75 in at 8/3 px per inch).
// Fixture: a closed 144 × 120 room uid(9) with its walls uid(1)..uid(4) outside it (thickness to the right of each
// wall walking the boundary counter-clockwise), all Existing.
import type { ObjectStatus, Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { eyeDefaults, type PhaseEyes } from '../../lib/plan/phase-view';
import { createLayerSetting, type LayerPhase } from '../layers/layer-setting';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { baseObjects, roomValue, uid, withWalls } from '../tools/test-utils/fixtures';
import type { DrawingUi } from '../tools/drawing-controller';
import { createSelectionController, type SelectionDeps } from './selection-controller';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const toModel = (s: Point): Point => ({ x: s.x / PPI, y: -s.y / PPI });
const ROOM = uid(9);
const BOUNDARY = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)];

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

function fakePhase(): LayerPhase {
  let eyes: PhaseEyes = eyeDefaults('existing');
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => ({ eyes }),
    version: () => version,
    setEye(status: ObjectStatus, on: boolean) {
      eyes = { ...eyes, [status]: on };
      version += 1;
      for (const l of [...listeners]) l();
    },
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

function setup() {
  const objects = withWalls(baseObjects(), 1, BOUNDARY, true, 'right');
  objects.set(ROOM, roomValue(BOUNDARY, 'Kitchen', null));
  const store = createModelStore({ objects });
  const layers = createLayerSetting(fakePhase());
  let receiver: PlanPointerReceiver | null = null;
  let outline: ((id: string) => readonly Point[] | null) | null = null;
  const starts: Array<readonly string[]> = [];
  const handle: SelectionDeps['handle'] = {
    getPixelsPerInch: () => PPI,
    screenToModel: toModel,
    setHoverMode: () => {},
    setHoverPicker: () => {},
    setBodyLookup: () => {},
    setOutlineLookup: (l) => void (outline = l),
    setSelectedIds: () => {},
  };
  const drawing: NonNullable<SelectionDeps['drawing']> = {
    getUi: (): DrawingUi => ({
      enabled: true,
      tool: null,
      pick: null,
      boxes: [],
      gapMessage: null,
      lastLength: null,
      doorTarget: null,
      openingWidth: null,
      entry: null,
      fixtureChoice: null,
      utilities: null,
    }),
    keyDown: () => false,
    selectTool: () => {},
    startDrag: (ids) => void starts.push(ids),
    dragPointer: () => {},
  };
  const selection = createSelectionController({
    handle,
    store,
    drawing,
    setReceiver: (r) => void (receiver = r),
    phase: layers.selectable,
  });
  const send = (e: PlanPointerEvent) => receiver?.(e);
  const click = (x: number, y: number) => {
    send(ev('down', x, y));
    send(ev('up', x, y));
  };
  return { selection, layers, send, click, starts, outline: () => outline };
}

describe('EZD-218 rooms on the canvas', () => {
  it('AC-5 a click inside a room away from its walls selects the room', () => {
    const s = setup();
    s.click(72, 60);
    expect(s.selection.getUi().ids).toEqual([ROOM]);
    expect(s.outline()?.(ROOM)).toEqual(BOUNDARY);
  });

  it('AC-5 a click within 10 px of a wall from inside the room takes the wall; a second click cycles to the room', () => {
    const s = setup();
    s.click(72, 2);
    expect(s.selection.getUi().ids).toEqual([uid(1)]);
    s.click(72, 2);
    expect(s.selection.getUi().ids).toEqual([ROOM]);
  });

  it('Q-0677 (a) a drag from inside a room starts a box, and the room is never dragged', () => {
    const s = setup();
    s.send(ev('down', 130, 60));
    s.send(ev('move', 20, 100));
    s.send(ev('up', 20, 100));
    expect(s.starts).toEqual([]);
    // Right to left is a touch box; the box lies inside the room and away from every wall.
    expect(s.selection.getUi().ids).toEqual([ROOM]);
  });

  it('AC-5 Select all takes the room with the walls', () => {
    const s = setup();
    s.selection.selectAll();
    expect([...s.selection.getUi().ids].sort()).toEqual(
      [uid(1), uid(2), uid(3), uid(4), ROOM].sort(),
    );
  });

  it('AC-3 with Rooms locked the room is not taken by click, box or Select all; walls still are', () => {
    const s = setup();
    s.layers.setLock('rooms', true);
    s.click(72, 60);
    expect(s.selection.getUi().ids).toEqual([]);
    s.send(ev('down', 130, 60));
    s.send(ev('move', 20, 100));
    s.send(ev('up', 20, 100));
    expect(s.selection.getUi().ids).toEqual([]);
    s.selection.selectAll();
    expect([...s.selection.getUi().ids].sort()).toEqual([uid(1), uid(2), uid(3), uid(4)].sort());
    s.selection.select([ROOM]);
    expect(s.selection.getUi().ids).toEqual([]);
  });

  it('AC-3 with Existing locked nothing Existing is taken, the room included', () => {
    const s = setup();
    s.layers.setLock('existing', true);
    s.click(72, 2);
    expect(s.selection.getUi().ids).toEqual([]);
    s.selection.selectAll();
    expect(s.selection.getUi().ids).toEqual([]);
  });

  it('Q-0678 (a) locking a layer drops its selected objects at once; unlocking makes them selectable again', () => {
    const s = setup();
    s.selection.selectAll();
    s.layers.setLock('rooms', true);
    expect(s.selection.getUi().ids).not.toContain(ROOM);
    expect(s.selection.getUi().ids).toHaveLength(4);
    s.layers.setLock('rooms', false);
    s.click(72, 60);
    expect(s.selection.getUi().ids).toEqual([ROOM]);
  });

  it('AC-2 with the Rooms eye off the room is not picked', () => {
    const s = setup();
    s.layers.setRoomsEye(false);
    s.click(72, 60);
    expect(s.selection.getUi().ids).toEqual([]);
  });
});
