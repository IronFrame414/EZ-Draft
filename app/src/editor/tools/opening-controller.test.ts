// EZD-211b C1, C2 (vault/plans/EZD-211b.md section 4; AC-EZD-211-2, -11, -14, -15, -16, -19). Real model store over the
// P210a fixtures; the canvas handle is a local fake (as drawing-controller.test.ts). C2 wires the real EZD-208a
// selection controller to the drawing controller through the claim seam. Expected values: the plan's rows and their
// cited sources (04 Tool rail; Q-0214; Q-0625 (a); Q-0633 row 2; Q-0640 row 6; Q-0641 row 3; Q-0642 row 1), never the
// code. No browser, no live service.
import { doorSymbol, type OpeningObject, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { HoverMode } from '../plan/hover';
import { createSelectionController, shareReceiver } from '../selection/selection-controller';
import {
  createDrawingController,
  type DrawingHandle,
  type ToolKeyEvent,
} from './drawing-controller';
import { openingsOn } from './model-changes';
import { baseObjects, F1, idSeq, uid, wallsOf, WHEN, WHO, withWalls } from './test-utils/fixtures';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const toModel = (s: Point): Point => ({ x: s.x / PPI, y: -s.y / PPI });

function fakeHandle(onReceiver?: (r: PlanPointerReceiver | null) => void) {
  const receiverCalls: Array<PlanPointerReceiver | null> = [];
  const modes: HoverMode[] = [];
  let touchHit: string | null = null;
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => PPI,
    modelToScreen: toScreen,
    onCameraChange: () => () => {},
    setPointerReceiver: (r) => {
      receiverCalls.push(r);
      onReceiver?.(r);
    },
    setHoverMode: (m) => void modes.push(m),
    getHoveredWallId: () => null,
    wallAt: () => touchHit,
  };
  return {
    handle,
    receiver: () => receiverCalls.at(-1) ?? null,
    receiverCalls,
    setTouchHit: (id: string | null) => void (touchHit = id),
  };
}

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

function ke(key: string): ToolKeyEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: null,
  };
}

// Fixture W: a closed 12 by 10 foot room, side 'right', thickness 4.5; the host is uid(1), (0,0) -> (144,0).
const wObjects = () =>
  withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)], true);

function setup(canEdit = true) {
  const store = createModelStore({ objects: wObjects() });
  const h = fakeHandle();
  const controller = createDrawingController({
    handle: h.handle,
    store,
    viewer: { appUserId: WHO, canEdit },
    onMessage: () => {},
    newId: idSeq(100),
    now: () => WHEN,
  });
  return { store, controller, h };
}

const openingList = (store: { getState(): { objects: ReadonlyMap<string, ObjectValue> } }) =>
  openingsOn(store.getState().objects, F1);
const only = (list: OpeningObject[]): OpeningObject => {
  expect(list).toHaveLength(1);
  return list[0]!;
};

describe('EZD-211b opening controller', () => {
  it('C1 keys D and N, permission, one undo step on placing, Enter and Space', () => {
    const a = setup();
    expect(a.controller.keyDown(ke('d'))).toBe(true);
    expect(a.controller.getUi().tool).toBe('door');
    expect(a.controller.keyDown(ke('n'))).toBe(true);
    expect(a.controller.getUi().tool).toBe('window');

    const b = setup(false);
    expect(b.controller.keyDown(ke('d'))).toBe(false);
    expect(b.controller.getUi().tool).toBeNull();
    expect(b.h.receiverCalls).toEqual([]);

    const { store, controller, h } = setup();
    controller.selectTool('door');
    h.setTouchHit(uid(1));
    const send = (e: PlanPointerEvent) => {
      const r = h.receiver();
      if (!r) throw new Error('no pointer receiver set');
      r(e);
    };
    const before = store.getState().past.length;
    send(ev('move', 60, 2));
    send(ev('down', 60, 2));
    send(ev('up', 60, 2));
    expect(store.getState().past).toHaveLength(before + 1);
    expect(store.getState().past.at(-1)!.patches).toHaveLength(1);
    const door = only(openingList(store));
    expect(door.data.geometry.center.x).toBeCloseTo(60, 9);
    expect(door.data.geometry.center.y).toBeCloseTo(0, 9);
    expect(door.data.attributes.number).toBe(1);
    expect(door.data.attributes.swing).toBe('left');
    expect(controller.getUi().tool).toBe('door');
    expect(controller.getUi().openingWidth).toBe(36);
    expect(controller.getFrame()?.opening?.owned).toBe(true);

    expect(controller.keyDown(ke('Enter'))).toBe(false);

    expect(controller.spaceTap()).toBe(true);
    expect(store.getState().past).toHaveLength(before + 2);
    const flipped = only(openingList(store));
    expect(flipped.data.attributes.swing).toBe('right');
    expect(flipped.data.geometry.center.x).toBeCloseTo(60, 9);
    expect(flipped.data.geometry.center.y).toBeCloseTo(0, 9);
  });

  it('C2 one selected door under Select: arc click flips swing, a moved dot press does not flip, Space flips, the body cycle still reaches the wall', () => {
    let current: PlanPointerReceiver | null = null;
    const slots = shareReceiver((r) => {
      current = r;
    });
    const store = createModelStore({ objects: wObjects() });
    const h = fakeHandle(slots.drawing);
    const drawing = createDrawingController({
      handle: h.handle,
      store,
      viewer: { appUserId: WHO, canEdit: true },
      onMessage: () => {},
      newId: idSeq(100),
      now: () => WHEN,
    });
    const selection = createSelectionController({
      handle: {
        getPixelsPerInch: () => PPI,
        screenToModel: toModel,
        setHoverMode: () => {},
        setHoverPicker: () => {},
        setBodyLookup: () => {},
        setSelectedIds: () => {},
      },
      store,
      drawing,
      setReceiver: slots.selection,
      claim: drawing.claimSelectPointer,
    });
    drawing.attachSelection(selection);
    const send = (e: PlanPointerEvent) => {
      if (current === null) throw new Error('no pointer receiver set');
      current(e);
    };
    const host = () => wallsOf(store.getState().objects).find((w) => w.id === uid(1))!;
    const door = (): OpeningObject => only(openingList(store));
    const symbol = () => doorSymbol(door(), host())!;

    // (1) place a door at (60, 2) as in C1.
    drawing.selectTool('door');
    h.setTouchHit(uid(1));
    send(ev('move', 60, 2));
    send(ev('down', 60, 2));
    send(ev('up', 60, 2));
    const doorId = door().id;
    expect(selection.getUi().ids).toEqual([doorId]);

    // (2) Escape ends the tool and clears the selection.
    selection.keyDown(ke('Escape'));
    expect(drawing.getUi().tool).toBeNull();
    expect(selection.getUi().ids).toEqual([]);

    // (3) select the door: the dot shows, the chips do not.
    selection.select([doorId]);
    expect(selection.getUi().ids).toEqual([doorId]);
    expect(drawing.getFrame()?.opening?.dot).toBe(true);
    expect(drawing.getFrame()?.opening?.chips).toBe(false);

    // (4) a click on the arc flips the swing, in one edit, and the door stays selected.
    const s0 = symbol();
    const mid = ((s0.startAngle + s0.endAngle) / 2) * (Math.PI / 180);
    const arcMid = pt(
      s0.hinge.x + s0.radius * Math.cos(mid),
      s0.hinge.y + s0.radius * Math.sin(mid),
    );
    const past0 = store.getState().past.length;
    send(ev('move', arcMid.x, arcMid.y));
    expect(drawing.getUi().doorTarget).toBe('arc');
    send(ev('down', arcMid.x, arcMid.y));
    send(ev('up', arcMid.x, arcMid.y));
    expect(door().data.attributes.swing).toBe('right');
    expect(store.getState().past).toHaveLength(past0 + 1);
    expect(selection.getUi().ids).toEqual([doorId]);

    // (5) a press on the hinge dot that moves 11 px (+4.125 in x) saves nothing and flips nothing.
    const hinge = symbol().hinge;
    const past1 = store.getState().past.length;
    send(ev('down', hinge.x, hinge.y));
    send(ev('move', hinge.x + 4.125, hinge.y));
    send(ev('up', hinge.x + 4.125, hinge.y));
    expect(store.getState().past).toHaveLength(past1);
    expect(door().data.attributes.hand).toBe('left');

    // (6) Space flips the swing back.
    expect(drawing.spaceTap()).toBe(true);
    expect(door().data.attributes.swing).toBe('left');

    // (7) two clicks on the wall body under the door: the door first, then the wall.
    send(ev('down', 60, -2.25));
    send(ev('up', 60, -2.25));
    expect(selection.getUi().ids).toEqual([doorId]);
    send(ev('down', 60, -2.25));
    send(ev('up', 60, -2.25));
    expect(selection.getUi().ids).toEqual([uid(1)]);
  });

  // Plan D:Select seam: a claimed press ends at `up` or `cancel`, and a selection change ends it too (doorTarget goes
  // null on a selection change). AC-EZD-211-14, -15: only a click on the arc or the dot flips.
  it('C3 a press on the arc cut short by Escape ends there: neither the release nor a later click on the door body flips', () => {
    let current: PlanPointerReceiver | null = null;
    const slots = shareReceiver((r) => {
      current = r;
    });
    const store = createModelStore({ objects: wObjects() });
    const h = fakeHandle(slots.drawing);
    const drawing = createDrawingController({
      handle: h.handle,
      store,
      viewer: { appUserId: WHO, canEdit: true },
      onMessage: () => {},
      newId: idSeq(100),
      now: () => WHEN,
    });
    const selection = createSelectionController({
      handle: {
        getPixelsPerInch: () => PPI,
        screenToModel: toModel,
        setHoverMode: () => {},
        setHoverPicker: () => {},
        setBodyLookup: () => {},
        setSelectedIds: () => {},
      },
      store,
      drawing,
      setReceiver: slots.selection,
      claim: drawing.claimSelectPointer,
    });
    drawing.attachSelection(selection);
    const send = (e: PlanPointerEvent) => {
      if (current === null) throw new Error('no pointer receiver set');
      current(e);
    };
    const host = () => wallsOf(store.getState().objects).find((w) => w.id === uid(1))!;
    const door = (): OpeningObject => only(openingList(store));

    drawing.selectTool('door');
    h.setTouchHit(uid(1));
    send(ev('move', 60, 2));
    send(ev('down', 60, 2));
    send(ev('up', 60, 2));
    const doorId = door().id;
    selection.keyDown(ke('Escape'));
    expect(selection.getUi().ids).toEqual([]);
    const swing = door().data.attributes.swing;
    const arcMid = (): Point => {
      const s = doorSymbol(door(), host())!;
      const a = ((s.startAngle + s.endAngle) / 2) * (Math.PI / 180);
      return pt(s.hinge.x + s.radius * Math.cos(a), s.hinge.y + s.radius * Math.sin(a));
    };
    const past = store.getState().past.length;

    // Press on the arc, Escape clears the selection, then the release: no flip.
    selection.select([doorId]);
    const m = arcMid();
    send(ev('move', m.x, m.y));
    send(ev('down', m.x, m.y));
    selection.keyDown(ke('Escape'));
    expect(selection.getUi().ids).toEqual([]);
    send(ev('up', m.x, m.y));
    expect(door().data.attributes.swing).toBe(swing);
    expect(store.getState().past).toHaveLength(past);

    // Press on the arc, Escape, the door is selected again, then two clicks on the door body: no flip, and the
    // clicks cycle door then wall as P208's pick does.
    selection.select([doorId]);
    send(ev('move', m.x, m.y));
    send(ev('down', m.x, m.y));
    selection.keyDown(ke('Escape'));
    selection.select([doorId]);
    send(ev('down', 60, -2.25));
    send(ev('up', 60, -2.25));
    expect(door().data.attributes.swing).toBe(swing);
    expect(store.getState().past).toHaveLength(past);
    send(ev('down', 60, -2.25));
    send(ev('up', 60, -2.25));
    expect(selection.getUi().ids).toEqual([uid(1)]);
    expect(door().data.attributes.swing).toBe(swing);
    expect(store.getState().past).toHaveLength(past);
  });
});
